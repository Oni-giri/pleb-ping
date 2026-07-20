import { afterEach, describe, it } from "node:test";
import * as assert from "node:assert";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { spawnSync } from "node:child_process";
import {
  installGrokHooksConfig,
  uninstallGrokHooksConfig,
  isGrokInstalled,
} from "../src/hooks/grokInstaller";

const temporaryDirectories: string[] = [];

function createTempDirectory(): string {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "remote-peon-grok-"));
  temporaryDirectories.push(directory);
  return directory;
}

afterEach(() => {
  while (temporaryDirectories.length > 0) {
    fs.rmSync(temporaryDirectories.pop()!, { recursive: true, force: true });
  }
});

describe("Grok hook detection", () => {
  it("isGrokInstalled is true for an existing directory", () => {
    const directory = createTempDirectory();
    assert.strictEqual(isGrokInstalled(directory), true);
  });

  it("isGrokInstalled is false when missing", () => {
    assert.strictEqual(
      isGrokInstalled(path.join(createTempDirectory(), "nope")),
      false
    );
  });
});

describe("Grok hook configuration", () => {
  it("writes SessionStart, Stop, and StopFailure handlers", () => {
    const directory = createTempDirectory();
    const config = path.join(directory, "remote-peon.json");
    const script = path.join(directory, "remote-peon.sh");

    assert.deepStrictEqual(installGrokHooksConfig(config, script), {
      success: true,
      modified: true,
    });

    const hooks = JSON.parse(fs.readFileSync(config, "utf8")).hooks;
    assert.deepStrictEqual(Object.keys(hooks).sort(), [
      "SessionStart",
      "Stop",
      "StopFailure",
    ]);
    assert.match(hooks.SessionStart[0].hooks[0].command, /session_start$/);
    assert.match(hooks.Stop[0].hooks[0].command, /stop$/);
    assert.match(hooks.StopFailure[0].hooks[0].command, /stop_failure$/);
    // Lifecycle events must not set matcher (Grok rejects it).
    assert.ok(!("matcher" in hooks.SessionStart[0]));
    assert.ok(!("matcher" in hooks.Stop[0]));
    assert.ok(!("matcher" in hooks.StopFailure[0]));
  });

  it("is idempotent", () => {
    const directory = createTempDirectory();
    const config = path.join(directory, "remote-peon.json");
    const script = path.join(directory, "remote-peon.sh");

    installGrokHooksConfig(config, script);
    assert.deepStrictEqual(installGrokHooksConfig(config, script), {
      success: true,
      modified: false,
    });
  });

  it("rewrites a drifted owned config file", () => {
    const directory = createTempDirectory();
    const config = path.join(directory, "remote-peon.json");
    const script = path.join(directory, "remote-peon.sh");
    fs.writeFileSync(config, JSON.stringify({ hooks: { Stop: [] } }) + "\n");

    assert.deepStrictEqual(installGrokHooksConfig(config, script), {
      success: true,
      modified: true,
    });
    const hooks = JSON.parse(fs.readFileSync(config, "utf8")).hooks;
    assert.ok(hooks.SessionStart);
    assert.ok(hooks.StopFailure);
  });

  it("uninstall removes the owned config file", () => {
    const directory = createTempDirectory();
    const config = path.join(directory, "remote-peon.json");
    const script = path.join(directory, "remote-peon.sh");
    installGrokHooksConfig(config, script);

    assert.deepStrictEqual(uninstallGrokHooksConfig(config), {
      success: true,
      modified: true,
    });
    assert.ok(!fs.existsSync(config));
    assert.deepStrictEqual(uninstallGrokHooksConfig(config), {
      success: true,
      modified: false,
    });
  });
});

describe("Grok adapter event mappings", () => {
  const script = path.join(process.cwd(), "src", "hooks", "remote-peon.sh");

  for (const [event, category] of [
    ["session_start", "greeting"],
    ["stop", "complete"],
    ["stop_failure", "error"],
  ] as const) {
    it(`maps ${event} to ${category}`, () => {
      const directory = createTempDirectory();
      const eventFile = path.join(directory, "events.ev");
      const result = spawnSync("sh", [script, event], {
        input: JSON.stringify({ hookEventName: event }),
        env: {
          ...process.env,
          REMOTE_PEON_EVENT_FILE: eventFile,
          GROK_SESSION_ID: "test-session",
          GROK_HOOK_EVENT: event,
        },
      });
      assert.strictEqual(result.status, 0, result.stderr.toString());
      assert.match(
        fs.readFileSync(eventFile, "utf8"),
        new RegExp(`^\\d+ ${category}\\n$`)
      );
    });
  }

  it("still ignores Notification under Grok", () => {
    const directory = createTempDirectory();
    const eventFile = path.join(directory, "events.ev");
    const debugLog = path.join(directory, "debug.jsonl");
    const result = spawnSync("sh", [script, "notification"], {
      input: JSON.stringify({
        hookEventName: "notification",
        notificationType: "permission_prompt",
        message: "Tool permission requested",
      }),
      env: {
        ...process.env,
        REMOTE_PEON_EVENT_FILE: eventFile,
        REMOTE_PEON_DEBUG_LOG: debugLog,
        GROK_SESSION_ID: "test-session",
        GROK_HOOK_EVENT: "notification",
      },
    });
    assert.strictEqual(result.status, 0, result.stderr.toString());
    assert.ok(!fs.existsSync(eventFile) || fs.readFileSync(eventFile, "utf8") === "");
    const record = JSON.parse(fs.readFileSync(debugLog, "utf8"));
    assert.strictEqual(record.category, "ignored");
    assert.strictEqual(record.harness, "grok");
  });
});
