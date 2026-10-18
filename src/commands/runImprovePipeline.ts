import { ExistingMemoryAdapter } from "../memory/ExistingMemoryAdapter";
import { MemoryUnavailableError } from "../memory/MemoryAdapter";
import { rankResults } from "../memory/rankResults";
import { estimateTokens, renderMemoryBlock, selectContext } from "../memory/selectContext";
import { analyzePrompt } from "../prompt/analyzePrompt";
import { buildTaskContractGuidance, renderTaskContractGuidance } from "../prompt/buildTaskContract";
import { SYSTEM_PROMPT } from "../prompt/systemPrompt";
import { RequestMetrics } from "../telemetry/requestMetrics";
import { CodingModelClient } from "../llm/openaiCompatibleClient";
import {
  allocateMemoryBudget,
  MODEL_PROFILES,
  ModelProfileName,
  ProfileMode,
  ReasoningEffort,
  resolveProfileName,
} from "../llm/modelProfile";

export type ImprovePipelineInput = {
  original: string;
  projectRoot: string;
  tokenBudget?: number;
  minScoreRatio?: number;
  profile?: ProfileMode;
  temperature?: number;
  maxOutputTokens?: number;
  stream?: boolean;
  sendTemperature?: boolean;
  reasoningEffort?: ReasoningEffort | "omit";
  adapter: ExistingMemoryAdapter;
  model: CodingModelClient;
  now?: () => number;
};

export type ImprovePipelineResult = {
  original: string;
  optimized: string;
  metrics: RequestMetrics;
  analysisTaskType: string;
  profile: ModelProfileName;
};

export async function runImprovePipeline(input: ImprovePipelineInput): Promise<ImprovePipelineResult> {
  const original = input.original.trim();
  if (!original) {
    throw new Error("Nothing to improve. Copy a prompt or select text first.");
  }

  const now = input.now ?? Date.now;
  const analysis = analyzePrompt(original);
  const guidance = buildTaskContractGuidance(analysis);
  const guidanceText = renderTaskContractGuidance(guidance);

  const retrievalStarted = now();
  const memory = await input.adapter.searchDetailed({
    query: analysis.searchQuery,
    projectRoot: input.projectRoot,
    limit: 24,
    identifiers: [...analysis.identifiers, ...analysis.filePaths],
  });
  const retrievalMs = Math.max(0, now() - retrievalStarted);

  const ranked = rankResults(memory.hits, analysis, {
    minScoreRatio: input.minScoreRatio,
    projectRoot: input.projectRoot,
  });
  const distinctSources = new Set(ranked.map((hit) => hit.source).filter(Boolean)).size;
  const profileName = resolveProfileName(input.profile ?? "auto", analysis, original, { distinctSources });
  const profile = MODEL_PROFILES[profileName];
  const memoryBudget = allocateMemoryBudget({
    profile,
    originalTokens: estimateTokens(original),
    systemTokens: estimateTokens(SYSTEM_PROMPT),
    guidanceTokens: estimateTokens(guidanceText),
    override: input.tokenBudget,
  });
  const selected = selectContext(ranked, memoryBudget);

  let memoryStatus: RequestMetrics["memoryStatus"] = "ok";
  if (memory.unavailableReason) {
    memoryStatus = "unavailable";
  } else if (selected.hits.length === 0) {
    memoryStatus = "empty";
  }

  const userPrompt = buildUserPrompt({
    original,
    taskType: analysis.taskType,
    guidance: guidanceText,
    memoryStatus,
    memoryUnavailableReason: memory.unavailableReason,
    memoryBlock: renderMemoryBlock(selected.hits),
    identifiers: analysis.identifiers,
    constraints: analysis.constraints,
  });

  const temperature = input.temperature ?? profile.temperature;
  const maxOutputTokens = input.maxOutputTokens ?? profile.maxOutputTokens;
  const stream = input.stream ?? true;
  const reasoningEffort = input.reasoningEffort && input.reasoningEffort !== "omit" ? input.reasoningEffort : undefined;

  const apiStarted = now();
  const completion = await input.model.completeOnce({
    system: SYSTEM_PROMPT,
    user: userPrompt,
    temperature,
    maxOutputTokens,
    stream,
    sendTemperature: input.sendTemperature,
    reasoningEffort,
  });
  const apiMs = Math.max(0, now() - apiStarted);

  const metrics: RequestMetrics = {
    memoryRequests: memory.requestCount,
    codingModelRequests: 1,
    retrievalMs,
    apiMs,
    memoryHitsConsidered: ranked.length,
    memoryHitsSelected: selected.hits.length,
    memoryTokens: selected.tokenCount,
    memoryStatus,
    profile: profileName,
    inputTokens: estimateTokens(SYSTEM_PROMPT) + estimateTokens(userPrompt),
    inputBudgetTokens: profile.inputBudgetTokens,
    maxOutputTokens,
    temperature,
  };

  return {
    original,
    optimized: completion.text,
    metrics,
    analysisTaskType: analysis.taskType,
    profile: profileName,
  };
}

export function memoryFallbackNote(reason?: string): string {
  if (!reason) {
    return "No Semantic Codebase Memory context was available for this workspace.";
  }
  return `No Semantic Codebase Memory context was available (${reason}).`;
}

function buildUserPrompt(input: {
  original: string;
  taskType: string;
  guidance: string;
  memoryStatus: RequestMetrics["memoryStatus"];
  memoryUnavailableReason?: string;
  memoryBlock: string;
  identifiers: string[];
  constraints: string[];
}): string {
  const memoryHeader =
    input.memoryStatus === "unavailable"
      ? memoryFallbackNote(input.memoryUnavailableReason)
      : input.memoryStatus === "empty"
        ? "Memory search returned no usable hits for this workspace."
        : "Memory evidence follows. Verify every path and symbol before trusting it.";

  return [
    "Original request:",
    input.original,
    "",
    `Detected task type: ${input.taskType}`,
    "Task contract guidance:",
    input.guidance,
    "",
    input.identifiers.length ? `Extracted identifiers: ${input.identifiers.join(", ")}` : "Extracted identifiers: none",
    input.constraints.length ? `Extracted constraints:\n${input.constraints.map((item) => `- ${item}`).join("\n")}` : "Extracted constraints: none",
    "",
    "Retrieved memory:",
    memoryHeader,
    input.memoryBlock,
    "",
    "Rewrite the original request into one improved prompt the user can send next.",
    "Do not output a task-contract template. Do not repeat phrases.",
  ].join("\n");
}

export function isMemoryUnavailable(error: unknown): error is MemoryUnavailableError {
  return error instanceof MemoryUnavailableError;
}
