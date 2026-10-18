import * as vscode from "vscode";
import type { LlmUiConfig } from "../config/settingsStore";
import type { TaskContract } from "../prompt/taskContract";

export type SidebarRenderState = {
  config: LlmUiConfig;
  original: string;
  optimized: string;
  metrics: string;
  error: string;
  busy: boolean;
  warnings: string[];
  contract: TaskContract | null;
  history: Array<{
    id: string;
    createdAt: string;
    originalPreview: string;
    optimizedPreview: string;
    profile?: string;
  }>;
};

export function renderSidebarHtml(webview: vscode.Webview, state: SidebarRenderState): string {
  const nonce = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const payload = JSON.stringify(state).replace(/</g, "\\u003c");
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}';" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <style>
    :root { color-scheme: dark; }
    body {
      margin: 0;
      padding: 10px;
      font: 12px/1.45 var(--vscode-font-family);
      color: var(--vscode-foreground);
      background: var(--vscode-sideBar-background);
    }
    h1, h2 { margin: 0 0 8px; font-size: 11px; letter-spacing: .04em; text-transform: uppercase; opacity: .75; }
    .clock {
      font-variant-numeric: tabular-nums;
      font-size: 13px;
      font-weight: 600;
      margin-bottom: 4px;
    }
    .muted { opacity: .7; font-size: 11px; margin-bottom: 10px; }
    section {
      border: 1px solid var(--vscode-widget-border, #2a3036);
      border-radius: 8px;
      padding: 8px;
      margin-bottom: 10px;
      background: var(--vscode-editor-background);
    }
    label { display: block; margin: 6px 0 3px; opacity: .8; }
    input, select, textarea {
      width: 100%;
      box-sizing: border-box;
      border: 1px solid var(--vscode-input-border, #3a4148);
      background: var(--vscode-input-background);
      color: var(--vscode-input-foreground);
      border-radius: 6px;
      padding: 6px 8px;
      font: inherit;
      user-select: text;
      -webkit-user-select: text;
    }
    textarea { min-height: 120px; resize: vertical; }
    textarea.section { min-height: 72px; }
    .warn { color: var(--vscode-editorWarning-foreground, #d6a23a); white-space: pre-wrap; margin: 0 0 8px; }
    .status {
      display: none;
      margin: 8px 0;
      padding: 8px;
      border-radius: 6px;
      background: var(--vscode-editorWidget-background, #1f2428);
      border: 1px solid var(--vscode-widget-border, #2a3036);
    }
    .status.visible { display: block; }
    .row { display: flex; gap: 6px; flex-wrap: wrap; margin-top: 8px; }
    button {
      border: 0;
      border-radius: 6px;
      padding: 6px 8px;
      cursor: pointer;
      background: var(--vscode-button-background);
      color: var(--vscode-button-foreground);
      font-weight: 600;
    }
    button.secondary {
      background: transparent;
      color: var(--vscode-foreground);
      border: 1px solid var(--vscode-widget-border, #2a3036);
    }
    button:disabled { opacity: .5; cursor: default; }
    pre {
      white-space: pre-wrap;
      word-break: break-word;
      max-height: 180px;
      overflow: auto;
      margin: 0;
      font: 11px/1.45 var(--vscode-editor-font-family, monospace);
    }
    .error { color: var(--vscode-errorForeground, #f88); margin: 0 0 8px; }
    .history-item {
      width: 100%;
      text-align: left;
      background: transparent;
      color: inherit;
      border: 0;
      padding: 6px 0;
      border-bottom: 1px solid var(--vscode-widget-border, #2a3036);
      font-weight: 400;
    }
    .history-meta { opacity: .65; font-size: 10px; }
  </style>
</head>
<body>
  <div class="clock" id="clock"></div>
  <div class="muted" id="savedAt"></div>

  <section>
    <h2>API config</h2>
    <label>API URL</label>
    <input id="apiUrl" placeholder="https://api.openai.com/v1" />
    <label>API key</label>
    <input id="apiKey" type="password" autocomplete="off" />
    <label>Call type</label>
    <select id="apiStyle">
      <option value="chat-completions">Chat Completions</option>
      <option value="responses">Responses</option>
      <option value="messages">Messages</option>
    </select>
    <label>Effort</label>
    <select id="effort">
      <option value="omit">omit</option>
      <option value="minimal">minimal</option>
      <option value="low">low</option>
      <option value="medium">medium</option>
      <option value="high">high</option>
    </select>
    <label>Model</label>
    <input id="model" placeholder="gpt-4.1" />
    <div class="row">
      <button id="save">Save config</button>
    </div>
  </section>

  <section>
    <h2>Optimize</h2>
    <p class="muted">Cursor Agent chat cannot be edited by extensions. Copy the chat prompt, optimize here, then paste back.</p>
    <textarea id="prompt" placeholder="Paste the Cursor Agent prompt" spellcheck="false"></textarea>
    <div class="row">
      <button id="loadChat" class="secondary">Load chat clipboard</button>
      <button id="loadSel" class="secondary">Load selection</button>
      <button id="clearPrompt" class="secondary">Clear</button>
    </div>
    <div class="row">
      <button id="optimizeChat">Optimize chat prompt</button>
      <button id="optimize">Optimize</button>
    </div>
    <p class="error" id="error"></p>
    <div class="status" id="status">Đang enhance prompt…</div>
    <h2>Result</h2>
    <div class="warn" id="warnings"></div>
    <div id="sections"></div>
    <textarea id="result" hidden spellcheck="false"></textarea>
    <div class="muted" id="metrics"></div>
    <div class="row">
      <button id="copy">Copy to Cursor chat</button>
    </div>
  </section>

  <section>
    <h2>History</h2>
    <div id="history"></div>
    <div class="row">
      <button id="clear" class="secondary">Clear history</button>
    </div>
  </section>

  <script nonce="${nonce}">
    const vscode = acquireVsCodeApi();
    const state = ${payload};

    const clock = document.getElementById("clock");
    const savedAt = document.getElementById("savedAt");
    const apiUrl = document.getElementById("apiUrl");
    const apiKey = document.getElementById("apiKey");
    const apiStyle = document.getElementById("apiStyle");
    const effort = document.getElementById("effort");
    const model = document.getElementById("model");
    const prompt = document.getElementById("prompt");
    const result = document.getElementById("result");
    const sections = document.getElementById("sections");
    const warnings = document.getElementById("warnings");
    const metrics = document.getElementById("metrics");
    const error = document.getElementById("error");
    const status = document.getElementById("status");
    const history = document.getElementById("history");
    const HEADINGS = [
      ["context", "1. Context"],
      ["objective", "2. Objective"],
      ["steps", "3. Steps"],
      ["output", "4. Output"],
      ["constraints", "5. Constraints and Rules"]
    ];
    function serializeContract() {
      if (state.contract) {
        return HEADINGS.map(([id, heading]) => {
          const value = (document.getElementById(id)?.value || "").trim();
          return "## " + heading + "\\n\\n" + value;
        }).join("\\n\\n");
      }
      return result.value;
    }
    function emitOptimized() {
      vscode.postMessage({ type: "editOptimized", optimized: serializeContract() });
    }

    function tick() {
      clock.textContent = new Date().toLocaleString();
    }
    tick();
    setInterval(tick, 1000);

    apiUrl.value = state.config.apiUrl || "";
    apiStyle.value = state.config.apiStyle || "chat-completions";
    effort.value = state.config.effort || "omit";
    model.value = state.config.model || "";
    apiKey.placeholder = state.config.hasApiKey ? "Saved · enter a new key to replace" : "Not saved yet";
    savedAt.textContent = state.config.savedAt
      ? "Config saved " + new Date(state.config.savedAt).toLocaleString()
      : "Config not saved yet";
    prompt.value = state.original || "";
    warnings.textContent = (state.warnings || []).join("\\n");
    metrics.textContent = state.metrics || "";
    error.textContent = state.error || "";
    status.textContent = state.busy ? "Đang enhance prompt…" : "";
    status.classList.toggle("visible", Boolean(state.busy));
    if (state.contract) {
      sections.innerHTML = HEADINGS.map(([id, heading]) =>
        "<label>" + heading + "</label><textarea id=\\"" + id + "\\" class=\\"section\\" spellcheck=\\"false\\"></textarea>"
      ).join("");
      HEADINGS.forEach(([id]) => {
        const field = document.getElementById(id);
        field.value = state.contract[id] || "";
        field.addEventListener("input", emitOptimized);
      });
    } else {
      result.hidden = false;
      result.value = state.optimized || "";
      result.addEventListener("input", emitOptimized);
    }
    if (state.busy) {
      document.querySelectorAll("button").forEach((button) => button.disabled = true);
    }

    history.innerHTML = state.history.length
      ? state.history.map((item) => (
          '<button class="history-item" data-id="' + item.id + '">' +
            '<div class="history-meta">' + new Date(item.createdAt).toLocaleString() +
              (item.profile ? " · " + item.profile : "") + "</div>" +
            "<div>" + escapeHtml(item.originalPreview) + "</div>" +
          "</button>"
        )).join("")
      : '<div class="muted">No optimized prompts yet.</div>';

    document.getElementById("save").addEventListener("click", () => {
      vscode.postMessage({
        type: "saveConfig",
        apiUrl: apiUrl.value,
        apiStyle: apiStyle.value,
        effort: effort.value,
        model: model.value,
        apiKey: apiKey.value
      });
    });
    document.addEventListener("keydown", (event) => {
      const target = event.target;
      if (!(target instanceof HTMLTextAreaElement) && !(target instanceof HTMLInputElement)) {
        return;
      }
      const modifier = event.metaKey || event.ctrlKey;
      const key = event.key.toLowerCase();
      if (modifier && key === "a") {
        event.preventDefault();
        event.stopPropagation();
        target.select();
      }
    }, true);

    prompt.addEventListener("input", () => {
      vscode.postMessage({ type: "draft", prompt: prompt.value });
    });
    document.getElementById("loadChat").addEventListener("click", () => vscode.postMessage({ type: "loadClipboard" }));
    document.getElementById("loadSel").addEventListener("click", () => vscode.postMessage({ type: "loadSelection" }));
    document.getElementById("clearPrompt").addEventListener("click", () => {
      prompt.value = "";
      prompt.focus();
      vscode.postMessage({ type: "clearPrompt" });
    });
    document.getElementById("optimize").addEventListener("click", () => vscode.postMessage({ type: "optimize", prompt: prompt.value }));
    document.getElementById("optimizeChat").addEventListener("click", () => vscode.postMessage({ type: "optimizeChat", prompt: prompt.value }));
    document.getElementById("copy").addEventListener("click", () => vscode.postMessage({ type: "copyResult", optimized: serializeContract() }));
    document.getElementById("clear").addEventListener("click", () => vscode.postMessage({ type: "clearHistory" }));
    history.addEventListener("click", (event) => {
      const button = event.target.closest("[data-id]");
      if (button) vscode.postMessage({ type: "openHistory", id: button.getAttribute("data-id") });
    });

    function escapeHtml(value) {
      return String(value)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;");
    }
  </script>
</body>
</html>`;
}
