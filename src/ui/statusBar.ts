import * as vscode from "vscode";
import { SoundCategory } from "../types";

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
