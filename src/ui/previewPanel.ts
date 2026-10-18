import * as vscode from "vscode";
import type { RequestMetrics } from "../telemetry/requestMetrics";
import { formatMetrics } from "../telemetry/requestMetrics";
import { parseTaskContract } from "../prompt/taskContract";
import { notifyOptimizeSuccess } from "./notifyOptimizeResult";

export type PreviewSource = "clipboard" | "editor-selection";

export type PreviewInput = {
  original: string;
  optimized: string;
  metrics: RequestMetrics;
  source: PreviewSource;
  editor?: vscode.TextEditor;
  output: vscode.OutputChannel;
  warnings?: string[];
};

export async function showPreviewPanel(input: PreviewInput): Promise<void> {
  const panel = vscode.window.createWebviewPanel(
    "promptOptimizerPreview",
    "Prompt Optimizer",
    vscode.ViewColumn.Beside,
    { enableScripts: true, retainContextWhenHidden: true },
  );

  let optimized = input.optimized;
  panel.webview.html = renderPreviewHtml(panel.webview, input, optimized);

  const subscription = panel.webview.onDidReceiveMessage(async (message: { type?: string; optimized?: string }) => {
    if (typeof message.optimized === "string" && message.optimized.trim()) {
      optimized = message.optimized;
    }
    if (message.type === "copy") {
      await vscode.env.clipboard.writeText(optimized);
      input.output.appendLine(`copy ${formatMetrics(input.metrics)}`);
      notifyOptimizeSuccess("Optimized prompt copied. Paste it into Cursor yourself.", input.warnings ?? []);
      return;
    }
    if (message.type === "replace" && input.source === "editor-selection" && input.editor) {
      const editor = input.editor;
      const selection = editor.selection;
      if (selection && !selection.isEmpty) {
        await editor.edit((builder) => builder.replace(selection, optimized));
        input.output.appendLine(`replace-selection ${formatMetrics(input.metrics)}`);
        notifyOptimizeSuccess("Editor selection replaced. The Cursor agent was not started.", input.warnings ?? []);
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

function renderPreviewHtml(webview: vscode.Webview, input: PreviewInput, optimized: string): string {
  const nonce = String(Date.now());
  const parsed = parseTaskContract(optimized);
  const contract = parsed && parsed.missing.length === 0 ? parsed.contract : null;
  const payload = JSON.stringify({
    original: input.original,
    optimized,
    contract,
    warnings: input.warnings ?? [],
    canReplace: input.source === "editor-selection" && Boolean(input.editor),
    metrics: formatMetrics(input.metrics),
  }).replace(/</g, "\\u003c");

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src ${webview.cspSource} https:; script-src 'nonce-${nonce}'; style-src ${webview.cspSource} 'unsafe-inline';" />
  <style>
    :root { color-scheme: light dark; --bg: var(--vscode-editor-background); --fg: var(--vscode-foreground); --line: var(--vscode-widget-border, #3a3a3a); }
    html, body { height: 100%; margin: 0; background: var(--bg); color: var(--fg); font: 13px/1.45 var(--vscode-font-family); }
    .layout { display: grid; grid-template-columns: 1fr 1fr; grid-template-rows: auto 1fr auto; height: 100%; }
    header, footer { grid-column: 1 / -1; padding: 12px 16px; border-bottom: 1px solid var(--line); }
    footer { border-top: 1px solid var(--line); border-bottom: 0; display: flex; gap: 8px; }
    section { padding: 16px; overflow: auto; }
    section + section { border-left: 1px solid var(--line); }
    h1, h2 { margin: 0 0 8px; font-size: 12px; letter-spacing: .04em; text-transform: uppercase; opacity: .75; }
    pre, textarea { white-space: pre-wrap; font: 12px/1.45 var(--vscode-editor-font-family, monospace); }
    textarea { width: 100%; box-sizing: border-box; min-height: 88px; margin: 0 0 10px; background: transparent; color: inherit; border: 1px solid var(--line); border-radius: 6px; padding: 8px; resize: vertical; }
    .warn { color: var(--vscode-editorWarning-foreground, #d6a23a); white-space: pre-wrap; margin: 0 0 8px; }
    button { border: 0; border-radius: 6px; padding: 6px 10px; cursor: pointer; background: var(--vscode-button-background); color: var(--vscode-button-foreground); }
    button.secondary { background: transparent; color: var(--fg); border: 1px solid var(--line); }
  </style>
</head>
<body>
  <div class="layout">
    <header>
      <h1>Preview enhanced prompt</h1>
      <div>${escapeHtml(formatMetrics(input.metrics))}</div>
      <div class="warn">${escapeHtml((input.warnings ?? []).join("\n"))}</div>
    </header>
    <section>
      <h2>Original</h2>
      <pre id="original"></pre>
    </section>
    <section>
      <h2>Enhanced</h2>
      <div id="sections"></div>
      <textarea id="optimized" hidden spellcheck="false"></textarea>
    </section>
    <footer>
      <button id="copy">Copy</button>
      <button id="replace"${input.source === "editor-selection" && input.editor ? "" : " hidden"}>Replace selection</button>
      <button id="cancel" class="secondary">Cancel</button>
    </footer>
  </div>
  <script nonce="${nonce}">
    const vscode = acquireVsCodeApi();
    const state = ${payload};
    const HEADINGS = [
      ["context", "1. Context"],
      ["objective", "2. Objective"],
      ["steps", "3. Steps"],
      ["output", "4. Output"],
      ["constraints", "5. Constraints and Rules"]
    ];
    document.getElementById("original").textContent = state.original;
    const optimizedField = document.getElementById("optimized");
    const sections = document.getElementById("sections");
    function serializeContract() {
      if (state.contract) {
        return HEADINGS.map(([id, heading]) => {
          const value = (document.getElementById(id)?.value || "").trim();
          return "## " + heading + "\\n\\n" + value;
        }).join("\\n\\n");
      }
      return optimizedField.value;
    }
    if (state.contract) {
      sections.innerHTML = HEADINGS.map(([id, heading]) =>
        "<h2>" + heading + "</h2><textarea id=\\"" + id + "\\" spellcheck=\\"false\\"></textarea>"
      ).join("");
      HEADINGS.forEach(([id]) => {
        document.getElementById(id).value = state.contract[id] || "";
      });
    } else {
      optimizedField.hidden = false;
      optimizedField.value = state.optimized || "";
    }
    document.getElementById("copy").addEventListener("click", () => {
      vscode.postMessage({ type: "copy", optimized: serializeContract() });
    });
    document.getElementById("replace").addEventListener("click", () => {
      vscode.postMessage({ type: "replace", optimized: serializeContract() });
    });
    document.getElementById("cancel").addEventListener("click", () => vscode.postMessage({ type: "cancel" }));
  </script>
</body>
</html>`;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
