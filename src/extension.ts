import * as vscode from "vscode";
import { Config } from "./config";
import { EventWatcher } from "./eventWatcher";
import { SoundManager } from "./sound/soundManager";
import { AudioBackend, isRemoteEnvironment } from "./audio/audioBackend";
import { NativeBackend } from "./audio/nativeBackend";
import { WebviewBackend } from "./audio/webviewBackend";
import { StatusBar } from "./ui/statusBar";
import { registerCommands } from "./ui/commands";
import { installHookScript, installHooksConfig } from "./hooks/installer";

let config: Config;

export function activate(context: vscode.ExtensionContext) {
  config = new Config();

  const outputChannel = vscode.window.createOutputChannel("Remote Peon");
  outputChannel.appendLine("Remote Peon activated");
  outputChannel.appendLine(`Event file: ${config.eventFile}`);
  outputChannel.appendLine(`Packs directory: ${config.packsDirectory}`);
  outputChannel.appendLine(`Pack: ${config.pack}`);
  outputChannel.appendLine(`Volume: ${config.volume}`);

  // 1. Sound manager (loads the active pack)
  const soundManager = new SoundManager(config);
  if (!soundManager.isReady) {
    outputChannel.appendLine(
      `WARNING: No valid sound pack found. Check ${config.packsDirectory}`
    );
  }

  // 2. Audio backend (webview for remote, native for local)
  const audioBackend: AudioBackend = isRemoteEnvironment()
    ? new WebviewBackend(context, config.packsDirectory)
    : new NativeBackend();
  outputChannel.appendLine(
    `Audio backend: ${isRemoteEnvironment() ? "webview (remote)" : "native (local)"}`
  );

  // 3. Status bar
  const statusBar = new StatusBar();
  statusBar.setVisible(config.showStatusBar);

  // 4. Event watcher
  const watcher = new EventWatcher(
    config.eventFile,
    config.debounceMs,
    config.usePolling,
    config.pollingIntervalMs
  );

  // 5. Connect: event → sound → play + status bar update
  watcher.onEvent((event) => {
    outputChannel.appendLine(`Event: ${event.category}`);

    if (config.showStatusBar) {
      statusBar.update(event.category);
    }

    const soundFile = soundManager.pickSound(event.category);
    if (soundFile) {
      outputChannel.appendLine(`Playing: ${soundFile}`);
      audioBackend.play(soundFile, config.volume);
    }
  });

  watcher.start();
  outputChannel.appendLine(`Watching: ${config.eventFile}`);

  // 6. Register commands
  registerCommands(context, soundManager, audioBackend, config);

  // 7. Auto-install hooks
  if (config.autoInstallHooks) {
    const result = installHookScript(context.extensionPath);
    if (result.success) {
      outputChannel.appendLine("Hook script installed");
      installHooksConfig();
    } else {
      outputChannel.appendLine(`Hook script install failed: ${result.error}`);
    }
  }

  // 8. Config reload
  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration("remotePeon")) {
        config = new Config();
        soundManager.loadActivePack();
        statusBar.setVisible(config.showStatusBar);
        outputChannel.appendLine("Config reloaded");
      }
    })
  );

  context.subscriptions.push(watcher, audioBackend, statusBar, outputChannel);
}

export function deactivate() {}
