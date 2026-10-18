import type { PromptAnalysis } from "../prompt/analyzePrompt";
import { estimateTokens } from "../memory/selectContext";

export type ModelProfileName = "simple" | "normal" | "complex" | "large";
export type ProfileMode = "auto" | ModelProfileName;
export type ReasoningEffort = "minimal" | "low" | "medium" | "high";

export type ModelProfile = {
  name: ModelProfileName;
  contextWindowTokens: number;
  inputBudgetTokens: number;
  maxOutputTokens: number;
  temperature: number;
  memoryBudgetTokens: number;
  reasoningEffort: ReasoningEffort;
};

export const MODEL_PROFILES: Record<ModelProfileName, ModelProfile> = {
  simple: {
    name: "simple",
    contextWindowTokens: 16_000,
    inputBudgetTokens: 2_000,
    maxOutputTokens: 600,
    temperature: 0.1,
    memoryBudgetTokens: 800,
    reasoningEffort: "minimal",
  },
  normal: {
    name: "normal",
    contextWindowTokens: 16_000,
    inputBudgetTokens: 5_000,
    maxOutputTokens: 1_200,
    temperature: 0.1,
    memoryBudgetTokens: 2_000,
    reasoningEffort: "low",
  },
  complex: {
    name: "complex",
    contextWindowTokens: 32_000,
    inputBudgetTokens: 9_000,
    maxOutputTokens: 2_000,
    temperature: 0.1,
    memoryBudgetTokens: 3_000,
    reasoningEffort: "low",
  },
  large: {
    name: "large",
    contextWindowTokens: 32_000,
    inputBudgetTokens: 15_000,
    maxOutputTokens: 3_000,
    temperature: 0.1,
    memoryBudgetTokens: 5_000,
    reasoningEffort: "medium",
  },
};

const INPUT_RESERVE_TOKENS = 800;

export function resolveProfileName(
  mode: ProfileMode,
  analysis: PromptAnalysis,
  original: string,
  retrieval?: { distinctSources: number },
): ModelProfileName {
  if (mode !== "auto") {
    return mode;
  }
  return selectModelProfile(analysis, original, retrieval);
}

export function selectModelProfile(
  analysis: PromptAnalysis,
  original: string,
  retrieval?: { distinctSources: number },
): ModelProfileName {
  if (isLargeTask(analysis, original)) {
    return "large";
  }
  if (isComplexTask(analysis, original, retrieval)) {
    return "complex";
  }
  if (isSimpleTask(analysis, original)) {
    return "simple";
  }
  return "normal";
}

export function allocateMemoryBudget(input: {
  profile: ModelProfile;
  originalTokens: number;
  systemTokens: number;
  guidanceTokens: number;
  override?: number;
}): number {
  if (input.override !== undefined) {
    return Math.max(0, input.override);
  }
  const remaining =
    input.profile.inputBudgetTokens -
    input.systemTokens -
    input.originalTokens -
    input.guidanceTokens -
    INPUT_RESERVE_TOKENS;
  return Math.max(0, Math.min(input.profile.memoryBudgetTokens, remaining));
}

function isSimpleTask(analysis: PromptAnalysis, original: string): boolean {
  if (analysis.taskType === "explain") {
    return estimateTokens(original) <= 400;
  }
  if (analysis.taskType === "bug" && (analysis.errorMessages.length > 0 || hasCrashLanguage(original))) {
    return false;
  }
  if (analysis.taskType === "feature" || analysis.taskType === "refactor") {
    return false;
  }
  return (
    estimateTokens(original) <= 250 &&
    analysis.modules.length <= 1 &&
    analysis.filePaths.length <= 1 &&
    analysis.constraints.length <= 1 &&
    analysis.identifiers.length <= 5 &&
    analysis.errorMessages.length <= 1
  );
}

function isComplexTask(
  analysis: PromptAnalysis,
  original: string,
  retrieval?: { distinctSources: number },
): boolean {
  if (analysis.modules.length >= 3 || analysis.constraints.length >= 3 || analysis.filePaths.length >= 3) {
    return true;
  }
  if (analysis.taskType === "bug" && (analysis.modules.length >= 2 || analysis.filePaths.length >= 2 || analysis.errorMessages.length >= 2)) {
    return true;
  }
  if (
    (retrieval?.distinctSources ?? 0) >= 6 &&
    (analysis.modules.length >= 2 || analysis.filePaths.length >= 2 || analysis.identifiers.length >= 5)
  ) {
    return true;
  }
  return estimateTokens(original) >= 800 && (analysis.constraints.length >= 2 || analysis.modules.length >= 2);
}

function isLargeTask(analysis: PromptAnalysis, original: string): boolean {
  if (/\b(entire codebase|across all modules|migrate all)\b/i.test(original)) {
    return true;
  }
  if (analysis.taskType === "refactor" && (analysis.modules.length >= 3 || analysis.filePaths.length >= 4 || analysis.constraints.length >= 4)) {
    return true;
  }
  if (estimateTokens(original) >= 1_500 && analysis.constraints.length >= 3) {
    return true;
  }
  return analysis.modules.length >= 4 && analysis.identifiers.length >= 8;
}

function hasCrashLanguage(original: string): boolean {
  return /\b(crash|exception|stack trace|typeerror|panic|segfault)\b/i.test(original);
}
