import type { PromptAnalysis, TaskType } from "./analyzePrompt";

export type TaskContractGuidance = {
  taskType: TaskType;
  sections: string[];
  notes: string[];
};

const COMMON_SECTIONS = [
  "Goal",
  "Relevant context",
  "Scope",
  "Validation",
  "Constraints",
];

export function buildTaskContractGuidance(analysis: PromptAnalysis): TaskContractGuidance {
  const sections = [...COMMON_SECTIONS];
  const notes = [
    "Keep the original request's language.",
    "Memory hits are unverified pointers, not proof of current code.",
    "Do not invent files, symbols, or architecture.",
    "Output one complete prompt, not alternatives.",
    "Do not copy Goal/Relevant context/Scope headings into the output unless the original prompt already used them.",
  ];

  if (analysis.taskType === "bug") {
    sections.splice(3, 0, "Investigation");
    notes.push("Separate verified facts from hypotheses before risky edits.");
  } else if (analysis.taskType === "ui") {
    notes.push("Do not add a deep root-cause investigation checklist for a visual/layout change.");
    notes.push("Keep the change local to the named UI surface.");
  } else if (analysis.taskType === "test") {
    notes.push("Name the behavior under test and the files most likely to contain it.");
  } else if (analysis.taskType === "refactor") {
    notes.push("Preserve behavior unless the original request explicitly asks to change it.");
  } else if (analysis.taskType === "feature") {
    notes.push("Implement only the requested capability; do not expand into adjacent features.");
  }

  if (analysis.constraints.length > 0) {
    notes.push("Honor constraints extracted from the original request.");
  }

  return {
    taskType: analysis.taskType,
    sections,
    notes,
  };
}

export function renderTaskContractGuidance(guidance: TaskContractGuidance): string {
  return [
    `Task type: ${guidance.taskType}`,
    `Required sections: ${guidance.sections.join(", ")}`,
    ...guidance.notes.map((note) => `- ${note}`),
  ].join("\n");
}
