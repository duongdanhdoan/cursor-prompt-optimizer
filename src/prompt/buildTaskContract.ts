import type { PromptAnalysis, TaskType } from "./analyzePrompt";
import { CONTRACT_HEADINGS, CONTRACT_SECTION_IDS } from "./taskContract";

export type TaskContractGuidance = {
  taskType: TaskType;
  sections: string[];
  notes: string[];
};

const REQUIRED_SECTIONS = CONTRACT_SECTION_IDS.map((id) => CONTRACT_HEADINGS[id]);

export function buildTaskContractGuidance(analysis: PromptAnalysis): TaskContractGuidance {
  const notes = [
    "Keep the original request's language.",
    "Put each instruction in exactly one section.",
    "Cite only relevant memory in Context, with source, marked unverified. Omit unused hits.",
    "Do not invent files, symbols, APIs, architecture, or root causes.",
    "Do not expand the task or add work the user did not ask for.",
    "Keep the workflow as small as the original request. Add investigation only when needed to fulfill that request.",
  ];

  if (analysis.taskType === "explain") {
    notes.push("Answer only the original question. Locate and read the named symbol in the current repository.");
    notes.push("Do not add lifecycle, error-handling, performance, security, testing, or implementation work unless the original asked.");
    notes.push("Output is an explanation with code evidence, not a patch.");
  } else if (analysis.taskType === "bug") {
    notes.push("Investigate before changing code. Do not treat a hypothesis as a verified fact.");
    notes.push("Do not add unrelated refactoring or a broader redesign.");
  } else if (analysis.taskType === "ui") {
    notes.push("Do not add a deep root-cause investigation checklist for a visual/layout change.");
    notes.push("Keep the change local to the named UI surface.");
  } else if (analysis.taskType === "test") {
    notes.push("Name the behavior under test. Do not invent test files.");
  } else if (analysis.taskType === "refactor") {
    notes.push("Preserve behavior unless the original request explicitly asks to change it.");
  } else if (analysis.taskType === "feature") {
    notes.push("Implement only the requested capability; do not expand into adjacent features.");
  } else if (analysis.taskType === "docs") {
    notes.push("Keep the workflow short. Do not turn a docs edit into an implementation plan.");
  }

  if (analysis.vague) {
    notes.push("The original request does not name the issue. Ask for clarification. Do not invent files, symptoms, or a root cause.");
  }
  if (analysis.filePaths.length === 0 && analysis.modules.length === 0 && analysis.taskType !== "explain") {
    notes.push("No module was named. State that scope must be found during investigation; do not guess file names.");
  }
  if (analysis.constraints.length > 0) {
    notes.push("Honor constraints extracted from the original request, including negative instructions.");
  }

  return {
    taskType: analysis.taskType,
    sections: [...REQUIRED_SECTIONS],
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
