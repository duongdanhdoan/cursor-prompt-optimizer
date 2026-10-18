import * as vscode from "vscode";
import { ExistingMemoryAdapter } from "../memory/ExistingMemoryAdapter";
import { createCodingModelClient } from "../llm/codingModelClient";
import { runImprovePipeline, ImprovePipelineResult } from "./runImprovePipeline";
import { PromptHistory } from "../history/promptHistory";
import { readApiKey, type EffortSetting } from "../config/settingsStore";
import type { ApiStyle } from "../llm/openaiCompatibleClient";
import { extractPromptFromConversation } from "../prompt/extractChatPrompt";
import { readActiveComposerInput } from "./insertIntoAgentChat";

export type OptimizeSource = "clipboard" | "editor-selection" | "sidebar" | "chat";

export async function optimizePromptText(input: {
  context: vscode.ExtensionContext;
  output: vscode.OutputChannel;
  text: string;
  history: PromptHistory;
}): Promise<ImprovePipelineResult> {
  const original = extractPromptFromConversation(input.text);
  if (!original) {
    throw new Error("Nothing to improve. Select the chat prompt, copy it, or run >prompt optimizer on the current message.");
  }

  const projectRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? "";
  const config = vscode.workspace.getConfiguration("promptOptimizer");
  const apiKey = await readApiKey(input.context);
  const stream = config.get<boolean>("llm.stream") ?? true;
  const provider = apiKey
    ? "openai-compatible"
    : config.get<"vscode" | "openai-compatible">("llm.provider") || "vscode";

  const tokenBudget = config.get<number | null>("memory.tokenBudget");
  const maxOutputTokens = config.get<number | null>("llm.maxOutputTokens");
  const apiStyle = config.get<ApiStyle>("llm.apiStyle") || "chat-completions";

  const result = await runImprovePipeline({
    original,
    projectRoot,
    tokenBudget: tokenBudget ?? undefined,
    minScoreRatio: config.get<number>("memory.minScoreRatio") ?? 0.15,
    profile: config.get<"auto" | "simple" | "normal" | "complex" | "large">("profile") ?? "auto",
    temperature: config.get<number>("llm.temperature") ?? 0.1,
    maxOutputTokens: maxOutputTokens ?? undefined,
    stream,
    sendTemperature: config.get<boolean>("llm.sendTemperature") ?? true,
    reasoningEffort: config.get<EffortSetting>("llm.reasoningEffort") ?? "omit",
    adapter: new ExistingMemoryAdapter({
      cliPath: config.get<string>("memory.cliPath") || "codebase-memory-mcp",
    }),
    model: createCodingModelClient({
      provider,
      baseUrl: config.get<string>("llm.baseUrl") || "https://api.openai.com/v1",
      model: config.get<string>("llm.model") || "gpt-4.1",
      apiKey,
      apiStyle,
      stream,
    }),
  });

  await input.history.add({
    original: result.original,
    optimized: result.optimized,
    profile: result.profile,
    apiStyle,
  });
  input.output.appendLine(
    `${new Date().toISOString()} style=${apiStyle} profile=${result.profile} modelRequests=${result.metrics.codingModelRequests}`,
  );
  return result;
}

export async function readPromptSource(options?: { preferComposer?: boolean }): Promise<{
  text: string;
  source: OptimizeSource;
  editor?: vscode.TextEditor;
}> {
  if (options?.preferComposer) {
    const fromComposer = extractPromptFromConversation(await readActiveComposerInput());
    if (fromComposer) {
      return { text: fromComposer, source: "chat" };
    }
  }
  const selected = firstNonEmptySelection();
  if (selected) {
    return {
      text: extractPromptFromConversation(selected.text),
      source: "editor-selection",
      editor: selected.editor,
    };
  }
  const clipboard = extractPromptFromConversation((await vscode.env.clipboard.readText()).trim());
  return { text: clipboard, source: clipboard ? "clipboard" : "sidebar" };
}

export async function applyOptimizedPrompt(input: {
  original: string;
  optimized: string;
  editor?: vscode.TextEditor;
}): Promise<"replaced-selection" | "copied"> {
  const target =
    input.editor && !input.editor.selection.isEmpty
      ? input.editor
      : vscode.window.visibleTextEditors.find((editor) => {
          if (editor.selection.isEmpty) {
            return false;
          }
          const selected = editor.document.getText(editor.selection).trim();
          return Boolean(selected) && (selected === input.original || input.original.includes(selected));
        });

  if (target && !target.selection.isEmpty) {
    const replaced = await target.edit((builder) => builder.replace(target.selection, input.optimized));
    if (replaced) {
      return "replaced-selection";
    }
  }
  await vscode.env.clipboard.writeText(input.optimized);
  return "copied";
}

function firstNonEmptySelection(): { text: string; editor: vscode.TextEditor } | undefined {
  const editors = [vscode.window.activeTextEditor, ...vscode.window.visibleTextEditors].filter(
    (editor): editor is vscode.TextEditor => Boolean(editor),
  );
  const seen = new Set<vscode.TextEditor>();
  for (const editor of editors) {
    if (seen.has(editor) || editor.selection.isEmpty) {
      continue;
    }
    seen.add(editor);
    const text = editor.document.getText(editor.selection).trim();
    if (text) {
      return { text, editor };
    }
  }
  return undefined;
}
