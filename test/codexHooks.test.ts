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
});
