import assert from "node:assert/strict";
import test from "node:test";
import { analyzePrompt } from "../src/prompt/analyzePrompt";
import { buildTaskContractGuidance } from "../src/prompt/buildTaskContract";
import { SYSTEM_PROMPT } from "../src/prompt/systemPrompt";
import { parseOptimizedPrompt } from "../src/llm/responseParser";

test("system prompt requires a concise rewrite without contract boilerplate", () => {
  assert.match(SYSTEM_PROMPT, /unverified/i);
  assert.match(SYSTEM_PROMPT, /current repository|current repo/i);
  assert.match(SYSTEM_PROMPT, /do not call tools/i);
  assert.match(SYSTEM_PROMPT, /Do not tell the agent to start extra agents/);
  assert.match(SYSTEM_PROMPT, /Do not add Goal/);
});

test("bug requests get an investigation section; UI padding requests do not", () => {
  const bug = buildTaskContractGuidance(
    analyzePrompt('Fix crash: TypeError: Cannot read properties of undefined in CheckoutController.submit'),
  );
  const ui = buildTaskContractGuidance(
    analyzePrompt("Increase padding on the product card out of stock badge. Do not change the API."),
  );

  assert.equal(bug.taskType, "bug");
  assert.ok(bug.sections.includes("Investigation"));
  assert.equal(ui.taskType, "ui");
  assert.ok(!ui.sections.includes("Investigation"));
  assert.ok(ui.notes.some((note) => /padding|visual|layout/i.test(note)));
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

test("parser returns one prompt and strips model preamble", () => {
  const parsed = parseOptimizedPrompt("Here is the optimized prompt:\n```markdown\nGoal\nFix the badge.\n```");
  assert.equal(parsed, "Fix the badge.");
});
