import * as vscode from "vscode";
import { applyOptimizedPrompt, optimizePromptText, readPromptSource } from "./optimizeRunner";
import { insertIntoAgentChatInput } from "./insertIntoAgentChat";
import { resolveChatPrompt } from "../prompt/extractChatPrompt";
import { PromptOptimizerSidebar } from "../ui/sidebarView";
import { PromptHistory } from "../history/promptHistory";
import { saveLlmUiConfig, type EffortSetting } from "../config/settingsStore";
import type { ApiStyle } from "../llm/openaiCompatibleClient";

export function registerImprovePromptCommand(
  context: vscode.ExtensionContext,
  output: vscode.OutputChannel,
  history: PromptHistory,
  _sidebar: PromptOptimizerSidebar,
): vscode.Disposable {
  const run = async () => {
    const { text, editor } = await readPromptSource();
    if (!text) {
      void vscode.window.showWarningMessage(
        "Select or copy the current chat prompt, then run Prompt Optimizer: prompt optimizer.",
      );
      return;
    }

    try {
      const result = await vscode.window.withProgress(
        {
          location: vscode.ProgressLocation.Notification,
          title: "Prompt Optimizer",
          cancellable: false,
        },
        async () =>
          optimizePromptText({
            context,
            output,
            text,
            history,
          }),
      );

      const applied = await insertIntoAgentChatInput(result.optimized);
      if (applied === "input") {
        return;
      }
      const replaced = await applyOptimizedPrompt({
        original: result.original,
        optimized: result.optimized,
        editor,
      });
      if (replaced === "copied") {
        void vscode.window.showInformationMessage("Optimized prompt copied. Paste it into the Agent chat input.");
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Optimize failed.";
      output.appendLine(`error ${message}`);
      void vscode.window.showErrorMessage(message);
    }
  };

  return vscode.Disposable.from(
    vscode.commands.registerCommand("promptOptimizer.improveSelection", run),
    vscode.commands.registerCommand("promptOptimizer.fromChat", run),
  );
}

export function registerClipboardOptimizeCommand(
  context: vscode.ExtensionContext,
  output: vscode.OutputChannel,
  history: PromptHistory,
  _sidebar: PromptOptimizerSidebar,
): vscode.Disposable {
  return vscode.commands.registerCommand("promptOptimizer.optimizeClipboard", async () => {
    const text = (await vscode.env.clipboard.readText()).trim();
    if (!text) {
      void vscode.window.showWarningMessage("Clipboard is empty.");
      return;
    }
    const result = await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: "Prompt Optimizer",
        cancellable: false,
      },
      async () =>
        optimizePromptText({
          context,
          output,
          text,
          history,
        }),
    );
    const applied = await insertIntoAgentChatInput(result.optimized);
    if (applied !== "input") {
      void vscode.window.showInformationMessage("Optimized prompt copied. Paste it into the Agent chat input.");
    }
  });
}

export function registerSetApiKeyCommand(context: vscode.ExtensionContext): vscode.Disposable {
  return vscode.commands.registerCommand("promptOptimizer.setOpenAIApiKey", async () => {
    const value = await vscode.window.showInputBox({
      title: "OpenAI-compatible API key",
      password: true,
      ignoreFocusOut: true,
      prompt: "Stored in Secret Storage. It is not written to logs.",
    });
    if (value) {
      const config = vscode.workspace.getConfiguration("promptOptimizer");
      await saveLlmUiConfig(context, {
        apiUrl: config.get<string>("llm.baseUrl") || "https://api.openai.com/v1",
        apiStyle: config.get<ApiStyle>("llm.apiStyle") || "chat-completions",
        effort: config.get<EffortSetting>("llm.reasoningEffort") || "omit",
        model: config.get<string>("llm.model") || "gpt-4.1",
        apiKey: value,
      });
      void vscode.window.showInformationMessage("API key saved.");
    }
  });
}

export function registerOpenSidebarCommand(sidebar: PromptOptimizerSidebar): vscode.Disposable {
  return vscode.commands.registerCommand("promptOptimizer.openSidebar", () => sidebar.reveal());
}

export function registerChatParticipant(
  context: vscode.ExtensionContext,
  output: vscode.OutputChannel,
  history: PromptHistory,
): vscode.Disposable | undefined {
  if (!vscode.chat?.createChatParticipant) {
    return undefined;
  }
  const participant = vscode.chat.createChatParticipant(
    "promptOptimizer.optimize",
    async (request, chatContext, response) => {
      try {
        const fromChat = resolveChatPrompt(
          request,
          chatContext.history.map((turn) => ("prompt" in turn ? { prompt: turn.prompt } : {})),
        );
        const text = fromChat || (await vscode.env.clipboard.readText()).trim();
        const result = await optimizePromptText({
          context,
          output,
          text,
          history,
        });
        await insertIntoAgentChatInput(result.optimized);
      } catch (error) {
        const message = error instanceof Error ? error.message : "Optimize failed.";
        response.markdown(message);
      }
    },
  );
  participant.iconPath = vscode.Uri.joinPath(context.extensionUri, "media", "icon.svg");
  return participant;
}
