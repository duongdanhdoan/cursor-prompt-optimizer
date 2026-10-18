import * as vscode from "vscode";

export type OptimizeProgress = (message: string) => void;

export async function withOptimizeProgress<T>(
  run: (report: OptimizeProgress) => Promise<T>,
): Promise<T> {
  return vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title: "Prompt Optimizer",
      cancellable: false,
    },
    async (progress) => {
      progress.report({ message: "Đang enhance prompt…" });
      return run((message) => progress.report({ message }));
    },
  );
}

export function notifyOptimizeSuccess(message: string, warnings: string[]): void {
  if (warnings.length === 0) {
    void vscode.window.showInformationMessage(message);
    return;
  }
  const extra = warnings.length > 1 ? ` (+${warnings.length - 1})` : "";
  void vscode.window.showWarningMessage(`${message} ${warnings[0]}${extra}`);
}
