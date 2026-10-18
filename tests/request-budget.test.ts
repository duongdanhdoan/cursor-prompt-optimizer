import assert from "node:assert/strict";
import test from "node:test";
import { ExistingMemoryAdapter } from "../src/memory/ExistingMemoryAdapter";
import { estimateTokens, selectContext } from "../src/memory/selectContext";
import type { MemoryHit } from "../src/memory/MemoryAdapter";
import { runImprovePipeline } from "../src/commands/runImprovePipeline";
import { createOpenAICompatibleClient } from "../src/llm/openaiCompatibleClient";
import { exceededModelBudget } from "../src/telemetry/requestMetrics";
import { fiveSectionMarkdown } from "./contractFixture";

function hit(id: string, extra = ""): MemoryHit {
  return {
    id,
    source: `${id}.dart`,
    score: 0.4,
    content: `[UNVERIFIED memory] ${id} ${extra}`.padEnd(120, "x"),
  };
}

test("selectContext never sends more memory tokens than the budget", () => {
  const hits = Array.from({ length: 20 }, (_, index) => hit(`symbol_${index}`, "content"));
  const selected = selectContext(hits, 200);
  assert.ok(selected.tokenCount <= 200);
  assert.ok(selected.hits.length > 0);
  assert.ok(selected.hits.every((item) => item.source));
});

test("pipeline makes exactly one coding-model request even when memory is unavailable", async () => {
  let modelCalls = 0;
  const adapter = new ExistingMemoryAdapter({
    cliPath: "/fake/codebase-memory-mcp",
    runCli: async () => {
      throw new Error("memory backend down");
    },
  });

  const result = await runImprovePipeline({
    original: "Fix the checkout crash in CheckoutController.submit",
    projectRoot: "/repo",
    tokenBudget: 2000,
    adapter,
    now: () => 1000,
    model: {
      async completeOnce(input) {
        modelCalls += 1;
        assert.match(input.user, /No Semantic Codebase Memory context was available/);
        assert.match(input.system, /You do not call tools/);
        assert.equal(input.maxOutputTokens, 1_200);
        assert.equal(input.temperature, 0.1);
        assert.equal(input.stream, true);
        return { text: fiveSectionMarkdown({ objective: "Investigate CheckoutController.submit." }) };
      },
    },
  });

  assert.equal(modelCalls, 1);
  assert.equal(result.metrics.codingModelRequests, 1);
  assert.equal(result.metrics.memoryStatus, "unavailable");
  assert.equal(result.profile, "normal");
  assert.equal(result.metrics.maxOutputTokens, 1_200);
  assert.equal(exceededModelBudget(result.metrics), false);
});

test("openai-compatible client does not retry a failed request", async () => {
  let fetchCalls = 0;
  const client = createOpenAICompatibleClient({
    baseUrl: "https://example.test/v1",
    apiKey: "sk-test",
    model: "demo",
    fetchImpl: async () => {
      fetchCalls += 1;
      return new Response("nope", { status: 500 });
    },
  });

  await assert.rejects(() => client.completeOnce({ system: "s", user: "u" }), /failed \(500\)/);
  assert.equal(fetchCalls, 1);
  await assert.rejects(() => client.completeOnce({ system: "s", user: "u" }), /second request/);
  assert.equal(fetchCalls, 1);
});

test("openai-compatible payload is one streamed completion with a 1200-token cap and no tools", async () => {
  let captured: Record<string, unknown> | undefined;
  const client = createOpenAICompatibleClient({
    baseUrl: "https://example.test/v1",
    apiKey: "sk-test",
    model: "demo-model",
    fetchImpl: async (_url, init) => {
      captured = JSON.parse(String(init?.body)) as Record<string, unknown>;
      const sse = `data: ${JSON.stringify({ choices: [{ delta: { content: fiveSectionMarkdown({ objective: "Done." }) } }] })}\n\ndata: [DONE]\n`;
      return new Response(sse, { status: 200, headers: { "content-type": "text/event-stream" } });
    },
  });

  const result = await client.completeOnce({
    system: "s",
    user: "u",
    temperature: 0.1,
    maxOutputTokens: 1_200,
    stream: true,
  });

  assert.match(result.text, /## 2\. Objective/);
  assert.match(result.text, /Done\./);
  assert.equal(captured?.model, "demo-model");
  assert.equal(captured?.n, 1);
  assert.equal(captured?.temperature, 0.1);
  assert.equal(captured?.max_tokens, 1_200);
  assert.equal(captured?.stream, true);
  assert.equal("tools" in (captured ?? {}), false);
  assert.equal("stop" in (captured ?? {}), false);
});

test("successful pipeline counts one model request and keeps memory under budget", async () => {
  const adapter = new ExistingMemoryAdapter({
    cliPath: "/fake/codebase-memory-mcp",
    runCli: async (_cliPath, tool) => {
      if (tool === "list_projects") {
        return { projects: [{ name: "repo", root_path: "/repo" }] };
      }
      return {
        semantic: {
          cols: ["qn", "label", "file", "score"],
          rows: [
            ["repo.CheckoutController.submit", "Method", "lib/checkout_controller.dart", 0.5],
            ["repo.CheckoutController.submit", "Method", "lib/checkout_controller.dart", 0.49],
            ["builtins.len", "Function", "<python-builtins>", 0.9],
          ],
        },
      };
    },
  });

  const result = await runImprovePipeline({
    original: "Fix CheckoutController.submit throwing TypeError: undefined",
    projectRoot: "/repo",
    tokenBudget: 80,
    adapter,
    model: {
      async completeOnce() {
        return { text: fiveSectionMarkdown({ objective: "Fix CheckoutController.submit." }) };
      },
    },
  });

  assert.equal(result.metrics.codingModelRequests, 1);
  assert.ok(result.metrics.memoryTokens <= 80);
  assert.equal(result.metrics.memoryStatus, "ok");
  assert.ok(result.metrics.memoryHitsSelected >= 1);
  assert.ok(estimateTokens(result.optimized) > 0);
  assert.equal(result.profile, "normal");
});

test("selectContext sends no memory when the remaining budget is 0", () => {
  const selected = selectContext([hit("too-big")], 0);
  assert.equal(selected.hits.length, 0);
  assert.equal(selected.tokenCount, 0);
});
