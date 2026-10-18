import assert from "node:assert/strict";
import test from "node:test";
import { extractPromptFromConversation, resolveChatPrompt } from "../src/prompt/extractChatPrompt";

const noisy = [
  "**Tôi kiểm tra thao tác chọn prompt****Tôi kiểm tra thao tác chọn prompt****Tôi kiểm tra cách xác định prompt****Tôi kiểm tra cách xác định prompt**Goal",
  "Sửa `>prompt optimizer` để khi được gọi trong chat agent, nó tự xác định prompt hiện có trong cuộc trò chuyện và chỉnh sửa prompt đó trực tiếp.",
].join("\n");

test("extractPromptFromConversation drops repeated selection fragments and a glued Goal heading", () => {
  const extracted = extractPromptFromConversation(noisy);
  assert.equal(extracted.includes("Tôi kiểm tra thao tác chọn prompt"), false);
  assert.equal(extracted.includes("Tôi kiểm tra cách xác định prompt"), false);
  assert.match(extracted, /Sửa `>prompt optimizer`/);
  assert.doesNotMatch(extracted, /^Goal/m);
});

test("extractPromptFromConversation strips >prompt optimizer command text", () => {
  const extracted = extractPromptFromConversation(">prompt optimizer\nFix the checkout crash in CheckoutController.submit");
  assert.equal(extracted.includes(">prompt optimizer"), false);
  assert.match(extracted, /CheckoutController/);
});

test("extractPromptFromConversation drops a glued bold fragment and a duplicated sentence", () => {
  const duplicated =
    "**Tôi kiểm tra triển khai hiện có**Hãy điều chỉnh hành vi để không mở chat session mới. Khi hiển thị chat, chỉ thay nội dung của chat session hiện đang active trên giao diện.Hãy điều chỉnh hành vi để không mở chat session mới. Khi hiển thị chat, chỉ thay nội dung của chat session hiện đang active trên giao diện.";
  const extracted = extractPromptFromConversation(duplicated);
  assert.equal(extracted.includes("Tôi kiểm tra triển khai hiện có"), false);
  assert.equal(
    extracted,
    "Hãy điều chỉnh hành vi để không mở chat session mới. Khi hiển thị chat, chỉ thay nội dung của chat session hiện đang active trên giao diện.",
  );
});

test("resolveChatPrompt prefers attached selection then previous user turn", () => {
  const fromRefs = resolveChatPrompt(
    {
      prompt: ">prompt optimizer",
      references: [{ value: "Increase padding on the product card." }],
    },
    [],
  );
  assert.equal(fromRefs, "Increase padding on the product card.");

  const fromHistory = resolveChatPrompt({ prompt: ">prompt optimizer" }, [
    { prompt: "Fix CheckoutController.submit throwing TypeError" },
  ]);
  assert.match(fromHistory, /CheckoutController/);
});
