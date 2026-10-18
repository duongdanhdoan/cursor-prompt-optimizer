import * as vscode from "vscode";
import {
  registerChatParticipant,
  registerClipboardOptimizeCommand,
  registerImprovePromptCommand,
  registerOpenSidebarCommand,
  registerSetApiKeyCommand,
} from "./commands/improvePrompt";
import { registerSelectionAffordances } from "./ui/selectionAffordance";
import { PromptHistory } from "./history/promptHistory";
import { PromptOptimizerSidebar, SIDEBAR_VIEW_ID } from "./ui/sidebarView";

export function activate(context: vscode.ExtensionContext): void {
  const output = vscode.window.createOutputChannel("Prompt Optimizer");
  const history = new PromptHistory(context.globalState);
  const sidebar = new PromptOptimizerSidebar(context, output, history);
  const chat = registerChatParticipant(context, output, history);

  context.subscriptions.push(
    output,
    vscode.window.registerWebviewViewProvider(SIDEBAR_VIEW_ID, sidebar, {
      webviewOptions: { retainContextWhenHidden: true },
    }),
    registerImprovePromptCommand(context, output, history, sidebar),
    registerClipboardOptimizeCommand(context, output, history, sidebar),
    registerSetApiKeyCommand(context),
    registerOpenSidebarCommand(sidebar),
    registerSelectionAffordances(),
  );
  if (chat) {
    context.subscriptions.push(chat);
  }
}

export function deactivate(): void {}
