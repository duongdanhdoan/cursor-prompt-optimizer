import { execFile } from "node:child_process";
import { promisify } from "node:util";
import * as vscode from "vscode";

const execFileAsync = promisify(execFile);

export type AgentInputInsertResult = "input" | "copied";

export async function insertIntoAgentChatInput(prompt: string): Promise<AgentInputInsertResult> {
  const text = prompt.trim();
  if (!text) {
    return "copied";
  }

  await vscode.env.clipboard.writeText(text);
  const available = new Set(await vscode.commands.getCommands(true));

  const focused = await focusActiveComposer(available);
  if (!focused) {
    return "copied";
  }

  await delay(150);
  if (process.platform === "darwin" && (await replaceMacComposerInput())) {
    return "input";
  }
  return "copied";
}

async function focusActiveComposer(available: Set<string>): Promise<boolean> {
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

async function replaceMacComposerInput(): Promise<boolean> {
  const script = [
    'tell application "Cursor" to activate',
    "delay 0.08",
    'tell application "System Events"',
    '  tell process "Cursor"',
    "    set frontmost to true",
    '    keystroke "a" using {command down}',
    "    delay 0.05",
    '    keystroke "v" using {command down}',
    "  end tell",
    "end tell",
  ].join("\n");

  try {
    await execFileAsync("osascript", ["-e", script], { timeout: 4000 });
    return true;
  } catch {
    return false;
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
