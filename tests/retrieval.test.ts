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
import { reconcileMemoryHits } from "../src/memory/reconcileHits";
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

test("rankResults should drop unrelated _loadStores test hits for a recomProduct request", () => {
  const analysis = analyzePrompt(
    "dựng theo contract: recomProduct(page: PRODUCTDETAIL | CART, zone: SIMILAR_PRODUCT, productId | variantIds, limit: 8). Nhận data: [] thì hiện empty state.",
  );
  const ranked = rankResults(
    [
      {
        id: "optimizer._loadStores",
        source: "tests/intent-preservation.test.ts",
        score: 0.91,
        symbols: ["_loadStores"],
        content: "Find `_loadStores` in the current repository",
      },
      {
        id: "app.recomProduct",
        source: "lib/recom_product.dart",
        score: 0.2,
        symbols: ["recomProduct"],
        content: "recomProduct similar product",
      },
    ],
    analysis,
  );
  assert.deepEqual(
    ranked.map((hit) => hit.id),
    ["app.recomProduct"],
  );
});

test("ExistingMemoryAdapter uses semantic search plus identifier search and never indexes", async () => {
  const tools: string[] = [];
  const queries: Array<Record<string, unknown>> = [];
  const adapter = new ExistingMemoryAdapter({
    cliPath: "/fake/codebase-memory-mcp",
    runCli: async (_cliPath, tool, args) => {
      tools.push(tool);
      queries.push(args);
      if (tool === "list_projects") {
        return {
          projects: [{ name: "mobile-app", root_path: "/repo" }],
        };
      }
      if (tool === "search_graph") {
        assert.equal(args.project, "mobile-app");
        assert.equal(args.format, "json");
        if (args.semantic_query) {
          return {
            semantic: {
              cols: ["qn", "label", "file", "score"],
              rows: [["mobile-app.shadow.InsetBoxDecoration.scale", "Method", "lib/box_decoration_in.dart", 0.07]],
            },
          };
        }
        return {
          cols: ["qn", "label", "file", "lines", "rank"],
          rows: [["mobile-app.lib.product.ProductCard.build", "Method", "lib/product/product_card.dart", "51-51", -18.9]],
        };
      }
      throw new Error(`unexpected tool ${tool}`);
    },
  });

  const details = await adapter.searchDetailed({
    query: "fix ProductCard padding",
    projectRoot: "/repo",
    limit: 8,
    identifiers: ["ProductCard"],
  });
  assert.deepEqual(tools, ["list_projects", "search_graph", "search_graph"]);
  assert.equal(details.requestCount, 3);
  assert.equal(details.projectName, "mobile-app");
  assert.equal(details.unavailableReason, undefined);
  assert.ok(details.hits.some((hit) => hit.id.includes("ProductCard")));
  assert.ok(details.hits[0]?.id.includes("ProductCard"));
  assert.ok(queries.some((args) => Array.isArray(args.semantic_query)));
  assert.ok(queries.some((args) => args.query === "ProductCard"));
});

test("parseSearchGraphHits maps BM25 rank into a comparable score", () => {
  const hits = parseSearchGraphHits(
    {
      cols: ["qn", "label", "file", "lines", "rank"],
      rows: [["mobile-app.lib.product.ProductCard.build", "Method", "lib/product/product_card.dart", "51-51", -18.9]],
    },
    "mobile-app",
  );
  assert.equal(hits[0]?.source, "lib/product/product_card.dart");
  assert.ok((hits[0]?.score ?? 0) > 0.5);
});

test("unwrapCliPayload surfaces CLI errors without retrying", () => {
  assert.throws(
    () => unwrapCliPayload(JSON.stringify({ isError: true, content: [{ type: "text", text: "boom" }] })),
    /boom/,
  );
});

test("reconcileMemoryHits prefers identifier ProductCard hits over weak semantic shadow hits", () => {
  const merged = reconcileMemoryHits(
    [
      {
        id: "mobile-app.shadow.scale",
        source: "lib/box_decoration_in.dart",
        score: 0.07,
        content: "scale",
      },
    ],
    [
      {
        id: "mobile-app.lib.product.ProductCard.build",
        source: "lib/product/product_card.dart",
        score: 0.97,
        symbols: ["ProductCard"],
        content: "ProductCard",
      },
    ],
    ["ProductCard"],
  );
  assert.equal(merged[0]?.id, "mobile-app.lib.product.ProductCard.build");
  assert.ok(merged.some((hit) => hit.id === "mobile-app.shadow.scale"));
});
