import assert from "node:assert/strict";
import test from "node:test";
import { PromptHistory } from "../src/history/promptHistory";

test("history keeps newest first and caps at 40", async () => {
  const data = new Map<string, unknown>();
  const history = new PromptHistory({
    get(key, defaultValue) {
      return (data.get(key) as typeof defaultValue) ?? defaultValue;
    },
    async update(key, value) {
      data.set(key, value);
    },
  });

  for (let index = 0; index < 42; index += 1) {
    await history.add({ original: `o${index}`, optimized: `n${index}`, profile: "normal" });
  }
  const list = history.list();
  assert.equal(list.length, 40);
  assert.equal(list[0]?.original, "o41");
  assert.ok(history.get(list[0]?.id ?? ""));
  await history.remove(list[0]?.id ?? "");
  assert.equal(history.list().length, 39);
  await history.clear();
  assert.equal(history.list().length, 0);
});
