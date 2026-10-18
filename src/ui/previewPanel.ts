import * as vscode from "vscode";
import type { RequestMetrics } from "../telemetry/requestMetrics";
import { formatMetrics } from "../telemetry/requestMetrics";

export type PreviewSource = "clipboard" | "editor-selection";

export type PreviewInput = {
  original: string;
  optimized: string;
  metrics: RequestMetrics;
  source: PreviewSource;
  editor?: vscode.TextEditor;
  output: vscode.OutputChannel;
};

export async function showPreviewPanel(input: PreviewInput): Promise<void> {
  const panel = vscode.window.createWebviewPanel(
    "promptOptimizerPreview",
    "Prompt Optimizer",
    vscode.ViewColumn.Beside,
    { enableScripts: true, retainContextWhenHidden: true },
  );

  panel.webview.html = renderPreviewHtml(panel.webview, input);

  const subscription = panel.webview.onDidReceiveMessage(async (message: { type?: string }) => {
    if (message.type === "copy") {
      await vscode.env.clipboard.writeText(input.optimized);
      input.output.appendLine(`copy ${formatMetrics(input.metrics)}`);
      void vscode.window.showInformationMessage("Optimized prompt copied. Paste it into Cursor yourself.");
      return;
    }
    if (message.type === "replace" && input.source === "editor-selection" && input.editor) {
      const editor = input.editor;
      const selection = editor.selection;
      if (selection && !selection.isEmpty) {
        await editor.edit((builder) => builder.replace(selection, input.optimized));
        input.output.appendLine(`replace-selection ${formatMetrics(input.metrics)}`);
        void vscode.window.showInformationMessage("Editor selection replaced. The Cursor agent was not started.");
      }
      return;
    }
    if (message.type === "cancel") {
      input.output.appendLine("cancel original-prompt-unchanged");
      panel.dispose();
    }
  });

  panel.onDidDispose(() => subscription.dispose());
}

function renderPreviewHtml(webview: vscode.Webview, input: PreviewInput): string {
  const nonce = String(Date.now());
  const payload = JSON.stringify({
    original: input.original,
    optimized: input.optimized,
    metrics: formatMetrics(input.metrics),
    canReplace: input.source === "editor-selection",
  }).replace(/</g, "\\u003c");

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}';" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Prompt Optimizer</title>
  <style>
    :root {
      color-scheme: dark;
      --bg: #101214;
      --panel: #171a1d;
      --line: #2a3036;
      --text: #e8ecef;
      --muted: #93a0ab;
      --accent: #7dd3c0;
    }
    body {
      margin: 0;
      font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, sans-serif;
      background: var(--bg);
      color: var(--text);
    }
    header, footer {
      padding: 12px 16px;
      border-bottom: 1px solid var(--line);
      display: flex;
      gap: 8px;
      align-items: center;
      justify-content: space-between;
    }
    footer { border-bottom: 0; border-top: 1px solid var(--line); color: var(--muted); font-size: 12px; }
    h1 { font-size: 14px; margin: 0; font-weight: 600; }
    .grid { display: grid; grid-template-columns: 1fr 1fr; min-height: calc(100vh - 96px); }
    section { padding: 16px; overflow: auto; }
    section + section { border-left: 1px solid var(--line); }
    h2 { margin: 0 0 8px; font-size: 12px; color: var(--muted); text-transform: uppercase; letter-spacing: 0.04em; }
    pre {
      white-space: pre-wrap;
      word-break: break-word;
      background: var(--panel);
      border: 1px solid var(--line);
      border-radius: 10px;
      padding: 12px;
      min-height: 240px;
      font: 12.5px/1.5 ui-monospace, SFMono-Regular, Menlo, monospace;
    }
    button {
      border: 0;
      border-radius: 8px;
      padding: 8px 12px;
      cursor: pointer;
      background: var(--accent);
      color: #08201b;
      font-weight: 600;
    }
    button.secondary { background: transparent; color: var(--text); border: 1px solid var(--line); }
    .actions { display: flex; gap: 8px; }
  </style>
</head>
<body>
  <header>
    <h1>Preview optimized prompt</h1>
    <div class="actions">
      <button id="copy">Copy result</button>
      <button id="replace" class="secondary" hidden>Replace selection</button>
      <button id="cancel" class="secondary">Cancel</button>
    </div>
  </header>
  <div class="grid">
    <section>
      <h2>Original</h2>
      <pre id="original"></pre>
    </section>
    <section>
      <h2>Optimized</h2>
      <pre id="optimized"></pre>
    </section>
  </div>
  <footer id="metrics"></footer>
  <script nonce="${nonce}">
    const vscode = acquireVsCodeApi();
    const data = ${payload};
    document.getElementById("original").textContent = data.original;
    document.getElementById("optimized").textContent = data.optimized;
    document.getElementById("metrics").textContent = data.metrics;
    const replaceButton = document.getElementById("replace");
    if (data.canReplace) replaceButton.hidden = false;
    document.getElementById("copy").addEventListener("click", () => vscode.postMessage({ type: "copy" }));
    replaceButton.addEventListener("click", () => vscode.postMessage({ type: "replace" }));
    document.getElementById("cancel").addEventListener("click", () => vscode.postMessage({ type: "cancel" }));
  </script>
</body>
</html>`;
}
