import * as fs from "fs";
import * as os from "os";
import * as path from "path";

const CODEX_HOOKS_PATH = path.join(os.homedir(), ".codex", "hooks.json");
const CODEX_HOOK_SCRIPT_DEST = path.join(os.homedir(), ".codex", "hooks", "remote-peon.sh");
const CODEX_HOOK_EVENTS = [
  { event: "SessionStart", arg: "session_start" },
  { event: "PermissionRequest", arg: "permission_request" },
  { event: "Stop", arg: "stop" },
];

export interface HookConfigResult {
  success: boolean;
  modified: boolean;
  error?: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function quoteShellArgument(value: string): string {
  return "'" + value.replace(/'/g, "'\\\"'\\\"'") + "'";
}

function readConfig(configPath: string): { config: Record<string, unknown> } | { error: string } {
  if (!fs.existsSync(configPath)) return { config: {} };
  try {
    const parsed: unknown = JSON.parse(fs.readFileSync(configPath, "utf-8"));
    if (!isRecord(parsed)) return { error: "hooks.json must contain a JSON object." };
    if (parsed.hooks !== undefined && !isRecord(parsed.hooks)) {
      return { error: "hooks.json field \"hooks\" must be a JSON object." };
    }
    return { config: parsed };
  } catch (err: any) {
    return { error: `hooks.json is malformed: ${err.message}` };
  }
}

function writeConfig(configPath: string, config: Record<string, unknown>): void {
  fs.mkdirSync(path.dirname(configPath), { recursive: true });
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2) + "\n");
}

export function installCodexHookScript(
  extensionPath: string,
  hookScriptPath = CODEX_HOOK_SCRIPT_DEST
): { success: boolean; error?: string } {
  try {
    fs.mkdirSync(path.dirname(hookScriptPath), { recursive: true });
    let scriptSource = path.join(extensionPath, "dist", "hooks", "remote-peon.sh");
    if (!fs.existsSync(scriptSource)) {
      scriptSource = path.join(extensionPath, "src", "hooks", "remote-peon.sh");
    }
    fs.copyFileSync(scriptSource, hookScriptPath);
    try { fs.chmodSync(hookScriptPath, 0o755); } catch { /* Windows */ }
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

export function installCodexHooksConfig(
  configPath = CODEX_HOOKS_PATH,
  hookScriptPath = CODEX_HOOK_SCRIPT_DEST
): HookConfigResult {
  const loaded = readConfig(configPath);
  if ("error" in loaded) return { success: false, modified: false, error: loaded.error };
  const config = loaded.config;
  const hooks = (config.hooks ??= {}) as Record<string, unknown>;
  let modified = false;

  for (const { event, arg } of CODEX_HOOK_EVENTS) {
    const entries = hooks[event];
    if (entries !== undefined && !Array.isArray(entries)) {
      return { success: false, modified: false, error: `hooks.json event "${event}" must be an array.` };
    }
    const eventEntries = (entries ?? []) as Array<Record<string, unknown>>;
    const command = `${quoteShellArgument(hookScriptPath)} ${arg}`;
    const installed = eventEntries.some((entry) =>
      Array.isArray(entry.hooks) && entry.hooks.some(
        (handler) => isRecord(handler) && handler.type === "command" && handler.command === command
      )
    );
    if (!installed) {
      eventEntries.push({ matcher: "", hooks: [{ type: "command", command }] });
      hooks[event] = eventEntries;
      modified = true;
    }
  }
  if (modified) writeConfig(configPath, config);
  return { success: true, modified };
}

export function uninstallCodexHooksConfig(
  configPath = CODEX_HOOKS_PATH,
  hookScriptPath = CODEX_HOOK_SCRIPT_DEST
): HookConfigResult {
  const loaded = readConfig(configPath);
  if ("error" in loaded) return { success: false, modified: false, error: loaded.error };
  const config = loaded.config;
  if (config.hooks === undefined) return { success: true, modified: false };
  const hooks = config.hooks as Record<string, unknown>;
  let modified = false;

  for (const { event } of CODEX_HOOK_EVENTS) {
    const entries = hooks[event];
    if (entries === undefined) continue;
    if (!Array.isArray(entries)) {
      return { success: false, modified: false, error: `hooks.json event "${event}" must be an array.` };
    }
    const remainingEntries: Array<Record<string, unknown>> = [];
    for (const entry of entries) {
      if (!isRecord(entry) || !Array.isArray(entry.hooks)) {
        remainingEntries.push(entry as Record<string, unknown>);
        continue;
      }
      const remainingHandlers = entry.hooks.filter(
        (handler) => !(
          isRecord(handler) && handler.type === "command" &&
          typeof handler.command === "string" && handler.command.includes(hookScriptPath)
        )
      );
      if (remainingHandlers.length !== entry.hooks.length) modified = true;
      if (remainingHandlers.length > 0) remainingEntries.push({ ...entry, hooks: remainingHandlers });
      else if (entry.hooks.length === 0) remainingEntries.push(entry);
    }
    if (remainingEntries.length === 0) delete hooks[event];
    else hooks[event] = remainingEntries;
  }
  if (modified) writeConfig(configPath, config);
  return { success: true, modified };
}
