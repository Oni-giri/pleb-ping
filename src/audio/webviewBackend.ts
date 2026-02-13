import * as vscode from "vscode";
import { AudioBackend } from "./audioBackend";

/**
 * Plays audio via a hidden VS Code webview.
 *
 * When using Remote-SSH, the extension host runs on the server.
 * We can't call afplay because the server has no speakers. But VS Code's
 * webview renders in the local Electron window (or browser for code-server),
 * so the browser Audio API plays sound locally.
 *
 * The webview is created lazily on first play and auto-disposed after
 * IDLE_TIMEOUT_MS of no sounds to free the ~30-50 MB Chromium renderer.
 */
export class WebviewBackend implements AudioBackend {
  private panel: vscode.WebviewPanel | null = null;
  private idleTimer: ReturnType<typeof setTimeout> | null = null;

  private static IDLE_TIMEOUT_MS = 5 * 60 * 1000;

  constructor(
    private readonly context: vscode.ExtensionContext,
    private readonly packsDirectory: string
  ) {}

  play(filePath: string, volume: number): void {
    const panel = this.ensurePanel();
    const fileUri = vscode.Uri.file(filePath);
    const webviewUri = panel.webview.asWebviewUri(fileUri);

    panel.webview.postMessage({
      type: "play",
      src: webviewUri.toString(),
      volume,
    });

    this.resetIdleTimer();
  }

  private ensurePanel(): vscode.WebviewPanel {
    if (this.panel) {
      return this.panel;
    }

    this.panel = vscode.window.createWebviewPanel(
      "remotePeonAudio",
      "Remote Peon",
      {
        viewColumn: vscode.ViewColumn.Beside,
        preserveFocus: true,
      },
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [
          vscode.Uri.file(this.packsDirectory),
          this.context.extensionUri,
        ],
      }
    );

    this.panel.webview.html = this.getWebviewHtml();

    this.panel.webview.onDidReceiveMessage(
      (msg) => {
        if (msg.type === "autoplay-blocked") {
          vscode.window
            .showInformationMessage(
              "Remote Peon: Browser blocked audio. Click 'Enable' then click inside the panel to unlock.",
              "Enable"
            )
            .then((choice) => {
              if (choice === "Enable" && this.panel) {
                this.panel.reveal(undefined, false);
              }
            });
        }
      },
      undefined,
      this.context.subscriptions
    );

    this.panel.onDidDispose(
      () => {
        this.panel = null;
      },
      undefined,
      this.context.subscriptions
    );

    return this.panel;
  }

  private resetIdleTimer(): void {
    if (this.idleTimer) {
      clearTimeout(this.idleTimer);
    }
    this.idleTimer = setTimeout(() => {
      this.panel?.dispose();
      this.panel = null;
    }, WebviewBackend.IDLE_TIMEOUT_MS);
  }

  private getWebviewHtml(): string {
    return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><title>Remote Peon Audio</title></head>
<body>
  <div id="unlock" style="display:none;position:fixed;inset:0;background:rgba(0,0,0,0.85);
    color:white;cursor:pointer;font:20px system-ui;
    align-items:center;justify-content:center;z-index:9999;">
    Click anywhere to enable Remote Peon sounds
  </div>
  <script>
    (function() {
      const audio = new Audio();
      const vscode = acquireVsCodeApi();
      let unlocked = false;
      let pendingPlay = null;

      window.addEventListener("message", function(event) {
        const msg = event.data;
        if (msg.type === "play") {
          audio.src = msg.src;
          audio.volume = msg.volume;
          audio.play().catch(function() {
            if (!unlocked) {
              pendingPlay = msg;
              document.getElementById("unlock").style.display = "flex";
              vscode.postMessage({ type: "autoplay-blocked" });
            }
          });
        }
      });

      document.getElementById("unlock").addEventListener("click", function() {
        unlocked = true;
        document.getElementById("unlock").style.display = "none";

        var ctx = new AudioContext();
        var buf = ctx.createBuffer(1, 1, 22050);
        var src = ctx.createBufferSource();
        src.buffer = buf;
        src.connect(ctx.destination);
        src.start(0);

        if (pendingPlay) {
          audio.src = pendingPlay.src;
          audio.volume = pendingPlay.volume;
          audio.play();
          pendingPlay = null;
        }
      });
    })();
  </script>
</body>
</html>`;
  }

  dispose(): void {
    if (this.idleTimer) {
      clearTimeout(this.idleTimer);
    }
    this.panel?.dispose();
    this.panel = null;
  }
}
