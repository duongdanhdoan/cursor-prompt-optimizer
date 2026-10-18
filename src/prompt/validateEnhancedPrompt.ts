import type { MemoryHit } from "../memory/MemoryAdapter";
import { estimateTokens } from "../memory/selectContext";
import { analyzePrompt, subjectIdentifiers, type PromptAnalysis, type TaskType } from "./analyzePrompt";
import {
  CONTRACT_SECTION_IDS,
  type ContractSectionId,
  type ParsedTaskContract,
  type TaskContract,
  parseTaskContract,
} from "./taskContract";

export type ValidationWarning = {
  code:
    | "section_incomplete"
    | "section_empty"
    | "section_order"
    | "extra_heading"
    | "duplication"
    | "intent_loss"
    | "invented_path"
    | "memory_dump"
    | "evidence_as_fact"
    | "verbose"
    | "scope_expansion"
    | "read_only_violation"
    | "invented_issue"
    | "topic_substitution";
  message: string;
};

export type EnhancedPromptValidation = {
  parsed?: ParsedTaskContract;
  warnings: ValidationWarning[];
};

const FILE_PATH_RE = /(?:[A-Za-z0-9_.-]+\/)+[A-Za-z0-9_.-]+\.[A-Za-z0-9]+/g;
const FACT_CLAIM_RE =
  /\b(root cause is|nguyên nhân là|caused by|the bug is in|definitely caused)\b/i;
const UNCERTAINTY_RE = /\b(unverified|unknown|not verified|chưa xác minh|assumption|hypothesis|giả thuyết)\b/i;

export function validateEnhancedPrompt(input: {
  original: string;
  enhanced: string;
  analysis: PromptAnalysis;
  memoryHits?: MemoryHit[];
  taskType?: TaskType;
}): EnhancedPromptValidation {
  const parsed = parseTaskContract(input.enhanced);
  const warnings: ValidationWarning[] = [];
  const memoryHits = input.memoryHits ?? [];
  const taskType = input.taskType ?? input.analysis.taskType;

  if (!parsed) {
    warnings.push({
      code: "section_incomplete",
      message: "Enhanced prompt is missing the five required section headings.",
    });
    warnings.push(...topicSubstitutionWarnings(input.original, input.enhanced, input.analysis));
    return { warnings };
  }

  if (parsed.missing.length > 0) {
    warnings.push({
      code: "section_incomplete",
      message: `Missing sections: ${parsed.missing.map(sectionLabel).join(", ")}.`,
    });
  }
  if (parsed.empty.length > 0) {
    warnings.push({
      code: "section_empty",
      message: `Empty sections: ${parsed.empty.map(sectionLabel).join(", ")}.`,
    });
  }
  if (!parsed.ordered) {
    warnings.push({
      code: "section_order",
      message: "Sections are out of order. Use Context, Objective, Steps, Output, Constraints and Rules.",
    });
  }
  if (parsed.extraHeadings.length > 0) {
    warnings.push({
      code: "extra_heading",
      message: `Extra headings should be folded into the five sections: ${parsed.extraHeadings.join(", ")}.`,
    });
  }

  warnings.push(...duplicationWarnings(parsed.contract));
  warnings.push(...intentWarnings(input.original, input.enhanced, input.analysis));
  warnings.push(...inventedPathWarnings(input.original, input.enhanced, memoryHits));
  warnings.push(...memoryDumpWarnings(parsed.contract.context, memoryHits));
  warnings.push(...evidenceWarnings(parsed.contract.context, taskType));
  warnings.push(...verboseWarning(input.original, input.enhanced, taskType));
  warnings.push(...scopeExpansionWarnings(input.original, parsed.contract, taskType));
  warnings.push(...readOnlyWarnings(input.original, parsed.contract, input.analysis));
  warnings.push(...inventedIssueWarnings(input.original, input.enhanced, input.analysis));
  warnings.push(...topicSubstitutionWarnings(input.original, input.enhanced, input.analysis));

  return { parsed, warnings };
}

function sectionLabel(id: ContractSectionId): string {
  switch (id) {
    case "context":
      return "Context";
    case "objective":
      return "Objective";
    case "steps":
      return "Steps";
    case "output":
      return "Output";
    case "constraints":
      return "Constraints and Rules";
  }
}

function duplicationWarnings(contract: TaskContract): ValidationWarning[] {
  const sentencesBySection = new Map<ContractSectionId, string[]>();
  for (const id of CONTRACT_SECTION_IDS) {
    sentencesBySection.set(id, extractSentences(contract[id]));
  }

  const duplicates: string[] = [];
  for (let i = 0; i < CONTRACT_SECTION_IDS.length; i += 1) {
    const leftId = CONTRACT_SECTION_IDS[i];
    const left = new Set(sentencesBySection.get(leftId));
    for (let j = i + 1; j < CONTRACT_SECTION_IDS.length; j += 1) {
      const rightId = CONTRACT_SECTION_IDS[j];
      for (const sentence of sentencesBySection.get(rightId) ?? []) {
        if (left.has(sentence) && !duplicates.includes(sentence)) {
          duplicates.push(sentence);
        }
      }
    }
  }

  if (duplicates.length === 0) {
    return [];
  }
  return [
    {
      code: "duplication",
      message: `The same instruction appears in more than one section: ${duplicates.slice(0, 2).join(" | ")}`,
    },
  ];
}

function intentWarnings(
  original: string,
  enhanced: string,
  analysis: PromptAnalysis,
): ValidationWarning[] {
  const haystack = normalize(enhanced);
  const missing: string[] = [];

  for (const constraint of analysis.constraints) {
    if (!containsPhrase(haystack, constraint)) {
      missing.push(constraint);
    }
  }
  for (const path of analysis.filePaths) {
    if (!haystack.includes(normalize(path))) {
      missing.push(path);
    }
  }
  for (const identifier of analysis.identifiers) {
    if (identifier.length < 8) {
      continue;
    }
    if (!haystack.includes(normalize(identifier))) {
      missing.push(identifier);
    }
  }

  const negative = extractNegativeInstructions(original);
  for (const instruction of negative) {
    if (!containsPhrase(haystack, instruction)) {
      missing.push(instruction);
    }
  }

  if (missing.length === 0) {
    return [];
  }
  return [
    {
      code: "intent_loss",
      message: `Original requirement may be missing: ${missing.slice(0, 3).join("; ")}.`,
    },
  ];
}

function inventedPathWarnings(
  original: string,
  enhanced: string,
  memoryHits: MemoryHit[],
): ValidationWarning[] {
  const allowed = new Set(
    [...(original.match(FILE_PATH_RE) ?? []), ...memoryPaths(memoryHits)].map(normalize),
  );
  const invented = unique(
    (enhanced.match(FILE_PATH_RE) ?? []).filter((path) => !allowed.has(normalize(path))),
  );
  if (invented.length === 0) {
    return [];
  }
  return [
    {
      code: "invented_path",
      message: `Prompt mentions file paths that were not in the original request or retrieved memory: ${invented.slice(0, 3).join(", ")}.`,
    },
  ];
}

function memoryDumpWarnings(context: string, memoryHits: MemoryHit[]): ValidationWarning[] {
  const dumped = memoryHits.filter((hit) => {
    const chunk = hit.content.trim();
    return chunk.length >= 80 && context.includes(chunk.slice(0, 80));
  });
  if (dumped.length === 0) {
    return [];
  }
  return [
    {
      code: "memory_dump",
      message: "Context pastes retrieved memory instead of citing relevant items with source.",
    },
  ];
}

function evidenceWarnings(context: string, taskType: TaskType): ValidationWarning[] {
  if (taskType !== "bug") {
    return [];
  }
  if (FACT_CLAIM_RE.test(context) && !UNCERTAINTY_RE.test(context)) {
    return [
      {
        code: "evidence_as_fact",
        message: "Context states a root cause as fact without marking it unverified.",
      },
    ];
  }
  return [];
}

function verboseWarning(original: string, enhanced: string, taskType: TaskType): ValidationWarning[] {
  if (taskType !== "ui" && taskType !== "docs" && taskType !== "explain") {
    return [];
  }
  const originalTokens = estimateTokens(original);
  const enhancedTokens = estimateTokens(enhanced);
  if (enhancedTokens > Math.max(450, originalTokens * 3)) {
    return [
      {
        code: "verbose",
        message: "Enhanced prompt is much longer than the original for a simple task.",
      },
    ];
  }
  return [];
}

const SCOPE_DIMENSIONS = [
  {
    id: "lifecycle",
    extra: /\b(when it is called|call sites?|lifecycle|entry points? of)\b/i,
    original: /\b(when it is called|call sites?|lifecycle|được gọi|khi nào được gọi)\b/i,
  },
  {
    id: "error_handling",
    extra: /\b(how it handles errors|error handling|handles errors)\b/i,
    original: /\b(error handling|handles errors|xử lý lỗi|bắt lỗi)\b/i,
  },
  {
    id: "performance",
    extra: /\b(performance analysis|latency analysis|optimize speed)\b/i,
    original: /\b(performance|latency|slow|jank|tối ưu)\b/i,
  },
  {
    id: "security",
    extra: /\b(security review|vulnerability scan)\b/i,
    original: /\b(security|xss|bảo mật|vulnerability)\b/i,
  },
  {
    id: "testing",
    extra: /\b(write tests|add tests|increase coverage|unit tests)\b/i,
    original: /\b(test|kiểm thử|coverage)\b/i,
  },
  {
    id: "redesign",
    extra: /\b(redesign|rewrite the|refactor the entire|broader redesign)\b/i,
    original: /\b(redesign|rewrite|refactor entire)\b/i,
  },
];

const IMPLEMENTATION_STEP_RE =
  /\b(apply the (fix|change|patch)|implement the fix|change the code|edit the file|write the patch)\b/i;

const READ_ONLY_RE =
  /\b(do not modify|don't modify|do not change any files|không được sửa|không modify|read-only)\b/i;

const HEADING_WORDS = new Set(["context", "objective", "steps", "output", "constraints", "rules"]);

function looksLikeCodeSymbol(identifier: string): boolean {
  if (identifier.startsWith("_") || identifier.includes("_")) {
    return true;
  }
  return /[a-z][A-Z]/.test(identifier) || /[A-Z][a-z]+[A-Z]/.test(identifier);
}

function scopeExpansionWarnings(
  original: string,
  contract: TaskContract,
  taskType: TaskType,
): ValidationWarning[] {
  const haystack = `${contract.objective}\n${contract.steps}\n${contract.output}`;
  const added = SCOPE_DIMENSIONS.filter(
    (dimension) => dimension.extra.test(haystack) && !dimension.original.test(original),
  ).map((dimension) => dimension.id);
  if (taskType === "explain" && IMPLEMENTATION_STEP_RE.test(`${contract.objective}\n${contract.steps}`)) {
    added.push("implementation");
  }
  if (added.length === 0) {
    return [];
  }
  return [
    {
      code: "scope_expansion",
      message: `Enhanced prompt adds work the original did not ask for: ${added.join(", ")}.`,
    },
  ];
}

function readOnlyWarnings(
  original: string,
  contract: TaskContract,
  analysis: PromptAnalysis,
): ValidationWarning[] {
  const source = `${original}\n${analysis.constraints.join("\n")}`;
  if (!READ_ONLY_RE.test(source)) {
    return [];
  }
  if (!IMPLEMENTATION_STEP_RE.test(`${contract.objective}\n${contract.steps}`)) {
    return [];
  }
  return [
    {
      code: "read_only_violation",
      message: "Original request is read-only, but the enhanced prompt includes code-changing steps.",
    },
  ];
}

function inventedIssueWarnings(
  original: string,
  enhanced: string,
  analysis: PromptAnalysis,
): ValidationWarning[] {
  if (!analysis.vague) {
    return [];
  }
  const extra = analyzePrompt(enhanced)
    .identifiers.filter((identifier) => identifier.length >= 8)
    .filter((identifier) => looksLikeCodeSymbol(identifier))
    .filter((identifier) => !HEADING_WORDS.has(identifier.toLowerCase()))
    .filter((identifier) => !normalize(original).includes(normalize(identifier)));
  if (extra.length === 0) {
    return [];
  }
  return [
    {
      code: "invented_issue",
      message: `Vague original request, but the enhanced prompt names unverified symbols: ${extra.slice(0, 3).join(", ")}.`,
    },
  ];
}

function topicSubstitutionWarnings(
  original: string,
  enhanced: string,
  analysis: PromptAnalysis,
): ValidationWarning[] {
  const required = subjectIdentifiers(analysis);
  if (required.length === 0) {
    return [];
  }
  const haystack = enhanced.toLowerCase();
  if (required.some((identifier) => haystack.includes(identifier.toLowerCase()))) {
    return [];
  }
  const extra = analyzePrompt(enhanced)
    .identifiers.filter((identifier) => looksLikeCodeSymbol(identifier))
    .filter((identifier) => !normalize(original).includes(normalize(identifier)));
  if (extra.length === 0) {
    return [];
  }
  return [
    {
      code: "topic_substitution",
      message: `Enhanced prompt replaced the original subject (${required.slice(0, 3).join(", ")}) with ${extra.slice(0, 3).join(", ")}.`,
    },
  ];
}

function extractSentences(text: string): string[] {
  return text
    .split(/(?<=[.!?])\s+|\n+/)
    .map((part) => normalize(part))
    .filter((part) => part.length >= 40);
}

function extractNegativeInstructions(original: string): string[] {
  return original
    .split(/\n|(?<=[.!?])\s+/)
    .map((line) => line.trim())
    .filter((line) =>
      /^(?:don't|do not|must not|never|không được|đừng|khong duoc)\b/i.test(line),
    )
    .filter((line) => line.length >= 12);
}

const WEAK_TOKENS = new Set([
  "don't",
  "do",
  "not",
  "must",
  "never",
  "only",
  "without",
  "không",
  "được",
  "đừng",
  "those",
  "this",
  "that",
  "with",
  "from",
  "the",
  "and",
]);

function containsPhrase(haystack: string, phrase: string): boolean {
  const normalized = normalize(phrase);
  if (!normalized || haystack.includes(normalized)) {
    return true;
  }
  const tokens = normalized.split(" ").filter(Boolean);
  const content = tokens.filter((token) => token.length >= 4 && !WEAK_TOKENS.has(token));
  const last = tokens[tokens.length - 1] ?? "";
  if (
    last.length >= 3 &&
    haystack.includes(last) &&
    content.some((token) => token !== last && haystack.includes(token))
  ) {
    return true;
  }
  if (content.length >= 3) {
    return content.filter((token) => haystack.includes(token)).length >= 2;
  }
  return false;
}

function memoryPaths(hits: MemoryHit[]): string[] {
  const values: string[] = [];
  for (const hit of hits) {
    if (hit.source) {
      values.push(hit.source);
    }
    values.push(...(hit.content.match(FILE_PATH_RE) ?? []));
  }
  return values;
}

function normalize(value: string): string {
  return value.toLowerCase().replace(/\s+/g, " ").trim();
}

function unique(values: string[]): string[] {
  return [...new Set(values)];
}
