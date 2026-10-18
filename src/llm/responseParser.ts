import { collapseDuplicateParagraphs, collapseRepeatedMarkdownBold } from "../prompt/extractChatPrompt";
import { parseTaskContract, serializeTaskContract, type TaskContract } from "../prompt/taskContract";

export function parseOptimizedPrompt(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) {
    throw new Error("Coding model returned an empty prompt.");
  }

  const withoutPreamble = trimmed
    .replace(
      /^(?:here(?:'s| is)|below is)\s+(?:the\s+)?(?:optimized|rewritten|enhanced)\s+prompt\s*[:\-]*\s*/i,
      "",
    )
    .replace(/^(?:optimized|rewritten|enhanced)\s+prompt\s*[:\-]*\s*/i, "")
    .trim();

  const fenced = withoutPreamble.match(/```(?:markdown|md|text)?\r?\n([\s\S]*?)\r?\n```/);
  const cleaned = collapseRepeatedMarkdownBold((fenced?.[1] ?? withoutPreamble).trim());
  const parsed = parseTaskContract(cleaned);
  if (!parsed || parsed.missing.length > 0) {
    return collapseDuplicateParagraphs(cleaned);
  }

  return serializeTaskContract(cleanContract(parsed.contract));
}

function cleanContract(contract: TaskContract): TaskContract {
  return {
    context: collapseDuplicateParagraphs(contract.context),
    objective: collapseDuplicateParagraphs(contract.objective),
    steps: collapseDuplicateParagraphs(contract.steps),
    output: collapseDuplicateParagraphs(contract.output),
    constraints: collapseDuplicateParagraphs(contract.constraints),
  };
}
