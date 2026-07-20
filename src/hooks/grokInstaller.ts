import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import type { HookConfigResult } from "./codexInstaller";

const GROK_DIR = path.join(os.homedir(), ".grok");
const GROK_HOOKS_DIR = path.join(GROK_DIR, "hooks");
/** Owned file — Grok merges every *.json under ~/.grok/hooks/. */
const GROK_HOOKS_JSON = path.join(GROK_HOOKS_DIR, "remote-peon.json");
const GROK_HOOK_SCRIPT_DEST = path.join(GROK_HOOKS_DIR, "remote-peon.sh");

const GROK_HOOK_EVENTS = [
  { event: "SessionStart", arg: "session_start" },
  { event: "Stop", arg: "stop" },
  { event: "StopFailure", arg: "stop_failure" },
] as const;

export function isGrokInstalled(grokDir = GROK_DIR): boolean {
  try {
    return fs.existsSync(grokDir) && fs.statSync(grokDir).isDirectory();
  } catch {
    return false;
  }
}

function quoteShellArgument(value: string): string {
  return "'" + value.replace(/'/g, "'\\\"'\\\"'") + "'";
}

function buildGrokHooksConfig(hookScriptPath: string): Record<string, unknown> {
  const hooks: Record<string, unknown> = {};
  for (const { event, arg } of GROK_HOOK_EVENTS) {
    // Lifecycle events reject matchers in Grok — omit the field entirely.
    hooks[event] = [
      {
        hooks: [
          {
            type: "command",
            command: `${quoteShellArgument(hookScriptPath)} ${arg}`,
          },
        ],
      },
    ];
  }
  return { hooks };
}

export function installGrokHookScript(
  extensionPath: string,
  hookScriptPath = GROK_HOOK_SCRIPT_DEST
): { success: boolean; error?: string } {
  try {
    fs.mkdirSync(path.dirname(hookScriptPath), { recursive: true });
    fs.copyFileSync(path.join(extensionPath, "dist", "hooks", "remote-peon.sh"), hookScriptPath);
    try {
      fs.chmodSync(hookScriptPath, 0o755);
    } catch {
      /* Windows */
    }
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

/**
 * Write (or rewrite) the owned ~/.grok/hooks/remote-peon.json file.
 * Idempotent: no-op when content already matches.
 */
export function installGrokHooksConfig(
  configPath = GROK_HOOKS_JSON,
  hookScriptPath = GROK_HOOK_SCRIPT_DEST
): HookConfigResult {
  try {
    const desired = buildGrokHooksConfig(hookScriptPath);
    const desiredText = JSON.stringify(desired, null, 2) + "\n";

    if (fs.existsSync(configPath)) {
      try {
        const existing = fs.readFileSync(configPath, "utf-8");
        // Normalize by parse+stringify so formatting drift does not force rewrites.
        const parsed: unknown = JSON.parse(existing);
        if (JSON.stringify(parsed, null, 2) + "\n" === desiredText) {
          return { success: true, modified: false };
        }
      } catch {
        // Malformed owned file — overwrite.
      }
    }

    fs.mkdirSync(path.dirname(configPath), { recursive: true });
    fs.writeFileSync(configPath, desiredText);
    return { success: true, modified: true };
  } catch (err: any) {
    return { success: false, modified: false, error: err.message };
  }
}

/** Remove only the owned remote-peon.json; leaves the copied script in place. */
export function uninstallGrokHooksConfig(
  configPath = GROK_HOOKS_JSON
): HookConfigResult {
  try {
    if (!fs.existsSync(configPath)) {
      return { success: true, modified: false };
    }
    fs.unlinkSync(configPath);
    return { success: true, modified: true };
  } catch (err: any) {
    return { success: false, modified: false, error: err.message };
  }
}

export { GROK_HOOKS_JSON, GROK_HOOK_SCRIPT_DEST, GROK_HOOK_EVENTS };
