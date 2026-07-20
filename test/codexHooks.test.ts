import { afterEach, describe, it } from "node:test";
import * as assert from "node:assert";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { spawnSync } from "node:child_process";
import {
  installCodexHooksConfig,
  uninstallCodexHooksConfig,
} from "../src/hooks/codexInstaller";

const temporaryDirectories: string[] = [];

function createTempDirectory(): string {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "remote-peon-codex-"));
  temporaryDirectories.push(directory);
  return directory;
}

function pathsFor(directory: string) {
  return {
    config: path.join(directory, "hooks.json"),
    script: path.join(directory, "hooks", "remote-peon.sh"),
  };
}

function readJson(file: string): any {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

afterEach(() => {
  while (temporaryDirectories.length > 0) {
    fs.rmSync(temporaryDirectories.pop()!, { recursive: true, force: true });
  }
});

describe("Codex hook configuration", () => {
  it("creates handlers for Codex's three lifecycle events", () => {
    const { config, script } = pathsFor(createTempDirectory());
    assert.deepStrictEqual(installCodexHooksConfig(config, script), {
      success: true,
      modified: true,
    });

    const hooks = readJson(config).hooks;
    assert.deepStrictEqual(Object.keys(hooks).sort(), [
      "PermissionRequest",
      "SessionStart",
      "Stop",
    ]);
    assert.match(hooks.SessionStart[0].hooks[0].command, /session_start$/);
    assert.match(hooks.PermissionRequest[0].hooks[0].command, /permission_request$/);
    assert.match(hooks.Stop[0].hooks[0].command, /stop$/);
  });

  it("is idempotent and preserves unrelated hooks", () => {
    const { config, script } = pathsFor(createTempDirectory());
    const unrelated = { type: "command", command: "/tmp/other-hook.sh" };
    fs.writeFileSync(config, JSON.stringify({ hooks: { Stop: [{ hooks: [unrelated] }] } }));

    installCodexHooksConfig(config, script);
    assert.deepStrictEqual(installCodexHooksConfig(config, script), {
      success: true,
      modified: false,
    });

    const hooks = readJson(config).hooks;
    assert.deepStrictEqual(hooks.Stop[0].hooks, [unrelated]);
    assert.strictEqual(hooks.Stop.length, 2);
  });

  it("removes only Remote Peon handlers", () => {
    const { config, script } = pathsFor(createTempDirectory());
    installCodexHooksConfig(config, script);
    const settings = readJson(config);
    settings.hooks.Stop.push({ hooks: [{ type: "command", command: "/tmp/other-hook.sh" }] });
    fs.writeFileSync(config, JSON.stringify(settings));

    assert.deepStrictEqual(uninstallCodexHooksConfig(config, script), {
      success: true,
      modified: true,
    });

    const hooks = readJson(config).hooks;
    assert.ok(!hooks.SessionStart);
    assert.ok(!hooks.PermissionRequest);
    assert.deepStrictEqual(hooks.Stop, [
      { hooks: [{ type: "command", command: "/tmp/other-hook.sh" }] },
    ]);
  });

  it("refuses to overwrite malformed hooks.json", () => {
    const { config, script } = pathsFor(createTempDirectory());
    const malformed = "{ this is not JSON";
    fs.writeFileSync(config, malformed);

    const result = installCodexHooksConfig(config, script);
    assert.strictEqual(result.success, false);
    assert.match(result.error!, /malformed/);
    assert.strictEqual(fs.readFileSync(config, "utf8"), malformed);
  });
});

describe("Codex adapter event mappings", () => {
  for (const [event, category] of [
    ["session_start", "greeting"],
    ["permission_request", "permission"],
    ["stop", "complete"],
  ]) {
    it(`maps ${event} to ${category}`, () => {
      const directory = createTempDirectory();
      const eventFile = path.join(directory, "events.ev");
      const script = path.join(process.cwd(), "src", "hooks", "remote-peon.sh");
      const result = spawnSync("sh", [script, event], {
        input: "{}",
        env: { ...process.env, REMOTE_PEON_EVENT_FILE: eventFile },
      });
      assert.strictEqual(result.status, 0, result.stderr.toString());
      assert.match(fs.readFileSync(eventFile, "utf8"), new RegExp(`^\\d+ ${category}\\n$`));
    });
  }

  it("logs sanitized metadata that identifies the Codex trigger", () => {
    const directory = createTempDirectory();
    const eventFile = path.join(directory, "events.ev");
    const debugLog = path.join(directory, "debug.jsonl");
    const script = path.join(process.cwd(), "src", "hooks", "remote-peon.sh");
    const secret = "do not persist this tool input";
    const result = spawnSync("sh", [script, "stop"], {
      input: JSON.stringify({
        hook_event_name: "Stop",
        session_id: "session-123",
        turn_id: "turn-456",
        permission_mode: "default",
        model: "gpt-test",
        tool_input: secret,
      }),
      env: {
        ...process.env,
        REMOTE_PEON_EVENT_FILE: eventFile,
        REMOTE_PEON_DEBUG_LOG: debugLog,
      },
    });

    assert.strictEqual(result.status, 0, result.stderr.toString());
    const content = fs.readFileSync(debugLog, "utf8");
    const record = JSON.parse(content);
    assert.strictEqual(record.configured_event, "stop");
    assert.strictEqual(record.category, "complete");
    assert.strictEqual(record.hook_event_name, "Stop");
    assert.strictEqual(record.session_id, "session-123");
    assert.strictEqual(record.turn_id, "turn-456");
    assert.strictEqual(record.permission_mode, "default");
    assert.strictEqual(record.payload_valid_json, true);
    assert.ok(record.payload_keys.includes("tool_input"));
    assert.ok(!content.includes(secret));
  });

  it("logs unknown invocations without emitting a sound event", () => {
    const directory = createTempDirectory();
    const eventFile = path.join(directory, "events.ev");
    const debugLog = path.join(directory, "debug.jsonl");
    const script = path.join(process.cwd(), "src", "hooks", "remote-peon.sh");
    const result = spawnSync("sh", [script, "unexpected_event"], {
      input: "not-json",
      env: {
        ...process.env,
        REMOTE_PEON_EVENT_FILE: eventFile,
        REMOTE_PEON_DEBUG_LOG: debugLog,
      },
    });

    assert.strictEqual(result.status, 0, result.stderr.toString());
    assert.ok(!fs.existsSync(eventFile));
    const record = readJson(debugLog);
    assert.strictEqual(record.configured_event, "unexpected_event");
    assert.strictEqual(record.category, "ignored");
    assert.strictEqual(record.payload_valid_json, false);
  });
});

describe("Notification filtering", () => {
  const script = path.join(process.cwd(), "src", "hooks", "remote-peon.sh");

  function runNotification(
    payload: Record<string, unknown>,
    env: Record<string, string> = {}
  ) {
    const directory = createTempDirectory();
    const eventFile = path.join(directory, "events.ev");
    const debugLog = path.join(directory, "debug.jsonl");
    // Drop Grok markers unless the test sets them explicitly — this suite
    // itself runs under Grok, which injects GROK_* into the parent env.
    const childEnv: NodeJS.ProcessEnv = {
      ...process.env,
      REMOTE_PEON_EVENT_FILE: eventFile,
      REMOTE_PEON_DEBUG_LOG: debugLog,
      ...env,
    };
    delete childEnv.GROK_SESSION_ID;
    delete childEnv.GROK_HOOK_EVENT;
    delete childEnv.GROK_HOOK_NAME;
    delete childEnv.GROK_WORKSPACE_ROOT;
    Object.assign(childEnv, env);

    const result = spawnSync("sh", [script, "notification"], {
      input: JSON.stringify(payload),
      env: childEnv,
    });
    assert.strictEqual(result.status, 0, result.stderr.toString());
    return {
      eventFile,
      debugLog,
      emitted: fs.existsSync(eventFile) ? fs.readFileSync(eventFile, "utf8") : "",
      record: readJson(debugLog),
    };
  }

  it("maps Claude permission/idle notification types to permission", () => {
    for (const notificationType of [
      "permission_prompt",
      "idle_prompt",
      "agent_needs_input",
    ]) {
      const { emitted, record } = runNotification({
        hookEventName: "Notification",
        notificationType,
        message: "Claude needs input",
      });
      assert.match(emitted, /^\d+ permission\n$/);
      assert.strictEqual(record.category, "permission");
      assert.strictEqual(record.notification_type, notificationType);
    }
  });

  it("ignores non-attention Claude notification types", () => {
    for (const notificationType of [
      "auth_success",
      "elicitation_dialog",
      "agent_completed",
    ]) {
      const { emitted, record } = runNotification({
        hookEventName: "Notification",
        notificationType,
      });
      assert.strictEqual(emitted, "");
      assert.strictEqual(record.category, "ignored");
      assert.strictEqual(record.notification_type, notificationType);
    }
  });

  it("suppresses permission_prompt when Grok loads Claude-compatible hooks", () => {
    // Grok fires Notification/permission_prompt on every tool call, including
    // auto-approved ones, so Claude Notification hooks must not sound.
    const { emitted, record } = runNotification(
      {
        hookEventName: "notification",
        notificationType: "permission_prompt",
        message: "Tool permission requested",
      },
      {
        GROK_SESSION_ID: "grok-session-1",
        GROK_HOOK_EVENT: "notification",
      }
    );
    assert.strictEqual(emitted, "");
    assert.strictEqual(record.category, "ignored");
    assert.strictEqual(record.notification_type, "permission_prompt");
    assert.strictEqual(record.harness, "grok");
  });

  it("still maps stop under Grok so turn completion can sound", () => {
    const directory = createTempDirectory();
    const eventFile = path.join(directory, "events.ev");
    const result = spawnSync("sh", [script, "stop"], {
      input: JSON.stringify({ hookEventName: "Stop" }),
      env: {
        ...process.env,
        REMOTE_PEON_EVENT_FILE: eventFile,
        GROK_SESSION_ID: "grok-session-1",
        GROK_HOOK_EVENT: "stop",
      },
    });
    assert.strictEqual(result.status, 0, result.stderr.toString());
    assert.match(fs.readFileSync(eventFile, "utf8"), /^\d+ complete\n$/);
  });
});
