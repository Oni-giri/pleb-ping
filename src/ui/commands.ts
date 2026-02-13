import * as vscode from "vscode";
import { SoundManager } from "../sound/soundManager";
import { AudioBackend } from "../audio/audioBackend";
import { Config } from "../config";
import { VALID_CATEGORIES } from "../types";
import {
  installHookScript,
  installHooksConfig,
  uninstallHooksConfig,
} from "../hooks/installer";

/**
 * Registers all extension commands. Call once during activation.
 */
export function registerCommands(
  context: vscode.ExtensionContext,
  soundManager: SoundManager,
  audioBackend: AudioBackend,
  config: Config
): void {
  // Select Pack
  context.subscriptions.push(
    vscode.commands.registerCommand("remotePeon.selectPack", async () => {
      const packs = soundManager.getAvailablePacks();

      if (packs.length === 0) {
        vscode.window.showWarningMessage(
          `No sound packs found in ${config.packsDirectory}. Add a pack folder with a manifest.json.`
        );
        return;
      }

      const items = packs.map((p) => ({
        label: p.name,
        description: p.id === config.pack ? "(active)" : "",
        id: p.id,
      }));

      const selected = await vscode.window.showQuickPick(items, {
        placeHolder: "Select a sound pack",
      });

      if (selected) {
        await vscode.workspace
          .getConfiguration("remotePeon")
          .update("pack", selected.id, vscode.ConfigurationTarget.Global);
        vscode.window.showInformationMessage(
          `Remote Peon: Switched to "${selected.label}"`
        );
      }
    })
  );

  // Preview Sounds
  context.subscriptions.push(
    vscode.commands.registerCommand("remotePeon.previewSounds", async () => {
      for (const category of VALID_CATEGORIES) {
        if (!config.isCategoryEnabled(category)) continue;

        const file = soundManager.pickSound(category);
        if (file) {
          vscode.window.showInformationMessage(`Playing: ${category}`);
          audioBackend.play(file, config.volume);
          await new Promise((r) => setTimeout(r, 1500));
        }
      }
    })
  );

  // Install Hooks
  context.subscriptions.push(
    vscode.commands.registerCommand("remotePeon.installHooks", () => {
      const result = installHookScript(context.extensionPath);
      if (result.success) {
        installHooksConfig();
      } else {
        vscode.window.showErrorMessage(
          `Remote Peon: Failed to install hooks: ${result.error}`
        );
      }
    })
  );

  // Remove Hooks
  context.subscriptions.push(
    vscode.commands.registerCommand("remotePeon.removeHooks", async () => {
      const confirm = await vscode.window.showWarningMessage(
        "Remove Remote Peon hooks from Claude Code?",
        { modal: true },
        "Remove"
      );
      if (confirm === "Remove") {
        uninstallHooksConfig();
        vscode.window.showInformationMessage(
          "Remote Peon: Hooks removed. Run /hooks in Claude Code to confirm."
        );
      }
    })
  );

  // Open Packs Directory
  context.subscriptions.push(
    vscode.commands.registerCommand("remotePeon.openPacksDirectory", () => {
      const uri = vscode.Uri.file(config.packsDirectory);
      vscode.commands.executeCommand("revealFileInOS", uri);
    })
  );
}
