import * as vscode from "vscode";
import * as os from "os";
import * as path from "path";
import { SoundCategory } from "./types";

/**
 * Reads and exposes all extension settings.
 * Create a new instance when settings change (listen to onDidChangeConfiguration).
 */
export class Config {
  private cfg: vscode.WorkspaceConfiguration;

  constructor() {
    this.cfg = vscode.workspace.getConfiguration("remotePeon");
  }

  /** Active sound pack ID. Default: "peon" */
  get pack(): string {
    return this.cfg.get<string>("pack", "peon");
  }

  /** Directory where packs are stored. Default: ~/.remote-peon/packs */
  get packsDirectory(): string {
    const raw = this.cfg.get<string>("packsDirectory", "~/.remote-peon/packs");
    return resolveHome(raw);
  }

  /** Event file path. Default: /tmp/remote-peon.ev */
  get eventFile(): string {
    return resolveHome(
      this.cfg.get<string>("eventFile", "/tmp/remote-peon.ev")
    );
  }

  /** Volume from 0.0 to 1.0. Default: 0.7 */
  get volume(): number {
    const v = this.cfg.get<number>("volume", 0.7);
    return Math.max(0, Math.min(1, v));
  }

  /** Minimum milliseconds between sounds. Default: 2000 */
  get debounceMs(): number {
    return this.cfg.get<number>("debounceMs", 2000);
  }

  /** Whether a specific sound category is enabled. */
  isCategoryEnabled(category: SoundCategory): boolean {
    return this.cfg.get<boolean>(
      `sounds.${category}`,
      category !== "acknowledge"
    );
  }

  /** Whether to auto-install Claude Code hooks. Default: true */
  get autoInstallHooks(): boolean {
    return this.cfg.get<boolean>("autoInstallHooks", true);
  }

  /** Whether to show the status bar item. Default: true */
  get showStatusBar(): boolean {
    return this.cfg.get<boolean>("showStatusBar", true);
  }

  /** Whether to use fs.watchFile polling instead of fs.watch. Default: false */
  get usePolling(): boolean {
    return this.cfg.get<boolean>("usePolling", false);
  }

  /** Polling interval in ms if usePolling is true. Default: 500 */
  get pollingIntervalMs(): number {
    return this.cfg.get<number>("pollingIntervalMs", 500);
  }
}

/**
 * Replaces leading ~ with the user's home directory.
 */
function resolveHome(filepath: string): string {
  if (filepath.startsWith("~/") || filepath === "~") {
    return path.join(os.homedir(), filepath.slice(1));
  }
  return filepath;
}
