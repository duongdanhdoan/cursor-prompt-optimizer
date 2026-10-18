import assert from "node:assert/strict";
import test from "node:test";
import { isComposerLikeTarget } from "../src/commands/composerTarget";

test("isComposerLikeTarget", async (t) => {
  await t.test("should accept a compact Agent composer at the top of a new chat", () => {
    assert.equal(
      isComposerLikeTarget({
        height: 88,
        width: 640,
        windowHeight: 980,
        description: "Chat input",
        role: "AXTextArea",
      }),
      true,
    );
  });

  await t.test("should accept a compact composer near the bottom", () => {
    assert.equal(
      isComposerLikeTarget({
        height: 72,
        width: 520,
        windowHeight: 980,
        description: "composer",
      }),
      true,
    );
  });

  await t.test("should reject a tall Monaco editor", () => {
    assert.equal(
      isComposerLikeTarget({
        height: 720,
        width: 900,
        windowHeight: 980,
        description: "Editor Monaco",
      }),
      false,
    );
  });

  await t.test("should reject a terminal pane", () => {
    assert.equal(
      isComposerLikeTarget({
        height: 200,
        width: 900,
        windowHeight: 980,
        description: "Terminal",
      }),
      false,
    );
  });
});
