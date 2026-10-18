import * as vscode from "vscode";

const IMPROVE_TITLE = "Improve Prompt";

export function registerSelectionAffordances(): vscode.Disposable {
  return vscode.Disposable.from(registerStatusBarItem(), registerCodeActions());
}

function registerStatusBarItem(): vscode.Disposable {
  const item = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
  item.command = "promptOptimizer.improveSelection";
  item.text = "$(wand) Improve Prompt";
  item.tooltip = "Rewrite the selected text with Semantic Codebase Memory";

  const update = (): void => {
    const editor = vscode.window.activeTextEditor;
    if (editor && !editor.selection.isEmpty) {
      item.show();
    } else {
      item.hide();
    }
  };

  update();
  return vscode.Disposable.from(
    item,
    vscode.window.onDidChangeActiveTextEditor(update),
    vscode.window.onDidChangeTextEditorSelection(update),
  );
}

function registerCodeActions(): vscode.Disposable {
  return vscode.languages.registerCodeActionsProvider(
    [{ scheme: "file" }, { scheme: "untitled" }],
    {
      provideCodeActions(_document, range) {
        if (range.isEmpty) {
          return [];
        }
        const action = new vscode.CodeAction(IMPROVE_TITLE, vscode.CodeActionKind.RefactorRewrite);
        action.command = {
          command: "promptOptimizer.improveSelection",
          title: IMPROVE_TITLE,
        };
        return [action];
      },
    },
  );
}
