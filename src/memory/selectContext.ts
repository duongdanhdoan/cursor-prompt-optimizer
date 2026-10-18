import type { MemoryHit } from "./MemoryAdapter";

export type SelectedContext = {
  hits: MemoryHit[];
  tokenCount: number;
};

export function estimateTokens(text: string): number {
  if (!text) {
    return 0;
  }
  return Math.ceil(text.length / 4);
}

export function selectContext(hits: MemoryHit[], tokenBudget: number): SelectedContext {
  const budget = Math.max(0, tokenBudget);
  if (budget <= 0) {
    return { hits: [], tokenCount: 0 };
  }

  const selected: MemoryHit[] = [];
  let tokenCount = 0;

  for (const hit of hits) {
    const next = estimateTokens(renderHit(hit));
    if (selected.length > 0 && tokenCount + next > budget) {
      continue;
    }
    if (selected.length === 0 && next > budget) {
      selected.push(truncateHit(hit, budget));
      tokenCount = estimateTokens(renderHit(selected[0]));
      break;
    }
    selected.push(hit);
    tokenCount += next;
    if (tokenCount >= budget) {
      break;
    }
  }

  return { hits: selected, tokenCount };
}

export function renderMemoryBlock(hits: MemoryHit[]): string {
  if (hits.length === 0) {
    return "No memory evidence selected.";
  }
  return hits.map((hit, index) => `${index + 1}. ${renderHit(hit)}`).join("\n");
}

export function renderHit(hit: MemoryHit): string {
  const source = hit.source ? `source=${hit.source}` : "source=missing";
  const score = typeof hit.score === "number" ? ` score=${hit.score.toFixed(4)}` : "";
  return `${hit.content} (${source}${score}; verify before use)`;
}

function truncateHit(hit: MemoryHit, tokenBudget: number): MemoryHit {
  const maxChars = Math.max(32, tokenBudget * 4);
  return {
    ...hit,
    content: `${hit.content.slice(0, maxChars)}…`,
  };
}
