import * as vscode from "vscode";
import { AudioBackend } from "./audioBackend";

export class WebviewBackend implements AudioBackend, vscode.WebviewViewProvider {
  private view: vscode.WebviewView | null = null;
  private ready = false;
  private pendingPlays: Array<{ filePath: string; volume: number }> = [];

  constructor(
    private readonly context: vscode.ExtensionContext,
    private readonly packsDirectory: string
  ) {}

  resolveWebviewView(
    webviewView: vscode.WebviewView,
    _context: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken
  ): void {
    this.view = webviewView;
    this.ready = false;

    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [
        vscode.Uri.file(this.packsDirectory),
        this.context.extensionUri,
      ],
    };

    webviewView.webview.html = this.getWebviewHtml();

    webviewView.webview.onDidReceiveMessage(
      (msg) => {
        if (msg.type === "ready") {
          this.ready = true;
          this.flushPending();
        } else if (msg.type === "autoplay-blocked") {
          vscode.window
            .showInformationMessage(
              "Remote Peon: Browser blocked audio. Click 'Enable' then click inside the panel to unlock.",
              "Enable"
            )
            .then((choice) => {
              if (choice === "Enable" && this.view) {
                this.view.show(false);
              }
            });
        }
      },
      undefined,
      this.context.subscriptions
    );

    webviewView.onDidDispose(
      () => {
        this.view = null;
        this.ready = false;
      },
      undefined,
      this.context.subscriptions
    );
  }

  play(filePath: string, volume: number): void {
    if (this.view && this.ready) {
      this.postPlay(filePath, volume);
    } else {
      this.pendingPlays.push({ filePath, volume });
      if (!this.view) {
        vscode.commands.executeCommand("remotePeon.audio.focus");
      }
    }
  }

  private postPlay(filePath: string, volume: number): void {
    if (!this.view) return;
    const fileUri = vscode.Uri.file(filePath);
    const webviewUri = this.view.webview.asWebviewUri(fileUri);
    this.view.webview.postMessage({
      type: "play",
      src: webviewUri.toString(),
      volume,
    });
  }

  private flushPending(): void {
    for (const pending of this.pendingPlays) {
      this.postPlay(pending.filePath, pending.volume);
    }
    this.pendingPlays = [];
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

      vscode.postMessage({ type: "ready" });

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
    this.view = null;
    this.ready = false;
    this.pendingPlays = [];
  }
}
