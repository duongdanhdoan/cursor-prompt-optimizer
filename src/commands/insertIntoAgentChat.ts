import { execFile } from "node:child_process";
import { promisify } from "node:util";
import * as vscode from "vscode";

const execFileAsync = promisify(execFile);

export type AgentInputInsertResult = "input" | "copied";

export async function insertIntoAgentChatInput(
  prompt: string,
  log?: (message: string) => void,
): Promise<AgentInputInsertResult> {
  const text = prompt.trim();
  if (!text) {
    return "copied";
  }

  await vscode.env.clipboard.writeText(text);
  const focused = await focusActiveComposer();
  log?.(`composer.focusComposer ${focused ? "ok" : "missing-or-failed"}`);
  await delay(focused ? 400 : 200);

  if (process.platform === "darwin") {
    const result = await clickComposerAndPaste();
    log?.(`composer-ax ${result}`);
    if (result === "paste") {
      return "input";
    }
  }
  return "copied";
}

export async function readActiveComposerInput(log?: (message: string) => void): Promise<string> {
  const focused = await focusActiveComposer();
  log?.(`composer.focusComposer ${focused ? "ok" : "missing-or-failed"}`);
  await delay(250);
  if (process.platform !== "darwin") {
    return "";
  }
  const result = await clickComposerAndRead();
  log?.(`composer-ax-read ${result.slice(0, 80)}`);
  if (!result.startsWith("ok:")) {
    return "";
  }
  return result.slice(3).trim();
}

export async function focusActiveComposer(): Promise<boolean> {
  const available = new Set(await vscode.commands.getCommands(true));
  if (!available.has("composer.focusComposer")) {
    return false;
  }
  try {
    await vscode.commands.executeCommand("composer.focusComposer");
    return true;
  } catch {
    return false;
  }
}

async function clickComposerAndPaste(): Promise<string> {
  return runAppleScript(pasteScript());
}

async function clickComposerAndRead(): Promise<string> {
  return runAppleScript(readScript());
}

async function runAppleScript(script: string): Promise<string> {
  try {
    const { stdout, stderr } = await execFileAsync("osascript", ["-e", script], { timeout: 8000 });
    return (stdout.trim() || stderr.trim() || "empty");
  } catch (error) {
    const err = error as { stdout?: string; stderr?: string; message?: string };
    return (err.stderr || err.stdout || err.message || "fail").trim().split("\n")[0] ?? "fail";
  }
}

function pasteScript(): string {
  return `
tell application "Cursor" to activate
delay 0.15
tell application "System Events"
  tell process "Cursor"
    set frontmost to true
    delay 0.08
    set {wx, wy} to position of window 1
    set {ww, wh} to size of window 1
    set pts to {{wx + (ww * 0.72) as integer, wy + wh - 56}, {wx + (ww * 0.5) as integer, wy + wh - 56}, {wx + (ww * 0.72) as integer, wy + wh - 96}, {wx + (ww * 0.5) as integer, wy + wh - 96}, {wx + (ww * 0.85) as integer, wy + wh - 72}}
    repeat with p in pts
      click at p
      delay 0.1
      try
        set el to value of attribute "AXFocusedUIElement"
        set {ew, eh} to size of el
        set {ex, ey} to position of el
        set desc to ""
        try
          set desc to description of el
        end try
        if desc contains "Editor" or desc contains "Monaco" or desc contains "Terminal" then
          -- skip code editor
        else if eh > wh * 0.45 then
          -- skip tall monaco editor
        else if (ey + eh) < (wy + wh * 0.52) then
          -- skip controls in the upper half
        else
          keystroke "a" using {command down}
          delay 0.05
          keystroke "v" using {command down}
          return "paste"
        end if
      end try
    end repeat
    return "not-composer"
  end tell
end tell
`;
}

function readScript(): string {
  return `
tell application "Cursor" to activate
delay 0.1
tell application "System Events"
  tell process "Cursor"
    set frontmost to true
    set {wx, wy} to position of window 1
    set {ww, wh} to size of window 1
    click at {wx + (ww * 0.72) as integer, wy + wh - 56}
    delay 0.1
    try
      set el to value of attribute "AXFocusedUIElement"
      set {ew, eh} to size of el
      set {ex, ey} to position of el
      if eh > wh * 0.45 then
        return "editor-focused"
      end if
      if (ey + eh) < (wy + wh * 0.52) then
        return "not-composer"
      end if
      try
        return "ok:" & (value of el as text)
      on error
        return "ok:"
      end try
    on error
      return "no-focus"
    end try
  end tell
end tell
`;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
