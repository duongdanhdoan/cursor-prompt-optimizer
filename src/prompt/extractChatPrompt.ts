const COMMAND_PREFIX =
  /^(?:>+\s*)?(?:prompt\s*optimizer|@optimizer)\b[:\s-]*/i;

const BOLD_FRAGMENT = /\*\*([^*]{1,160})\*\*/g;
const CONTRACT_HEADING =
  /^(?:goal|relevant context|scope|investigation|validation|constraints)\s*$/i;

export function extractPromptFromConversation(raw: string): string {
  const stripped = stripCommandTokens(raw);
  const collapsedBolds = collapseRepeatedMarkdownBold(stripped);
  const withoutNoise = stripLeadingSelectionNoise(collapsedBolds);
  const collapsedParagraphs = collapseDuplicateParagraphs(withoutNoise);
  const collapsedBlock = collapseRepeatedBlock(collapsedParagraphs);
  const withoutGlue = collapsedBlock.replace(/^Goal\s*\n/i, "").trim();
  if (withoutGlue.length >= 40 || withoutGlue.includes("\n")) {
    return withoutGlue;
  }
  return collapsedBlock.trim();
}

export function stripCommandTokens(text: string): string {
  return text.replace(COMMAND_PREFIX, "").trim();
}

export function collapseRepeatedMarkdownBold(text: string): string {
  return text.replace(/(\*\*[^*]+\*\*)(?:\s*\1)+/g, "$1");
}

export function collapseDuplicateParagraphs(text: string): string {
  const parts = text.split(/\n{2,}/);
  const result: string[] = [];
  for (const part of parts) {
    const trimmed = part.trim();
    if (!trimmed) {
      continue;
    }
    if (result.length > 0 && normalize(result[result.length - 1] ?? "") === normalize(trimmed)) {
      continue;
    }
    result.push(trimmed);
  }
  return result.join("\n\n");
}

export function collapseRepeatedBlock(text: string): string {
  const value = text.trim();
  if (value.length < 40) {
    return value;
  }
  if (value.length % 2 === 0) {
    const half = value.length / 2;
    if (value.slice(0, half) === value.slice(half)) {
      return value.slice(0, half).trim();
    }
  }
  const sentences = splitSentences(value);
  if (sentences.length >= 2 && sentences.length % 2 === 0) {
    const half = sentences.length / 2;
    const left = sentences.slice(0, half);
    const right = sentences.slice(half);
    if (left.map(normalize).join("|") === right.map(normalize).join("|")) {
      return left.join(" ").trim();
    }
  }
  const dedupedSentences: string[] = [];
  for (const sentence of sentences) {
    if (
      dedupedSentences.length > 0 &&
      normalize(dedupedSentences[dedupedSentences.length - 1] ?? "") === normalize(sentence)
    ) {
      continue;
    }
    dedupedSentences.push(sentence);
  }
  return dedupedSentences.join(" ").trim();
}

function splitSentences(text: string): string[] {
  return text
    .split(/(?<=[.!?。])\s+/)
    .map((part) => part.trim())
    .filter(Boolean);
}

function stripLeadingSelectionNoise(text: string): string {
  const fragments: string[] = [];
  let cursor = 0;
  for (const match of text.matchAll(BOLD_FRAGMENT)) {
    if (match.index !== cursor) {
      break;
    }
    fragments.push(match[1] ?? "");
    cursor = (match.index ?? 0) + match[0].length;
  }
  if (fragments.length === 0 || cursor === 0) {
    return dropContractHeading(text);
  }
  const rest = text.slice(cursor).trim();
  if (!rest) {
    return uniqueJoin(fragments);
  }
  return dropContractHeading(rest);
}

function dropContractHeading(text: string): string {
  const lines = text.split(/\n/);
  if (lines.length > 1 && CONTRACT_HEADING.test(lines[0]?.trim() ?? "")) {
    return lines.slice(1).join("\n").trim();
  }
  return text.trim();
}

function uniqueJoin(fragments: string[]): string {
  const seen = new Set<string>();
  const values: string[] = [];
  for (const fragment of fragments) {
    const key = normalize(fragment);
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    values.push(fragment);
  }
  return values.join("\n");
}

function normalize(value: string): string {
  return value.replace(/\s+/g, " ").trim().toLowerCase();
}

export function resolveChatPrompt(
  request: { prompt: string; references?: readonly { value?: unknown }[] },
  history: ReadonlyArray<{ prompt?: string }>,
): string {
  const fromRefs = (request.references ?? [])
    .map((ref) => (typeof ref.value === "string" ? ref.value : ""))
    .filter(Boolean)
    .join("\n\n");
  const previous = [...history].reverse().map((turn) => turn.prompt ?? "");
  const candidates = [fromRefs, request.prompt, ...previous];
  for (const candidate of candidates) {
    const cleaned = extractPromptFromConversation(candidate);
    if (cleaned) {
      return cleaned;
    }
  }
  return "";
}
