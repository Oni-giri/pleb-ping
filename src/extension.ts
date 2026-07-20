import * as vscode from "vscode";
import { Config } from "./config";
import { EventWatcher } from "./eventWatcher";
import { SoundManager } from "./sound/soundManager";
import { AudioBackend, isRemoteEnvironment } from "./audio/audioBackend";
import { NativeBackend } from "./audio/nativeBackend";
import { WebviewBackend } from "./audio/webviewBackend";
import { StatusBar } from "./ui/statusBar";
import { registerCommands } from "./ui/commands";
import {
  installHookScript,
  installHooksConfig,
  isGrokInstalled,
  installGrokHookScript,
  installGrokHooksConfig,
} from "./hooks/installer";
import {
  hasInstalledPacks,
  downloadDefaultPacks,
} from "./sound/packDownloader";

let config: Config;

export async function activate(context: vscode.ExtensionContext) {
  config = new Config();

  const outputChannel = vscode.window.createOutputChannel("Remote Peon");
  outputChannel.appendLine("Remote Peon activated");

  // Sound manager
  const soundManager = new SoundManager(config);

  // Auto-download default packs if none exist
  if (!hasInstalledPacks(config.packsDirectory)) {
    outputChannel.appendLine("No packs found — downloading defaults...");
    await downloadDefaultPacks(config.packsDirectory, outputChannel);
    soundManager.loadActivePack();
  }

  if (!soundManager.isReady) {
    outputChannel.appendLine(
      `WARNING: No valid sound pack found. Check ${config.packsDirectory}`
    );
  }

  // Audio backend
  const remote = isRemoteEnvironment();
  const audioBackend: AudioBackend = remote
    ? new WebviewBackend(context, config.packsDirectory)
    : new NativeBackend();

  if (remote) {
    vscode.commands.executeCommand("setContext", "remotePeon.isRemote", true);
    context.subscriptions.push(
      vscode.window.registerWebviewViewProvider(
        "remotePeon.audio",
        audioBackend as WebviewBackend,
        { webviewOptions: { retainContextWhenHidden: true } }
      )
    );
  }

  outputChannel.appendLine(
    `Audio backend: ${remote ? "webview (remote)" : "native (local)"}`
  );

  // Status bar
  const statusBar = new StatusBar();
  statusBar.setVisible(config.showStatusBar);

  // Event watcher
  const watcher = new EventWatcher(
    config.eventFile,
    config.debounceMs,
    config.usePolling,
    config.pollingIntervalMs
  );

  // Connect: event -> sound -> play
  watcher.onEvent((event) => {
    outputChannel.appendLine(`Event: ${event.category}`);

    const soundFile = soundManager.pickSound(event.category);
    if (soundFile) {
      outputChannel.appendLine(`Playing: ${soundFile}`);
      audioBackend.play(soundFile, config.volume);
    }

    if (config.showStatusBar) {
      statusBar.update(event.category);
    }
  });

  watcher.start();
  outputChannel.appendLine(`Watching: ${config.eventFile}`);

  // Commands
  registerCommands(context, soundManager, audioBackend, config, outputChannel);

  // Auto-install Claude Code hooks (and Grok when ~/.grok is present)
  if (config.autoInstallHooks) {
    const result = installHookScript(context.extensionPath);
    if (result.success) {
      outputChannel.appendLine("Claude Code hook script installed");
      installHooksConfig();
    } else {
      outputChannel.appendLine(
        `Claude Code hook script install failed: ${result.error}`
      );
    }

    if (isGrokInstalled()) {
      const grokScript = installGrokHookScript(context.extensionPath);
      if (grokScript.success) {
        const grokConfig = installGrokHooksConfig();
        if (grokConfig.success) {
          outputChannel.appendLine(
            grokConfig.modified
              ? "Grok hooks installed/updated (~/.grok/hooks/remote-peon.json)"
              : "Grok hooks already up to date"
          );
        } else {
          outputChannel.appendLine(
            `Grok hooks config failed: ${grokConfig.error}`
          );
        }
      } else {
        outputChannel.appendLine(
          `Grok hook script install failed: ${grokScript.error}`
        );
      }
    }
  }

  // Config reload
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
