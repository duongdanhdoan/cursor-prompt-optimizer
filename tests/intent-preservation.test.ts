import assert from "node:assert/strict";
import test from "node:test";
import { analyzePrompt } from "../src/prompt/analyzePrompt";
import { buildTaskContractGuidance } from "../src/prompt/buildTaskContract";
import { validateEnhancedPrompt } from "../src/prompt/validateEnhancedPrompt";
import { fiveSectionMarkdown } from "./contractFixture";
import { ExistingMemoryAdapter } from "../src/memory/ExistingMemoryAdapter";
import { runImprovePipeline } from "../src/commands/runImprovePipeline";

const CASE_A = "_loadStores đang có những action nào trên app";
const CASE_B =
  "Find _loadStores and explain what it does, when it is called, and how it handles errors.";
const CASE_C = "Fix the loading state when the store list is empty.";
const CASE_D = "Explain why this function returns an empty list. Do not modify any files.";
const CASE_E = "Fix this issue.";
const CASE_EMPTY_STATE =
  "dựng theo contract: recomProduct(page: PRODUCTDETAIL | CART, zone: SIMILAR_PRODUCT, productId | variantIds, limit: 8). Nhận data: [] thì hiện empty state. Phần hiển thị danh sách sản phẩm tương tự sẽ được kiểm tra khi lên production.";

function warningCodes(original: string, enhanced: string): string[] {
  return validateEnhancedPrompt({
    original,
    enhanced,
    analysis: analyzePrompt(original),
  }).warnings.map((warning) => warning.code);
}

test("validateEnhancedPrompt", async (t) => {
  await t.test("simple code question should stay on actions, not lifecycle or errors", () => {
    const analysis = analyzePrompt(CASE_A);
    assert.equal(analysis.taskType, "explain");
    assert.equal(analysis.vague, false);

    const focused = fiveSectionMarkdown({
      context: "User asked which actions `_loadStores` performs in the app. File location is not named.",
      objective: "List the actions `_loadStores` performs and their effects in the app.",
      steps:
        "1. Find `_loadStores` in the current repository.\n2. Read its implementation and note the actions it triggers.\n3. Confirm the symbol against current code before concluding.",
      output: "A list of actions `_loadStores` performs, with code evidence.",
      constraints: "Do not add lifecycle, error-handling, or implementation work beyond answering the question.",
    });
    assert.ok(!warningCodes(CASE_A, focused).includes("scope_expansion"));

    const expanded = fiveSectionMarkdown({
      context: "Look up `_loadStores`.",
      objective:
        "Find _loadStores in the current repository and explain what it does, including when it is called and how it handles errors.",
      steps: "Verify the symbol and its relevant context in the current code before drawing conclusions.",
      output: "Explanation of behavior, call timing, and error handling.",
      constraints: "Confirm the symbol in the current repository.",
    });
    assert.ok(warningCodes(CASE_A, expanded).includes("scope_expansion"));
  });

  await t.test("explicit lifecycle and error-handling question should keep those dimensions", () => {
    const analysis = analyzePrompt(CASE_B);
    assert.equal(analysis.taskType, "explain");
    const enhanced = fiveSectionMarkdown({
      context: "User asked what `_loadStores` does, when it is called, and how it handles errors.",
      objective:
        "Explain what `_loadStores` does, when it is called, and how it handles errors, using current code evidence.",
      steps:
        "1. Find `_loadStores`.\n2. Read the implementation and call sites.\n3. Inspect error handling on those paths.",
      output: "Behavior, call-site timing, and error handling with code evidence.",
      constraints: "Treat retrieved memory as unverified. Do not change code.",
    });
    const codes = warningCodes(CASE_B, enhanced);
    assert.ok(!codes.includes("scope_expansion"));
    assert.ok(!codes.includes("intent_loss"));
  });

  await t.test("implementation request should not add an unrelated redesign", () => {
    const analysis = analyzePrompt(CASE_C);
    assert.equal(analysis.taskType, "bug");
    const focused = fiveSectionMarkdown({
      context: "Empty store list loading state is wrong. Cause is unverified.",
      objective: "Fix the loading state when the store list is empty.",
      steps:
        "1. Find the current empty-list loading UI.\n2. Identify the relevant state flow.\n3. Make the smallest change.\n4. Verify the empty-list loading behavior.",
      output: "Changed files and how the empty-list loading state was verified.",
      constraints: "Do not refactor unrelated loading code.",
    });
    assert.ok(!warningCodes(CASE_C, focused).includes("scope_expansion"));

    const expanded = fiveSectionMarkdown({
      context: "Empty store list loading state is wrong.",
      objective: "Redesign the entire loading architecture for the store list.",
      steps: "Rewrite the loading stack and add tests across the app.",
      output: "A broader loading-state redesign.",
      constraints: "None.",
    });
    assert.ok(warningCodes(CASE_C, expanded).includes("scope_expansion"));
  });

  await t.test("explicit read-only constraint should be preserved and block edit steps", () => {
    const analysis = analyzePrompt(CASE_D);
    assert.equal(analysis.taskType, "explain");
    assert.ok(analysis.constraints.some((item) => /do not modify any files/i.test(item)));
    const guidance = buildTaskContractGuidance(analysis);
    assert.ok(guidance.notes.some((note) => /Honor constraints/i.test(note)));

    const focused = fiveSectionMarkdown({
      context: "The named function returns an empty list. Cause is unverified.",
      objective: "Explain why this function returns an empty list, using code evidence.",
      steps: "1. Locate the function.\n2. Trace the empty-list return paths.\n3. Report the cause with evidence.",
      output: "The cause of the empty list, with code evidence.",
      constraints: "Do not modify any files.",
    });
    const focusedCodes = warningCodes(CASE_D, focused);
    assert.ok(!focusedCodes.includes("read_only_violation"));
    assert.ok(!focusedCodes.includes("intent_loss"));

    const mutating = fiveSectionMarkdown({
      context: "The named function returns an empty list.",
      objective: "Explain the empty list and then implement the fix.",
      steps: "1. Locate the function.\n2. Apply the fix in place.\n3. Edit the file.",
      output: "A patch.",
      constraints: "None.",
    });
    const mutatingCodes = warningCodes(CASE_D, mutating);
    assert.ok(mutatingCodes.includes("read_only_violation"));
    assert.ok(mutatingCodes.includes("intent_loss"));
  });

  await t.test("vague fix request should not invent the issue or files", () => {
    const analysis = analyzePrompt(CASE_E);
    assert.equal(analysis.vague, true);
    assert.equal(analysis.taskType, "bug");
    const guidance = buildTaskContractGuidance(analysis);
    assert.ok(guidance.notes.some((note) => /Ask for clarification/i.test(note)));

    const clarifying = fiveSectionMarkdown({
      context: "The original request does not name the issue, files, or expected behavior.",
      objective: "Ask which issue to fix and which files or symptoms to inspect before changing code.",
      steps: "1. Request the missing issue description, files, and expected behavior.\n2. Stop until that is provided.",
      output: "Clarifying questions. No code changes.",
      constraints: "Do not invent the issue, root cause, or affected files.",
    });
    const clarifyingCodes = warningCodes(CASE_E, clarifying);
    assert.ok(!clarifyingCodes.includes("invented_issue"));
    assert.ok(!clarifyingCodes.includes("invented_path"));

    const invented = fiveSectionMarkdown({
      context: "Assume CheckoutController is crashing on submit.",
      objective: "Fix the CheckoutController.submit crash.",
      steps: "Edit lib/secret/checkout_controller.dart.",
      output: "A patch to CheckoutController.",
      constraints: "None.",
    });
    const inventedCodes = warningCodes(CASE_E, invented);
    assert.ok(inventedCodes.includes("invented_issue") || inventedCodes.includes("invented_path"));
  });

  await t.test("recomProduct empty-state request should not expand into list QA or redesign", () => {
    const analysis = analyzePrompt(CASE_EMPTY_STATE);
    assert.ok(analysis.identifiers.includes("recomProduct"));
    const focused = fiveSectionMarkdown({
      context:
        "Contract: recomProduct(page: PRODUCTDETAIL | CART, zone: SIMILAR_PRODUCT, productId | variantIds, limit: 8). Empty payload is []. Populated similar-product list will be checked in production.",
      objective: "Show an empty state when recomProduct returns [].",
      steps:
        "1. Find the recomProduct similar-product UI for PRODUCTDETAIL and CART.\n2. When the response data is [], render the empty state.\n3. Keep the populated-list path unchanged.",
      output: "The empty state shown for [] and the files changed.",
      constraints:
        "Do not implement or verify the populated similar-product list now. That check is deferred to production.",
    });
    assert.ok(!warningCodes(CASE_EMPTY_STATE, focused).includes("scope_expansion"));

    const expanded = fiveSectionMarkdown({
      context: "Similar products widget.",
      objective: "Redesign the entire similar-product list and write tests for production.",
      steps: "Rewrite the loading stack and add tests across the app.",
      output: "Production QA of the similar product list.",
      constraints: "None.",
    });
    assert.ok(warningCodes(CASE_EMPTY_STATE, expanded).includes("scope_expansion"));
  });

  await t.test("should reject a _loadStores rewrite of a recomProduct request", () => {
    const substituted =
      "Find `_loadStores` in the current repository and confirm its definition and location before reviewing it. Examine its implementation and callers, then summarize its behavior and flag any apparent issues, citing relevant locations. Do not modify code.";
    assert.ok(warningCodes(CASE_EMPTY_STATE, substituted).includes("topic_substitution"));
  });
});

test("pipeline should still make one model request for an explain prompt", async () => {
  let modelCalls = 0;
  const adapter = new ExistingMemoryAdapter({
    cliPath: "/fake/codebase-memory-mcp",
    runCli: async () => {
      throw new Error("memory backend down");
    },
  });
  const result = await runImprovePipeline({
    original: CASE_A,
    projectRoot: "/repo",
    adapter,
    now: () => 1000,
    model: {
      async completeOnce(input) {
        modelCalls += 1;
        assert.match(input.system, /Do not add lifecycle analysis/);
        assert.match(input.user, /Detected task type: explain/);
        return { text: fiveSectionMarkdown({ objective: "List the actions `_loadStores` performs in the app." }) };
      },
    },
  });
  assert.equal(modelCalls, 1);
  assert.equal(result.analysisTaskType, "explain");
  assert.equal(result.metrics.codingModelRequests, 1);
});

test("pipeline should replace a _loadStores rewrite with a local recomProduct contract", async () => {
  let modelCalls = 0;
  const adapter = new ExistingMemoryAdapter({
    cliPath: "/fake/codebase-memory-mcp",
    runCli: async (_cliPath, tool) => {
      if (tool === "list_projects") {
        return { projects: [{ name: "repo", root_path: "/repo" }] };
      }
      return {
        semantic: {
          cols: ["qn", "label", "file", "score"],
          rows: [["repo._loadStores", "Function", "tests/intent-preservation.test.ts", 0.9]],
        },
      };
    },
  });
  const result = await runImprovePipeline({
    original: CASE_EMPTY_STATE,
    projectRoot: "/repo",
    adapter,
    now: () => 1000,
    model: {
      async completeOnce() {
        modelCalls += 1;
        return {
          text: "Find `_loadStores` in the current repository and confirm its definition and location before reviewing it. Examine its implementation and callers, then summarize its behavior and flag any apparent issues, citing relevant locations. Do not modify code.",
        };
      },
    },
  });
  assert.equal(modelCalls, 1);
  assert.match(result.optimized, /recomProduct/);
  assert.doesNotMatch(result.optimized, /_loadStores/);
  assert.ok(result.warnings.some((warning) => /replaced the original subject/i.test(warning)));
});
