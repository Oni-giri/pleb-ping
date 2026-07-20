import * as fs from "fs";
import * as path from "path";
import * as vscode from "vscode";
import { PeonEvent, SoundCategory, parseEventLine } from "./types";

export class EventWatcher implements vscode.Disposable {
  private fsWatcher: fs.FSWatcher | null = null;
  private statWatcher: fs.StatWatcher | null = null;
  /** Per-category debounce: tracks last fire time for each category. */
  private lastEventTimeByCategory = new Map<SoundCategory, number>();

  private _onEvent = new vscode.EventEmitter<PeonEvent>();
  readonly onEvent = this._onEvent.event;

  constructor(
    private readonly eventFile: string,
    private readonly debounceMs: number,
    private readonly usePolling: boolean = false,
    private readonly pollingIntervalMs: number = 500
  ) {}

  start(): void {
    this.ensureFileExists();

    if (this.usePolling) {
      this.startPolling();
    } else {
      this.startWatching();
    }
  }

  private startWatching(): void {
    try {
      this.fsWatcher = fs.watch(this.eventFile, () => {
        this.handleChange();
      });

      this.fsWatcher.on("error", () => {
        this.fsWatcher?.close();
        this.fsWatcher = null;
        setTimeout(() => this.startWatching(), 1000);
      });
    } catch {
      console.warn(
        "Remote Peon: fs.watch failed, falling back to polling"
      );
      this.startPolling();
    }
  }

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
   * Read all lines from the event file, parse each one, fire events
   * (with per-category debounce), then truncate the file.
   */
  private handleChange(): void {
    let content: string;
    try {
      content = fs.readFileSync(this.eventFile, "utf-8");
    } catch {
      return;
    }

    if (!content.trim()) {
      return;
    }

    // Truncate immediately so concurrent appenders don't lose events
    // that arrive while we're processing.
    try {
      fs.writeFileSync(this.eventFile, "");
    } catch {
      // Non-fatal — we may re-process these lines next time
    }

    const now = Date.now();
    const lines = content.split("\n");

    for (const line of lines) {
      const parsed = parseEventLine(line);
      if (!parsed) continue;

      // Per-category debounce
      const lastTime = this.lastEventTimeByCategory.get(parsed.category) ?? 0;
      if (now - lastTime < this.debounceMs) {
        continue;
      }

      this.lastEventTimeByCategory.set(parsed.category, now);
      this._onEvent.fire(parsed);
    }
  }

  private ensureFileExists(): void {
    try {
      const dir = path.dirname(this.eventFile);
      fs.mkdirSync(dir, { recursive: true });

      if (!fs.existsSync(this.eventFile)) {
        fs.writeFileSync(this.eventFile, "");
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
