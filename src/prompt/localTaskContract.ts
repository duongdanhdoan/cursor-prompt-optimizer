import type { PromptAnalysis } from "./analyzePrompt";
import { subjectIdentifiers } from "./analyzePrompt";
import { serializeTaskContract } from "./taskContract";

export function buildLocalTaskContract(original: string, analysis: PromptAnalysis): string {
  const symbols = subjectIdentifiers(analysis);
  const context = [
    symbols.length ? `Named symbols from the original request: ${symbols.join(", ")}.` : "No named files were given.",
    "Confirm paths and symbols against the current repository. Treat memory as unverified.",
  ].join("\n");
  const constraints =
    analysis.constraints.length > 0
      ? analysis.constraints.join("\n")
      : "Do not expand the task. Do not invent files or replace the original subject with unrelated symbols.";

  if (analysis.vague) {
    return serializeTaskContract({
      context: "The original request does not name the issue, files, or expected behavior.",
      objective: original.trim(),
      steps:
        "1. Ask which issue, files, and expected behavior to work on.\n2. Do not change code until that is provided.",
      output: "Clarifying questions. No code changes.",
      constraints,
    });
  }

  const explain = analysis.taskType === "explain";
  return serializeTaskContract({
    context,
    objective: original.trim(),
    steps: explain
      ? "1. Find the named symbols in the current repository.\n2. Read only what is needed to answer the original question.\n3. Answer with code evidence. Do not modify code."
      : "1. Find the named symbols and relevant UI/code in the current repository.\n2. Make the smallest change that satisfies the original request.\n3. Do not change unrelated behavior.",
    output: explain
      ? "The answer to the original question, with code evidence."
      : "The requested change and the files touched.",
    constraints,
  });
}
