import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import * as vscode from "vscode";

const CLAUDE_SETTINGS_PATH = path.join(
  os.homedir(),
  ".claude",
  "settings.json"
);
const HOOK_SCRIPT_DEST = path.join(
  os.homedir(),
  ".claude",
  "hooks",
  "remote-peon.sh"
);

const HOOK_EVENTS: Array<{ event: string; arg: string }> = [
  { event: "SessionStart", arg: "session_start" },
  { event: "Notification", arg: "notification" },
  { event: "Stop", arg: "stop" },
];

/**
 * Copies the hook script from the extension bundle to ~/.claude/hooks/
 * and makes it executable.
 */
export function installHookScript(
  extensionPath: string
): { success: boolean; error?: string } {
  try {
    // Try dist/hooks first (packaged extension), fall back to src/hooks
    let scriptSource = path.join(extensionPath, "dist", "hooks", "remote-peon.sh");
    if (!fs.existsSync(scriptSource)) {
      scriptSource = path.join(extensionPath, "src", "hooks", "remote-peon.sh");
    }

    const destDir = path.dirname(HOOK_SCRIPT_DEST);
    fs.mkdirSync(destDir, { recursive: true });

    fs.copyFileSync(scriptSource, HOOK_SCRIPT_DEST);

    try {
      fs.chmodSync(HOOK_SCRIPT_DEST, 0o755);
    } catch {
      // Windows — chmod is a no-op
    }

    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

/**
 * Reads ~/.claude/settings.json, adds our hooks if they're not already
 * present, and writes it back.
 */
export async function installHooksConfig(): Promise<void> {
  let settings: any = {};

  try {
    const raw = fs.readFileSync(CLAUDE_SETTINGS_PATH, "utf-8");
    settings = JSON.parse(raw);
  } catch {
    // File doesn't exist or invalid JSON — start fresh
  }

  if (!settings.hooks) {
    settings.hooks = {};
  }

  let modified = false;

  for (const { event, arg } of HOOK_EVENTS) {
    const hookCommand = `${HOOK_SCRIPT_DEST} ${arg}`;

    const existingEntries: any[] = settings.hooks[event] ?? [];
    const alreadyInstalled = existingEntries.some((entry: any) =>
      entry.hooks?.some((h: any) => h.command?.includes("remote-peon.sh"))
    );

    if (!alreadyInstalled) {
      existingEntries.push({
        matcher: "",
        hooks: [
          {
            type: "command",
            command: hookCommand,
          },
        ],
      });
      settings.hooks[event] = existingEntries;
      modified = true;
    }
  }

  if (modified) {
    fs.mkdirSync(path.dirname(CLAUDE_SETTINGS_PATH), { recursive: true });

    fs.writeFileSync(
      CLAUDE_SETTINGS_PATH,
      JSON.stringify(settings, null, 2) + "\n"
    );

    await vscode.window.showInformationMessage(
      "Remote Peon: Claude Code hooks installed. You must run /hooks in Claude Code to review and activate them.",
      "Got it"
    );
  }
}

/**
 * Remove our hooks from ~/.claude/settings.json.
 */
export function uninstallHooksConfig(): void {
  try {
    const raw = fs.readFileSync(CLAUDE_SETTINGS_PATH, "utf-8");
    const settings = JSON.parse(raw);

    if (!settings.hooks) return;

    for (const event of Object.keys(settings.hooks)) {
      settings.hooks[event] = settings.hooks[event].filter(
        (entry: any) =>
          !entry.hooks?.some((h: any) =>
            h.command?.includes("remote-peon.sh")
          )
      );

      if (settings.hooks[event].length === 0) {
        delete settings.hooks[event];
      }
    }

    fs.writeFileSync(
      CLAUDE_SETTINGS_PATH,
      JSON.stringify(settings, null, 2) + "\n"
    );
  } catch {
    // If settings file doesn't exist, nothing to uninstall
  }
}
