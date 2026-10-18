import { collapseRepeatedBlock, collapseRepeatedMarkdownBold, extractPromptFromConversation } from "../prompt/extractChatPrompt";

export function parseOptimizedPrompt(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) {
    throw new Error("Coding model returned an empty prompt.");
  }

  const withoutPreamble = trimmed
    .replace(
      /^(?:here(?:'s| is)|below is)\s+(?:the\s+)?(?:optimized|rewritten)\s+prompt\s*[:\-]*\s*/i,
      "",
    )
    .replace(/^(?:optimized|rewritten)\s+prompt\s*[:\-]*\s*/i, "")
    .trim();

  const fenced = withoutPreamble.match(/```(?:markdown|md|text)?\r?\n([\s\S]*?)\r?\n```/);
  const unfenced = collapseRepeatedMarkdownBold((fenced?.[1] ?? withoutPreamble).trim());
  return collapseRepeatedBlock(extractPromptFromConversation(unfenced));
}
