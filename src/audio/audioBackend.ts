import * as vscode from "vscode";

export interface AudioBackend extends vscode.Disposable {
  play(filePath: string, volume: number): void;
}

export function isRemoteEnvironment(): boolean {
  return (
    vscode.env.remoteName !== undefined ||
    vscode.env.uiKind === vscode.UIKind.Web
  );
}
