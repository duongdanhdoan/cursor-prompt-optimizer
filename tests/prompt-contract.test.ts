import assert from "node:assert/strict";
import test from "node:test";
import { analyzePrompt } from "../src/prompt/analyzePrompt";
import { buildTaskContractGuidance } from "../src/prompt/buildTaskContract";
import { SYSTEM_PROMPT } from "../src/prompt/systemPrompt";
import { parseOptimizedPrompt } from "../src/llm/responseParser";
import { parseTaskContract } from "../src/prompt/taskContract";
import { fiveSectionMarkdown, REQUIRED_HEADINGS } from "./contractFixture";

test("system prompt requires a five-section task contract and forbids invention", () => {
  assert.match(SYSTEM_PROMPT, /unverified/i);
  assert.match(SYSTEM_PROMPT, /current repository|current repo/i);
  assert.match(SYSTEM_PROMPT, /do not call tools/i);
  assert.match(SYSTEM_PROMPT, /Do not tell the agent to start extra agents/);
  assert.match(SYSTEM_PROMPT, /## 1\. Context/);
  assert.match(SYSTEM_PROMPT, /## 2\. Objective/);
  assert.match(SYSTEM_PROMPT, /## 3\. Steps/);
  assert.match(SYSTEM_PROMPT, /## 4\. Output/);
  assert.match(SYSTEM_PROMPT, /## 5\. Constraints and Rules/);
  assert.match(SYSTEM_PROMPT, /Do not invent file paths/);
  assert.match(SYSTEM_PROMPT, /Do not add lifecycle analysis/);
  assert.match(SYSTEM_PROMPT, /Never replace the user's named symbols/);
  assert.match(SYSTEM_PROMPT, /expand the scope/);
});

test("every task type uses the same five sections; bugs get investigation notes and UI stays short", () => {
  const bug = buildTaskContractGuidance(
    analyzePrompt('Fix crash: TypeError: Cannot read properties of undefined in CheckoutController.submit'),
  );
  const ui = buildTaskContractGuidance(
    analyzePrompt("Increase padding on the product card out of stock badge. Do not change the API."),
  );

  assert.equal(bug.taskType, "bug");
  assert.deepEqual(bug.sections, REQUIRED_HEADINGS);
  assert.ok(bug.notes.some((note) => /Investigate before changing code/i.test(note)));
  assert.equal(ui.taskType, "ui");
  assert.deepEqual(ui.sections, REQUIRED_HEADINGS);
  assert.ok(!ui.notes.some((note) => /Investigate before changing code/i.test(note)));
  assert.ok(ui.notes.some((note) => /visual|layout|concise|local/i.test(note)));
});

test("analyzer extracts identifiers, files, errors, and constraints", () => {
  const analysis = analyzePrompt(
    [
      "Sửa lỗi ProductCard.outOfStockBadge.",
      "File: lib/app/modules/product/product_card.dart",
      'Error: "Null check operator used on a null value"',
      "Không được đổi kiến trúc.",
    ].join("\n"),
  );

  assert.equal(analysis.taskType, "bug");
  assert.ok(analysis.identifiers.some((value) => /ProductCard|outOfStockBadge/.test(value)));
  assert.ok(analysis.filePaths.some((value) => value.includes("product_card.dart")));
  assert.ok(analysis.errorMessages.some((value) => /Null check operator/.test(value)));
  assert.ok(analysis.constraints.some((value) => /Không được đổi kiến trúc/.test(value)));
  assert.ok(analysis.searchQuery.includes("product_card.dart"));
});

test("a simple symbol question should be explain and keep _loadStores", () => {
  const analysis = analyzePrompt("_loadStores đang có những action nào trên app");
  assert.equal(analysis.taskType, "explain");
  assert.ok(analysis.identifiers.includes("_loadStores"));
  const guidance = buildTaskContractGuidance(analysis);
  assert.ok(guidance.notes.some((note) => /lifecycle|error-handling/i.test(note)));
  assert.ok(guidance.notes.some((note) => /explanation with code evidence/i.test(note)));
});

test("parser returns a canonical five-section prompt and strips model preamble", () => {
  const parsed = parseOptimizedPrompt(
    `Here is the optimized prompt:\n\`\`\`markdown\n${fiveSectionMarkdown({ objective: "Fix the badge." })}\n\`\`\``,
  );
  const contract = parseTaskContract(parsed);
  assert.ok(contract);
  assert.equal(contract.missing.length, 0);
  assert.equal(contract.contract.objective, "Fix the badge.");
  assert.match(parsed, /^## 1\. Context/m);
  assert.match(parsed, /^## 5\. Constraints and Rules/m);
});

test("parser keeps numbered steps inside Steps instead of treating them as headings", () => {
  const parsed = parseTaskContract(
    fiveSectionMarkdown({
      steps: "1. Trace authentication entry points.\n2. Compare logs.\n3. Apply the smallest fix.",
    }),
  );
  assert.ok(parsed);
  assert.equal(parsed.missing.length, 0);
  assert.match(parsed.contract.steps, /1\. Trace authentication/);
  assert.match(parsed.contract.steps, /3\. Apply the smallest fix/);
});
