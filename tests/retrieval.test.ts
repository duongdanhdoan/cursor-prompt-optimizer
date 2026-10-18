import assert from "node:assert/strict";
import test from "node:test";
import {
  ExistingMemoryAdapter,
  parseSearchGraphHits,
  resolveProjectName,
  unwrapCliPayload,
} from "../src/memory/ExistingMemoryAdapter";
import { rankResults } from "../src/memory/rankResults";
import type { MemoryHit } from "../src/memory/MemoryAdapter";
import { analyzePrompt } from "../src/prompt/analyzePrompt";

test("resolveProjectName prefers the workspace basename when two indexes share a root", () => {
  const name = resolveProjectName("/Users/doandanh/Desktop/mobile-app", [
    { name: "Users-doandanh-Desktop-mobile-app", root_path: "/Users/doandanh/Desktop/mobile-app" },
    { name: "mobile-app", root_path: "/Users/doandanh/Desktop/mobile-app" },
  ]);
  assert.equal(name, "mobile-app");
});

test("resolveProjectName does not silently use another project's index", () => {
  const name = resolveProjectName("/Users/doandanh/Desktop/optimizer prompt extension", [
    { name: "mobile-app", root_path: "/Users/doandanh/Desktop/mobile-app" },
  ]);
  assert.equal(name, undefined);
});

test("parseSearchGraphHits keeps source and symbol metadata", () => {
  const hits = parseSearchGraphHits(
    {
      semantic: {
        cols: ["qn", "label", "file", "score"],
        rows: [
          ["mobile-app.lib.product.ProductCard.build", "Method", "lib/product/product_card.dart", 0.21],
        ],
      },
    },
    "mobile-app",
  );
  assert.equal(hits.length, 1);
  assert.equal(hits[0]?.source, "lib/product/product_card.dart");
  assert.match(hits[0]?.content ?? "", /UNVERIFIED/);
  assert.match(hits[0]?.content ?? "", /Confirm this path/);
});

test("rankResults drops builtins, weak hits, duplicates, and off-repo paths", () => {
  const analysis = analyzePrompt("Fix ProductCard padding on the out of stock badge.");
  const hits: MemoryHit[] = [
    {
      id: "builtins.len",
      source: "<python-builtins>",
      score: 0.9,
      content: "len",
    },
    {
      id: "mobile-app.lib.product.ProductCard.build",
      source: "lib/product/product_card.dart",
      score: 0.2,
      symbols: ["ProductCard"],
      content: "ProductCard",
    },
    {
      id: "mobile-app.lib.product.ProductCard.build",
      source: "lib/product/product_card.dart",
      score: 0.19,
      symbols: ["ProductCard"],
      content: "duplicate",
    },
    {
      id: "other.unrelated.Helper",
      source: "/tmp/other-repo/helper.ts",
      score: 0.8,
      content: "other repo",
    },
    {
      id: "mobile-app.lib.utils.noise",
      source: "lib/utils/noise.dart",
      score: 0.01,
      content: "weak",
    },
  ];

  const ranked = rankResults(hits, analysis, {
    minScoreRatio: 0.15,
    projectRoot: "/Users/doandanh/Desktop/mobile-app",
  });
  assert.deepEqual(
    ranked.map((hit) => hit.id),
    ["mobile-app.lib.product.ProductCard.build"],
  );
});

test("ExistingMemoryAdapter uses one list_projects plus one search_graph call and never indexes", async () => {
  const tools: string[] = [];
  const adapter = new ExistingMemoryAdapter({
    cliPath: "/fake/codebase-memory-mcp",
    runCli: async (_cliPath, tool, args) => {
      tools.push(tool);
      if (tool === "list_projects") {
        return {
          projects: [{ name: "mobile-app", root_path: "/repo" }],
        };
      }
      if (tool === "search_graph") {
        assert.equal(args.project, "mobile-app");
        assert.ok(Array.isArray(args.semantic_query));
        assert.equal(args.format, "json");
        return {
          semantic: {
            cols: ["qn", "label", "file", "score"],
            rows: [["mobile-app.Foo.bar", "Method", "lib/foo.dart", 0.4]],
          },
        };
      }
      throw new Error(`unexpected tool ${tool}`);
    },
  });

  const details = await adapter.searchDetailed({
    query: "fix Foo.bar crash",
    projectRoot: "/repo",
    limit: 8,
  });
  assert.deepEqual(tools, ["list_projects", "search_graph"]);
  assert.equal(details.requestCount, 2);
  assert.equal(details.projectName, "mobile-app");
  assert.equal(details.hits.length, 1);
  assert.equal(details.unavailableReason, undefined);
});

test("unwrapCliPayload surfaces CLI errors without retrying", () => {
  assert.throws(
    () => unwrapCliPayload(JSON.stringify({ isError: true, content: [{ type: "text", text: "boom" }] })),
    /boom/,
  );
});
