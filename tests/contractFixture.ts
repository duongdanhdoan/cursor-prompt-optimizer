import { CONTRACT_HEADINGS, serializeTaskContract, type TaskContract } from "../src/prompt/taskContract";

export function fiveSectionContract(overrides: Partial<TaskContract> = {}): TaskContract {
  return {
    context: "Flutter application. Unexpected logout. Root cause is unknown.",
    objective: "Identify the logout cause with evidence and fix it without unrelated auth changes.",
    steps: [
      "1. Trace authentication, session, and logout entry points.",
      "2. Compare code and logs where evidence exists.",
      "3. State the cause and evidence before risky edits.",
      "4. Apply the smallest fix that addresses the cause.",
      "5. Run relevant tests and review the diff.",
    ].join("\n"),
    output: "Root cause and evidence.\nChanged files.\nTests run and actual results.",
    constraints:
      "Do not assume a root cause.\nDo not scan the whole repository.\nDo not change unrelated authentication behavior.",
    ...overrides,
  };
}

export function fiveSectionMarkdown(overrides: Partial<TaskContract> = {}): string {
  return serializeTaskContract(fiveSectionContract(overrides));
}

export const REQUIRED_HEADINGS = Object.values(CONTRACT_HEADINGS);
