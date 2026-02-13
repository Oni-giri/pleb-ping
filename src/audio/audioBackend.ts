import * as vscode from "vscode";

/**
 * Interface for playing audio. Two implementations:
 * - NativeBackend: uses afplay/paplay (only works when extension runs locally)
 * - WebviewBackend: uses a hidden webview (works everywhere including Remote-SSH)
 */
export interface AudioBackend extends vscode.Disposable {
  /**
   * Play a sound file.
   * @param filePath Absolute path to the sound file on the filesystem
   *                 where the extension host is running.
   * @param volume 0.0 to 1.0
   */
  play(filePath: string, volume: number): void;
}

/**
 * Detect whether the extension is running in a remote context.
 */
export function isRemoteEnvironment(): boolean {
  return (
    vscode.env.remoteName !== undefined ||
    vscode.env.uiKind === vscode.UIKind.Web
  );
}
