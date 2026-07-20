import * as vscode from "vscode";
import * as os from "os";
import * as path from "path";
import { SoundCategory } from "./types";

export class Config {
  private cfg: vscode.WorkspaceConfiguration;

  constructor() {
    this.cfg = vscode.workspace.getConfiguration("remotePeon");
  }

  get pack(): string {
    return this.cfg.get<string>("pack", "peon");
  }

  get packsDirectory(): string {
    const raw = this.cfg.get<string>("packsDirectory", "~/.remote-peon/packs");
    return resolveHome(raw);
  }

  get eventFile(): string {
    return resolveHome(
      this.cfg.get<string>("eventFile", "~/.remote-peon/remote-peon.ev")
    );
  }

  get volume(): number {
    const v = this.cfg.get<number>("volume", 0.7);
    return Math.max(0, Math.min(1, v));
  }

  get debounceMs(): number {
    return this.cfg.get<number>("debounceMs", 2000);
  }

  isCategoryEnabled(category: SoundCategory): boolean {
    return this.cfg.get<boolean>(
      `sounds.${category}`,
      category !== "acknowledge"
    );
  }

  get autoInstallHooks(): boolean {
    return this.cfg.get<boolean>("autoInstallHooks", true);
  }

  get showStatusBar(): boolean {
    return this.cfg.get<boolean>("showStatusBar", true);
  }

  get usePolling(): boolean {
    return this.cfg.get<boolean>("usePolling", false);
  }

  get pollingIntervalMs(): number {
    return this.cfg.get<number>("pollingIntervalMs", 500);
  }
}

function resolveHome(filepath: string): string {
  if (filepath.startsWith("~/") || filepath === "~") {
    return path.join(os.homedir(), filepath.slice(1));
  }
  return filepath;
}
