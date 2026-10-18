import * as vscode from "vscode";
import { PromptHistory, historyPreview } from "../history/promptHistory";
import { optimizePromptText } from "../commands/optimizeRunner";
import { formatMetrics } from "../telemetry/requestMetrics";
import { loadLlmUiConfig, saveLlmUiConfig } from "../config/settingsStore";
import { renderSidebarHtml } from "./sidebarHtml";
import type { ImprovePipelineResult } from "../commands/runImprovePipeline";
import type { ApiStyle } from "../llm/openaiCompatibleClient";
import type { EffortSetting } from "../config/settingsStore";

export const SIDEBAR_VIEW_ID = "promptOptimizer.sidebar";

export class PromptOptimizerSidebar implements vscode.WebviewViewProvider {
  private view?: vscode.WebviewView;
  original = "";
  optimized = "";
  private metrics = "";
  private error = "";
  private busy = false;

  constructor(
    private readonly context: vscode.ExtensionContext,
    private readonly output: vscode.OutputChannel,
    private readonly history: PromptHistory,
  ) {}

  resolveWebviewView(webviewView: vscode.WebviewView): void {
    this.view = webviewView;
    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [vscode.Uri.joinPath(this.context.extensionUri, "media")],
    };
    void this.refresh();
    webviewView.webview.onDidReceiveMessage((message: SidebarMessage) => {
      void this.onMessage(message);
    });
  }

  async reveal(): Promise<void> {
    await vscode.commands.executeCommand(`${SIDEBAR_VIEW_ID}.focus`);
  }

  private async onMessage(message: SidebarMessage): Promise<void> {
    switch (message.type) {
      case "saveConfig":
        await saveLlmUiConfig(this.context, {
          apiUrl: message.apiUrl,
          apiStyle: message.apiStyle,
          effort: message.effort,
          model: message.model,
          apiKey: message.apiKey,
        });
        this.error = "";
        await this.refresh();
        void vscode.window.showInformationMessage("Prompt Optimizer config saved.");
        return;
      case "loadSelection": {
        const editor = vscode.window.activeTextEditor;
        const selected = editor?.document.getText(editor.selection).trim() ?? "";
        this.original = selected;
        this.error = selected ? "" : "No editor selection. Copy the Cursor chat prompt instead.";
        await this.refresh();
        return;
      }
      case "loadClipboard":
        this.original = (await vscode.env.clipboard.readText()).trim();
        this.error = this.original ? "" : "Clipboard is empty. Copy the Cursor Agent prompt first.";
        await this.refresh();
        return;
      case "draft":
        this.original = message.prompt;
        return;
      case "clearPrompt":
        this.original = "";
        this.error = "";
        return;
      case "optimize":
        await this.optimize(message.prompt || this.original, false);
        return;
      case "optimizeChat":
        await this.optimize((await vscode.env.clipboard.readText()).trim() || message.prompt || this.original, true);
        return;
      case "copyResult":
        if (this.optimized) {
          await vscode.env.clipboard.writeText(this.optimized);
          void vscode.window.showInformationMessage("Optimized prompt copied. Paste it into Cursor Agent chat.");
        }
        return;
      case "openHistory": {
        const item = this.history.get(message.id);
        if (item) {
          this.original = item.original;
          this.optimized = item.optimized;
          this.metrics = `${item.profile ?? ""} · ${item.createdAt}`;
          this.error = "";
          await this.refresh();
        }
        return;
      }
      case "deleteHistory":
        await this.history.remove(message.id);
        await this.refresh();
        return;
      case "clearHistory":
        await this.history.clear();
        await this.refresh();
        return;
      default:
        return;
    }
  }

  async optimize(text: string, copyBackToClipboard: boolean): Promise<ImprovePipelineResult | undefined> {
    if (this.busy) {
      return undefined;
    }
    this.busy = true;
    this.error = "";
    this.original = text;
    await this.refresh();
    try {
      const result = await vscode.window.withProgress(
        {
          location: vscode.ProgressLocation.Notification,
          title: "Prompt Optimizer",
          cancellable: false,
        },
        async () =>
          optimizePromptText({
            context: this.context,
            output: this.output,
            text,
            history: this.history,
          }),
      );
      this.original = result.original;
      this.optimized = result.optimized;
      this.metrics = formatMetrics(result.metrics);
      if (copyBackToClipboard) {
        await vscode.env.clipboard.writeText(result.optimized);
        void vscode.window.showInformationMessage("Optimized prompt copied. Paste it into Cursor Agent chat.");
      }
      return result;
    } catch (error) {
      this.error = error instanceof Error ? error.message : "Optimize failed.";
      this.output.appendLine(`error ${this.error}`);
      void vscode.window.showErrorMessage(this.error);
      return undefined;
    } finally {
      this.busy = false;
      await this.refresh();
    }
  }

  private async refresh(): Promise<void> {
    if (!this.view) {
      return;
    }
    const config = await loadLlmUiConfig(this.context);
    this.view.webview.html = renderSidebarHtml(this.view.webview, {
      config,
      original: this.original,
      optimized: this.optimized,
      metrics: this.metrics,
      error: this.error,
      busy: this.busy,
      history: this.history.list().map(historyPreview),
    });
  }
}

type SidebarMessage =
  | {
      type: "saveConfig";
      apiUrl: string;
      apiStyle: ApiStyle;
      effort: EffortSetting;
      model: string;
      apiKey?: string;
    }
  | { type: "loadSelection" }
  | { type: "loadClipboard" }
  | { type: "draft"; prompt: string }
  | { type: "clearPrompt" }
  | { type: "optimize"; prompt: string }
  | { type: "optimizeChat"; prompt: string }
  | { type: "copyResult" }
  | { type: "openHistory"; id: string }
  | { type: "deleteHistory"; id: string }
  | { type: "clearHistory" };
