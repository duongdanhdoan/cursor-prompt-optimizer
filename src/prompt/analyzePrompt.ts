export type TaskType =
  | "bug"
  | "feature"
  | "refactor"
  | "ui"
  | "test"
  | "docs"
  | "other";

export type PromptAnalysis = {
  taskType: TaskType;
  identifiers: string[];
  modules: string[];
  filePaths: string[];
  errorMessages: string[];
  constraints: string[];
  searchQuery: string;
};

const TASK_PATTERNS: Array<{ type: TaskType; pattern: RegExp; weight: number }> = [
  {
    type: "bug",
    weight: 4,
    pattern:
      /\b(bug|lỗi|crash|exception|stack trace|null pointer|undefined is not|không hoạt động|broken|fix|hotfix|sửa lỗi|regression|fails?|error|panic|segfault)\b/i,
  },
  {
    type: "test",
    weight: 3,
    pattern: /\b(unit test|integration test|kiểm thử|coverage|spec|assert|jest|pytest|golden test)\b/i,
  },
  {
    type: "ui",
    weight: 3,
    pattern:
      /\b(ui|ux|padding|margin|spacing|layout|css|stylesheet|giao diện|font|color|button|screen|pixel|alignment|responsive)\b/i,
  },
  {
    type: "refactor",
    weight: 3,
    pattern: /\b(refactor|tái cấu trúc|clean up|cleanup|rename|extract|restructure|simplify)\b/i,
  },
  {
    type: "docs",
    weight: 2,
    pattern: /\b(docs|documentation|readme|comment|jsdoc|chú thích)\b/i,
  },
  {
    type: "feature",
    weight: 2,
    pattern: /\b(feature|tính năng|implement|thêm|add support|new endpoint|new screen)\b/i,
  },
];

const STOPWORDS = new Set(
  [
    "the",
    "and",
    "for",
    "with",
    "this",
    "that",
    "from",
    "into",
    "when",
    "then",
    "please",
    "just",
    "make",
    "want",
    "need",
    "have",
    "will",
    "should",
    "could",
    "would",
    "about",
    "after",
    "before",
    "your",
    "their",
    "them",
    "they",
    "you",
    "can",
    "not",
    "but",
    "all",
    "any",
    "our",
    "out",
    "use",
    "using",
    "used",
    "code",
    "file",
    "files",
    "function",
    "class",
    "method",
    "prompt",
    "task",
    "và",
    "của",
    "cho",
    "không",
    "được",
    "là",
    "một",
    "các",
    "trong",
    "với",
    "này",
    "khi",
    "hãy",
    "cần",
    "làm",
    "sửa",
    "thêm",
  ].map((word) => word.toLowerCase()),
);

const FILE_PATH_RE =
  /(?:[A-Za-z0-9_.-]+\/)+[A-Za-z0-9_.-]+\.[A-Za-z0-9]+|[A-Za-z0-9_.-]+\.(?:ts|tsx|js|jsx|py|dart|go|rs|java|kt|swift|cs|rb|php|css|html|json|yaml|yml|md)/g;

const IDENTIFIER_RE =
  /\b(?:[A-Z][a-zA-Z0-9]+(?:[A-Z][a-zA-Z0-9]+){0,4}|[a-z][a-zA-Z0-9]*(?:[A-Z][a-zA-Z0-9]+){1,4}|[a-z][a-z0-9]*(?:_[a-z0-9]+)+|[A-Z][A-Z0-9]+(?:_[A-Z0-9]+)+)\b/g;

const ERROR_LINE_RE =
  /(?:Error|Exception|FATAL|panic|Unhandled|TypeError|RangeError|Assert(?:ion)?Error|HttpException|GraphQLError)[:\s][^\n]{3,240}/gi;

const QUOTED_ERROR_RE = /["'`]([^"'`\n]{8,240})["'`]/g;

const CONSTRAINT_RE =
  /(?:^|\n)\s*(?:-|•|\d+\.)?\s*((?:don't|do not|must not|never|only|without|không được|không tự|chỉ|tránh)[^\n]{3,200})/gi;

export function analyzePrompt(original: string): PromptAnalysis {
  const text = original.trim();
  const taskType = classifyTask(text);
  const filePaths = unique(text.match(FILE_PATH_RE) ?? []);
  const modules = unique(
    filePaths
      .map((filePath) => moduleFromPath(filePath))
      .filter((moduleName): moduleName is string => Boolean(moduleName)),
  );
  const identifiers = unique([
    ...extractIdentifiers(text),
    ...filePaths.map((filePath) => basenameNoExt(filePath)),
  ]).filter((identifier) => !filePaths.includes(identifier));
  const errorMessages = unique([...extractErrorMessages(text), ...extractQuotedErrors(text)]).slice(0, 6);
  const constraints = unique(extractConstraints(text)).slice(0, 8);
  const searchQuery = buildSearchQuery(text, identifiers, modules, errorMessages);

  return {
    taskType,
    identifiers: identifiers.slice(0, 12),
    modules: modules.slice(0, 8),
    filePaths: filePaths.slice(0, 8),
    errorMessages,
    constraints,
    searchQuery,
  };
}

export function classifyTask(text: string): TaskType {
  const scores = new Map<TaskType, number>();
  for (const candidate of TASK_PATTERNS) {
    if (candidate.pattern.test(text)) {
      scores.set(candidate.type, (scores.get(candidate.type) ?? 0) + candidate.weight);
    }
  }
  if ((scores.get("bug") ?? 0) > 0 && (scores.get("ui") ?? 0) > 0 && hasErrorSignal(text)) {
    return "bug";
  }
  let best: TaskType = "other";
  let bestScore = 0;
  for (const [type, score] of scores) {
    if (score > bestScore) {
      best = type;
      bestScore = score;
    }
  }
  return best;
}

function hasErrorSignal(text: string): boolean {
  return (text.match(ERROR_LINE_RE) ?? []).length > 0 || /\b(exception|stack trace|crash|lỗi)\b/i.test(text);
}

function extractIdentifiers(text: string): string[] {
  const matches = text.match(IDENTIFIER_RE) ?? [];
  return matches.filter((value) => {
    if (value.length < 3 || value.length > 80) {
      return false;
    }
    if (STOPWORDS.has(value.toLowerCase())) {
      return false;
    }
    if (/^\d+$/.test(value)) {
      return false;
    }
    return true;
  });
}

function extractErrorMessages(text: string): string[] {
  return (text.match(ERROR_LINE_RE) ?? []).map((value) => value.trim());
}

function extractQuotedErrors(text: string): string[] {
  const found: string[] = [];
  for (const match of text.matchAll(QUOTED_ERROR_RE)) {
    const value = match[1]?.trim();
    if (!value) {
      continue;
    }
    if (/\b(error|exception|failed|invalid|undefined|null|cannot|unable)\b/i.test(value)) {
      found.push(value);
    }
  }
  return found;
}

function extractConstraints(text: string): string[] {
  const found: string[] = [];
  for (const match of text.matchAll(CONSTRAINT_RE)) {
    const value = match[1]?.trim();
    if (value) {
      found.push(value);
    }
  }
  return found;
}

function moduleFromPath(filePath: string): string | undefined {
  const parts = filePath.split("/").filter(Boolean);
  if (parts.length >= 2) {
    return parts.slice(0, Math.min(3, parts.length - 1)).join("/");
  }
  return undefined;
}

function basenameNoExt(filePath: string): string {
  const base = filePath.split("/").pop() ?? filePath;
  return base.replace(/\.[^.]+$/, "");
}

function buildSearchQuery(
  original: string,
  identifiers: string[],
  modules: string[],
  errorMessages: string[],
): string {
  const head = collapseWhitespace(original).slice(0, 400);
  return collapseWhitespace(
    [head, identifiers.slice(0, 8).join(" "), modules.slice(0, 4).join(" "), errorMessages.slice(0, 2).join(" ")].join(
      " ",
    ),
  ).slice(0, 700);
}

function collapseWhitespace(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function unique(values: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    const key = value.trim();
    if (!key || seen.has(key)) {
      continue;
    }
    seen.add(key);
    result.push(key);
  }
  return result;
}
