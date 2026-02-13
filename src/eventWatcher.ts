import * as fs from "fs";
import * as path from "path";
import * as vscode from "vscode";
import { PeonEvent, isValidCategory, SoundCategory } from "./types";

/**
 * Watches the event file for changes and emits parsed events.
 *
 * Uses fs.watch (inotify on Linux) by default — zero CPU when idle.
 * Falls back to fs.watchFile (polling) when configured, for NFS/FUSE compatibility.
 */
export class EventWatcher implements vscode.Disposable {
  private fsWatcher: fs.FSWatcher | null = null;
  private statWatcher: fs.StatWatcher | null = null;
  private lastEventTime = 0;
  private lastContent = "";

  private _onEvent = new vscode.EventEmitter<PeonEvent>();
  /** Subscribe to this to receive parsed events. */
  readonly onEvent = this._onEvent.event;

  constructor(
    private readonly eventFile: string,
    private readonly debounceMs: number,
    private readonly usePolling: boolean = false,
    private readonly pollingIntervalMs: number = 500
  ) {}

  /**
   * Start watching. Call this once during activation.
   */
  start(): void {
    this.ensureFileExists();

    if (this.usePolling) {
      this.startPolling();
    } else {
      this.startWatching();
    }
  }

  /**
   * inotify-based watching. Zero CPU idle. Fires on atomic rename (mv).
   */
  private startWatching(): void {
    try {
      this.fsWatcher = fs.watch(this.eventFile, (_eventType) => {
        this.handleChange();
      });

      this.fsWatcher.on("error", () => {
        this.fsWatcher?.close();
        this.fsWatcher = null;
        setTimeout(() => this.startWatching(), 1000);
      });
    } catch (err) {
      console.warn(
        "Remote Peon: fs.watch failed, falling back to polling:",
        err
      );
      this.startPolling();
    }
  }

  /**
   * Polling-based watching. Uses ~0.1% CPU. For NFS, FUSE, or other
   * filesystems where inotify doesn't work.
   */
  private startPolling(): void {
    this.statWatcher = fs.watchFile(
      this.eventFile,
      { interval: this.pollingIntervalMs },
      () => {
        this.handleChange();
      }
    );
  }

  /**
   * Called when the event file changes. Reads it, parses it, debounces,
   * and emits a PeonEvent if valid.
   */
  private handleChange(): void {
    const now = Date.now();

    if (now - this.lastEventTime < this.debounceMs) {
      return;
    }

    let content: string;
    try {
      content = fs.readFileSync(this.eventFile, "utf-8").trim();
    } catch {
      return;
    }

    if (!content || content === this.lastContent) {
      return;
    }
    this.lastContent = content;

    const spaceIndex = content.indexOf(" ");
    if (spaceIndex === -1) {
      return;
    }

    const timestampStr = content.substring(0, spaceIndex);
    const category = content.substring(spaceIndex + 1);

    const timestamp = parseInt(timestampStr, 10);
    if (isNaN(timestamp)) {
      return;
    }

    if (!isValidCategory(category)) {
      return;
    }

    this.lastEventTime = now;
    this._onEvent.fire({ timestamp, category: category as SoundCategory });
  }

  /**
   * Creates the event file if it doesn't exist.
   */
  private ensureFileExists(): void {
    try {
      const dir = path.dirname(this.eventFile);
      fs.mkdirSync(dir, { recursive: true });

      if (!fs.existsSync(this.eventFile)) {
        fs.writeFileSync(this.eventFile, "", { mode: 0o600 });
      }
    } catch (err) {
      console.error("Remote Peon: Failed to create event file:", err);
    }
  }

  dispose(): void {
    this.fsWatcher?.close();
    this.fsWatcher = null;

    if (this.statWatcher) {
      fs.unwatchFile(this.eventFile);
      this.statWatcher = null;
    }

    this._onEvent.dispose();
  }
}
