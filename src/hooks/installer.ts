import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import * as vscode from "vscode";

const CLAUDE_SETTINGS_PATH = path.join(os.homedir(), ".claude", "settings.json");
const HOOK_SCRIPT_DEST = path.join(os.homedir(), ".claude", "hooks", "remote-peon.sh");

/** Claude Notification types that mean the user should pay attention. */
export const CLAUDE_NOTIFICATION_MATCHER =
  "permission_prompt|idle_prompt|agent_needs_input";

const HOOK_EVENTS: Array<{ event: string; arg: string; matcher?: string }> = [
  { event: "SessionStart", arg: "session_start" },
  // Matcher is critical: Grok loads ~/.claude/settings.json and fires
  // Notification with permission_prompt on every tool call. Narrowing the
  // matcher reduces invocations; the adapter also ignores Grok notifications.
  { event: "Notification", arg: "notification", matcher: CLAUDE_NOTIFICATION_MATCHER },
  { event: "Stop", arg: "stop" },
];

export function installHookScript(extensionPath: string): { success: boolean; error?: string } {
  try {
    const scriptSource = path.join(extensionPath, "dist", "hooks", "remote-peon.sh");
    fs.mkdirSync(path.dirname(HOOK_SCRIPT_DEST), { recursive: true });
    fs.copyFileSync(scriptSource, HOOK_SCRIPT_DEST);
    try { fs.chmodSync(HOOK_SCRIPT_DEST, 0o755); } catch { /* Windows */ }
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

function isOurHookCommand(command: unknown): boolean {
  return typeof command === "string" && command.includes("remote-peon.sh");
}

/**
 * Ensure Remote Peon Claude hooks are present with the current event args and
 * matchers. Updates existing entries when the matcher or command drifts.
 */
export async function installHooksConfig(): Promise<void> {
  let settings: any = {};
  try { settings = JSON.parse(fs.readFileSync(CLAUDE_SETTINGS_PATH, "utf-8")); } catch { /* start fresh */ }
  if (!settings.hooks) settings.hooks = {};
  let modified = false;

  for (const { event, arg, matcher } of HOOK_EVENTS) {
    const hookCommand = `${HOOK_SCRIPT_DEST} ${arg}`;
    const desiredMatcher = matcher ?? "";
    const existingEntries: any[] = settings.hooks[event] ?? [];
    let found = false;

    for (const entry of existingEntries) {
      if (!entry?.hooks?.some((h: any) => isOurHookCommand(h.command))) continue;
      found = true;
      // Normalize every Remote Peon handler on this entry.
      for (const h of entry.hooks) {
        if (isOurHookCommand(h.command) && h.command !== hookCommand) {
          h.command = hookCommand;
          modified = true;
        }
      }
      if ((entry.matcher ?? "") !== desiredMatcher) {
        entry.matcher = desiredMatcher;
        modified = true;
      }
    }

    if (!found) {
      existingEntries.push({
        matcher: desiredMatcher,
        hooks: [{ type: "command", command: hookCommand }],
      });
      settings.hooks[event] = existingEntries;
      modified = true;
    } else {
      settings.hooks[event] = existingEntries;
    }
  }

  if (modified) {
    fs.mkdirSync(path.dirname(CLAUDE_SETTINGS_PATH), { recursive: true });
    fs.writeFileSync(CLAUDE_SETTINGS_PATH, JSON.stringify(settings, null, 2) + "\n");
    await vscode.window.showInformationMessage(
      "Remote Peon: Claude Code hooks installed. Run /hooks in Claude Code to review and activate them.",
      "Got it"
    );
  }
}

export function uninstallHooksConfig(): void {
  try {
    const settings = JSON.parse(fs.readFileSync(CLAUDE_SETTINGS_PATH, "utf-8"));
    if (!settings.hooks) return;
    for (const event of Object.keys(settings.hooks)) {
      settings.hooks[event] = settings.hooks[event].filter(
        (entry: any) => !entry.hooks?.some((h: any) => isOurHookCommand(h.command))
      );
      if (settings.hooks[event].length === 0) delete settings.hooks[event];
    }
    fs.writeFileSync(CLAUDE_SETTINGS_PATH, JSON.stringify(settings, null, 2) + "\n");
  } catch {
    // If settings file doesn't exist, nothing to uninstall.
  }
}

export {
  installCodexHookScript,
  installCodexHooksConfig,
  uninstallCodexHooksConfig,
} from "./codexInstaller";
export type { HookConfigResult } from "./codexInstaller";

export {
  isGrokInstalled,
  installGrokHookScript,
  installGrokHooksConfig,
  uninstallGrokHooksConfig,
} from "./grokInstaller";
