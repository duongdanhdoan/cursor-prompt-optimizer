export type RequestMetrics = {
  memoryRequests: number;
  codingModelRequests: number;
  retrievalMs: number;
  apiMs: number;
  memoryHitsConsidered: number;
  memoryHitsSelected: number;
  memoryTokens: number;
  memoryStatus: "ok" | "empty" | "unavailable";
  profile?: string;
  inputTokens?: number;
  inputBudgetTokens?: number;
  maxOutputTokens?: number;
  temperature?: number;
};

export function emptyMetrics(): RequestMetrics {
  return {
    memoryRequests: 0,
    codingModelRequests: 0,
    retrievalMs: 0,
    apiMs: 0,
    memoryHitsConsidered: 0,
    memoryHitsSelected: 0,
    memoryTokens: 0,
    memoryStatus: "empty",
  };
}

export function formatMetrics(metrics: RequestMetrics): string {
  return [
    metrics.profile ? `profile=${metrics.profile}` : undefined,
    `memoryStatus=${metrics.memoryStatus}`,
    `memoryRequests=${metrics.memoryRequests}`,
    `codingModelRequests=${metrics.codingModelRequests}`,
    `retrievalMs=${metrics.retrievalMs}`,
    `apiMs=${metrics.apiMs}`,
    `hitsConsidered=${metrics.memoryHitsConsidered}`,
    `hitsSelected=${metrics.memoryHitsSelected}`,
    `memoryTokens=${metrics.memoryTokens}`,
    metrics.inputTokens !== undefined ? `inputTokens=${metrics.inputTokens}` : undefined,
    metrics.inputBudgetTokens !== undefined ? `inputBudget=${metrics.inputBudgetTokens}` : undefined,
    metrics.maxOutputTokens !== undefined ? `maxOutputTokens=${metrics.maxOutputTokens}` : undefined,
    metrics.temperature !== undefined ? `temperature=${metrics.temperature}` : undefined,
  ]
    .filter(Boolean)
    .join(" ");
}

export function exceededModelBudget(metrics: RequestMetrics): boolean {
  return metrics.codingModelRequests > 1;
}
