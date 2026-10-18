import assert from "node:assert/strict";
import test from "node:test";
import { analyzePrompt } from "../src/prompt/analyzePrompt";
import {
  allocateMemoryBudget,
  MODEL_PROFILES,
  selectModelProfile,
} from "../src/llm/modelProfile";
import { estimateTokens } from "../src/memory/selectContext";
import { buildChatCompletionsBody, buildMessagesBody, buildResponsesBody } from "../src/llm/openaiCompatibleClient";
import { SYSTEM_PROMPT } from "../src/prompt/systemPrompt";

test("UI padding request uses the simple profile", () => {
  const original = "Increase padding on the product card out of stock badge.";
  const profile = selectModelProfile(analyzePrompt(original), original);
  assert.equal(profile, "simple");
  assert.equal(MODEL_PROFILES.simple.maxOutputTokens, 600);
  assert.equal(MODEL_PROFILES.simple.memoryBudgetTokens, 800);
});

test("ordinary bug uses normal, not a coding-agent-sized window", () => {
  const original = "Fix the checkout crash in CheckoutController.submit";
  const profile = selectModelProfile(analyzePrompt(original), original);
  assert.equal(profile, "normal");
  assert.equal(MODEL_PROFILES.normal.contextWindowTokens, 16_000);
  assert.equal(MODEL_PROFILES.normal.inputBudgetTokens, 5_000);
  assert.equal(MODEL_PROFILES.normal.maxOutputTokens, 1_200);
  assert.equal(MODEL_PROFILES.normal.temperature, 0.1);
});

test("many modules and constraints select complex without a second model call", () => {
  const original = [
    "Investigate a checkout regression across lib/checkout/cart.ts, lib/checkout/payment.ts, and lib/checkout/inventory.ts.",
    "Keep CartService, PaymentClient, and InventoryGateway behavior unchanged.",
    "Must not change the public API.",
    "Do not refactor unrelated modules.",
    "Never skip validation.",
  ].join("\n");
  const analysis = analyzePrompt(original);
  assert.ok(analysis.filePaths.length >= 3 || analysis.modules.length >= 3 || analysis.constraints.length >= 3);
  assert.equal(selectModelProfile(analysis, original), "complex");
  assert.equal(MODEL_PROFILES.complex.maxOutputTokens, 2_000);
});

test("broad refactor with many files selects large", () => {
  const original = [
    "Refactor the checkout architecture across lib/a/one.ts, lib/b/two.ts, lib/c/three.ts, lib/d/four.ts.",
    "Must not change behavior.",
    "Don't touch the public API.",
    "Never skip tests.",
    "Only migrate these modules.",
  ].join("\n");
  assert.equal(selectModelProfile(analyzePrompt(original), original), "large");
  assert.equal(MODEL_PROFILES.large.maxOutputTokens, 3_000);
});

test("memory budget shrinks before the original prompt is cut", () => {
  const shrunk = allocateMemoryBudget({
    profile: MODEL_PROFILES.normal,
    originalTokens: 2_500,
    systemTokens: 600,
    guidanceTokens: 400,
  });
  assert.equal(shrunk, 700);

  const empty = allocateMemoryBudget({
    profile: MODEL_PROFILES.normal,
    originalTokens: 4_000,
    systemTokens: 600,
    guidanceTokens: 400,
  });
  assert.equal(empty, 0);
});

test("chat completions payload is latency-first: one result, no tools, capped output", () => {
  const body = buildChatCompletionsBody("YOUR_CODING_MODEL", {
    system: SYSTEM_PROMPT,
    user: "ORIGINAL_PROMPT_AND_SELECTED_MEMORY",
    temperature: 0.1,
    maxOutputTokens: 1_200,
    stream: true,
  });
  assert.equal(body.n, 1);
  assert.equal(body.temperature, 0.1);
  assert.equal(body.max_tokens, 1_200);
  assert.equal(body.stream, true);
  assert.equal("tools" in body, false);
  assert.equal("stop" in body, false);
  assert.equal("reasoning_effort" in body, false);
  assert.ok(estimateTokens(SYSTEM_PROMPT) <= 1_200);
});

test("messages payload uses /messages schema and omits tools", () => {
  const body = buildMessagesBody("YOUR_CODING_MODEL", {
    system: "s",
    user: "u",
    temperature: 0.1,
    maxOutputTokens: 1_200,
    stream: true,
    reasoningEffort: "low",
  });
  assert.equal(body.max_tokens, 1_200);
  assert.equal(body.messages[0]?.role, "user");
  assert.equal(body.reasoning_effort, "low");
  assert.equal("tools" in body, false);
  assert.equal("n" in body, false);
});

test("responses payload uses max_output_tokens and omits unsupported reasoning by default", () => {
  const body = buildResponsesBody("YOUR_CODING_MODEL", {
    system: "s",
    user: "u",
    maxOutputTokens: 1_200,
    stream: false,
    sendTemperature: false,
  });
  assert.equal(body.max_output_tokens, 1_200);
  assert.equal("temperature" in body, false);
  assert.equal("reasoning" in body, false);
});
