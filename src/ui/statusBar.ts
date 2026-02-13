import * as vscode from "vscode";
import { SoundCategory } from "../types";

/**
 * Shows the current agent state in the VS Code status bar.
 * Auto-resets to idle after 30 seconds.
 */
export class StatusBar implements vscode.Disposable {
  private item: vscode.StatusBarItem;
  private resetTimer: ReturnType<typeof setTimeout> | null = null;

  private static RESET_MS = 30_000;

  constructor() {
    this.item = vscode.window.createStatusBarItem(
      vscode.StatusBarAlignment.Left,
      0
    );
    this.item.command = "remotePeon.selectPack";
    this.item.tooltip = "Remote Peon — click to change sound pack";
    this.item.text = "$(unmute) Peon";
    this.item.show();
  }

  /**
   * Update the status bar to reflect a new event.
   */
  update(category: SoundCategory): void {
    const display: Record<SoundCategory, { icon: string; label: string }> = {
      greeting: { icon: "$(zap)", label: "Ready" },
      acknowledge: { icon: "$(check)", label: "Working" },
      permission: { icon: "$(bell-dot)", label: "Needs input" },
      complete: { icon: "$(check-all)", label: "Done" },
      error: { icon: "$(error)", label: "Error" },
      annoyed: { icon: "$(smiley)", label: "..." },
    };

    const d = display[category];
    if (d) {
      this.item.text = `${d.icon} ${d.label}`;
    }

    if (this.resetTimer) clearTimeout(this.resetTimer);
    this.resetTimer = setTimeout(() => {
      this.item.text = "$(unmute) Peon";
    }, StatusBar.RESET_MS);
  }

  /**
   * Show or hide the status bar item.
   */
  setVisible(visible: boolean): void {
    if (visible) {
      this.item.show();
    } else {
      this.item.hide();
    }
  }

  dispose(): void {
    if (this.resetTimer) clearTimeout(this.resetTimer);
    this.item.dispose();
  }
}
