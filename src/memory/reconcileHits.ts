import type { MemoryHit } from "./MemoryAdapter";

export function reconcileMemoryHits(
  semanticHits: MemoryHit[],
  identifierHits: MemoryHit[],
  identifiers: string[],
): MemoryHit[] {
  const needles = identifiers.filter((value) => value.length >= 3);
  const merged = new Map<string, MemoryHit>();

  for (const hit of semanticHits) {
    merged.set(hit.id, hit);
  }

  for (const hit of identifierHits) {
    const existing = merged.get(hit.id);
    const identifierScore = Math.max(hit.score ?? 0, 0.55);
    merged.set(hit.id, {
      ...existing,
      ...hit,
      score: Math.max(existing?.score ?? 0, identifierScore),
      symbols: uniqueStrings([...(existing?.symbols ?? []), ...(hit.symbols ?? [])]),
      content: hit.content || existing?.content || "",
    });
  }

  const values = [...merged.values()];
  const matching = values.filter((hit) => matchesIdentifiers(hit, needles));
  if (matching.length === 0) {
    return values;
  }

  const extras = values
    .filter((hit) => !matchesIdentifiers(hit, needles))
    .sort((left, right) => (right.score ?? 0) - (left.score ?? 0))
    .slice(0, 3);

  return [...matching.sort((left, right) => (right.score ?? 0) - (left.score ?? 0)), ...extras];
}

function matchesIdentifiers(hit: MemoryHit, needles: string[]): boolean {
  if (needles.length === 0) {
    return false;
  }
  const haystack = `${hit.id} ${hit.source ?? ""} ${hit.symbols?.join(" ") ?? ""}`.toLowerCase();
  return needles.some((needle) => haystack.includes(needle.toLowerCase()));
}

function uniqueStrings(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))];
}
