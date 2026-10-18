import assert from "node:assert/strict";
import test from "node:test";
import { analyzePrompt } from "../src/prompt/analyzePrompt";
import { validateEnhancedPrompt } from "../src/prompt/validateEnhancedPrompt";
import { fiveSectionMarkdown } from "./contractFixture";
import { ExistingMemoryAdapter } from "../src/memory/ExistingMemoryAdapter";
import { runImprovePipeline } from "../src/commands/runImprovePipeline";

const LOGOUT_ORIGINAL =
  "Fix lỗi user đôi khi bị logout trong app Flutter. Kiểm tra nguyên nhân và sửa, đừng thay đổi những phần không liên quan.";

test("a focused logout contract should pass local structure and evidence checks", () => {
  const enhanced = fiveSectionMarkdown({
    context: [
      "Project: Flutter application.",
      "Issue: Người dùng đôi khi bị logout ngoài dự kiến.",
      "Root cause chưa được xác minh.",
    ].join("\n"),
    objective:
      "Xác định nguyên nhân có bằng chứng và sửa lỗi logout ngoài dự kiến, đồng thời giữ nguyên hành vi authentication không liên quan.",
    constraints: [
      "Không mặc định một nguyên nhân cụ thể trước khi có bằng chứng.",
      "Không quét hoặc sửa toàn bộ repository nếu không cần thiết.",
      "Không thay đổi những phần không liên quan.",
    ].join("\n"),
  });
  const result = validateEnhancedPrompt({
    original: LOGOUT_ORIGINAL,
    enhanced,
    analysis: analyzePrompt(LOGOUT_ORIGINAL),
  });
  assert.equal(result.parsed?.missing.length, 0);
  assert.equal(
    result.warnings.filter((warning) =>
      ["section_incomplete", "section_empty", "section_order", "evidence_as_fact", "invented_path"].includes(
        warning.code,
      ),
    ).length,
    0,
  );
});

test("validation should flag missing sections, invented paths, duplication, and unverified causes stated as fact", () => {
  const duplicate =
    "Do not change unrelated authentication behavior anywhere in the app.";
  const enhanced = [
    "## 1. Context",
    "The root cause is a token refresh bug in lib/secret/auth_session_manager.dart.",
    "",
    "## 2. Objective",
    "Rewrite the entire authentication stack.",
    "",
    "## 3. Steps",
    duplicate,
    "",
    "## 5. Constraints and Rules",
    duplicate,
  ].join("\n");
  const result = validateEnhancedPrompt({
    original: LOGOUT_ORIGINAL,
    enhanced,
    analysis: analyzePrompt(LOGOUT_ORIGINAL),
  });
  const codes = result.warnings.map((warning) => warning.code);
  assert.ok(codes.includes("section_incomplete"));
  assert.ok(codes.includes("invented_path"));
  assert.ok(codes.includes("duplication"));
  assert.ok(codes.includes("evidence_as_fact"));
});

test("a small UI change should keep the API constraint without a long investigation", () => {
  const original = "Increase padding on the product card out of stock badge. Do not change the API.";
  const enhanced = fiveSectionMarkdown({
    context: "UI change on the product card out of stock badge.",
    objective: "Increase padding on the out of stock badge.",
    steps: "1. Locate the badge.\n2. Increase padding.\n3. Check nearby layout.",
    output: "Changed UI file and a short visual check.",
    constraints: "Do not change the API.",
  });
  const result = validateEnhancedPrompt({
    original,
    enhanced,
    analysis: analyzePrompt(original),
  });
  assert.equal(result.parsed?.missing.length, 0);
  assert.ok(!result.warnings.some((warning) => warning.code === "verbose" || warning.code === "intent_loss"));
});

test("pipeline should keep one model request when local validation warns", async () => {
  let modelCalls = 0;
  const adapter = new ExistingMemoryAdapter({
    cliPath: "/fake/codebase-memory-mcp",
    runCli: async () => {
      throw new Error("memory backend down");
    },
  });
  const result = await runImprovePipeline({
    original: LOGOUT_ORIGINAL,
    projectRoot: "/repo",
    adapter,
    now: () => 1000,
    model: {
      async completeOnce() {
        modelCalls += 1;
        return { text: "Just a prettier sentence with no sections." };
      },
    },
  });
  assert.equal(modelCalls, 1);
  assert.ok(result.warnings.some((warning) => /missing the five required section/i.test(warning)));
});

test("pipeline should report loading stages without a second model request", async () => {
  const stages: string[] = [];
  let modelCalls = 0;
  const adapter = new ExistingMemoryAdapter({
    cliPath: "/fake/codebase-memory-mcp",
    runCli: async () => {
      throw new Error("memory backend down");
    },
  });
  await runImprovePipeline({
    original: LOGOUT_ORIGINAL,
    projectRoot: "/repo",
    adapter,
    now: () => 1000,
    onProgress: (message) => stages.push(message),
    model: {
      async completeOnce() {
        modelCalls += 1;
        return { text: "Just a prettier sentence with no sections." };
      },
    },
  });
  assert.equal(modelCalls, 1);
  assert.ok(stages.some((message) => /phân tích/i.test(message)));
  assert.ok(stages.some((message) => /memory/i.test(message)));
  assert.ok(stages.some((message) => /task contract/i.test(message)));
  assert.ok(stages.some((message) => /kiểm tra/i.test(message)));
});
