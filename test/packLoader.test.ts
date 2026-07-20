import { describe, it, beforeEach, afterEach } from "node:test";
import * as assert from "node:assert";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";

import { loadPack, listPacks } from "../src/sound/packLoader";

const TEST_DIR = path.join(os.tmpdir(), "remote-peon-test-" + process.pid);

function setup() {
  fs.rmSync(TEST_DIR, { recursive: true, force: true });
  fs.mkdirSync(path.join(TEST_DIR, "valid-pack", "sounds"), {
    recursive: true,
  });
}

function teardown() {
  fs.rmSync(TEST_DIR, { recursive: true, force: true });
}

describe("loadPack", () => {
  beforeEach(() => setup());
  afterEach(() => teardown());

  it("loads a valid pack with manifest.json", () => {
    const packDir = path.join(TEST_DIR, "valid-pack");
    const soundsDir = path.join(packDir, "sounds");

    fs.writeFileSync(path.join(soundsDir, "beep.wav"), "fake-audio-data");
    fs.writeFileSync(
      path.join(packDir, "manifest.json"),
      JSON.stringify({
        id: "test",
        name: "Test Pack",
        author: "tester",
        sounds: {
          greeting: ["beep.wav"],
          complete: ["beep.wav"],
        },
      })
    );

    const pack = loadPack(packDir);
    assert.ok(pack, "should load pack");
    assert.strictEqual(pack!.id, "test");
    assert.strictEqual(pack!.name, "Test Pack");
    assert.strictEqual(pack!.author, "tester");
    assert.ok(pack!.sounds.greeting);
    assert.strictEqual(pack!.sounds.greeting!.length, 1);
    assert.ok(pack!.sounds.greeting![0].endsWith("beep.wav"));
  });

  it("returns null for directory without manifest", () => {
    const packDir = path.join(TEST_DIR, "no-manifest");
    fs.mkdirSync(packDir, { recursive: true });
    const pack = loadPack(packDir);
    assert.strictEqual(pack, null);
  });

  it("returns null for invalid JSON manifest", () => {
    const packDir = path.join(TEST_DIR, "bad-json");
    fs.mkdirSync(packDir, { recursive: true });
    fs.writeFileSync(path.join(packDir, "manifest.json"), "NOT JSON!!!");
    const pack = loadPack(packDir);
    assert.strictEqual(pack, null);
  });

  it("skips missing sound files without crashing", () => {
    const packDir = path.join(TEST_DIR, "valid-pack");
    fs.writeFileSync(
      path.join(packDir, "manifest.json"),
      JSON.stringify({
        id: "missing-files",
        sounds: {
          greeting: ["nonexistent.wav"],
        },
      })
    );

    const pack = loadPack(packDir);
    assert.ok(pack, "should still load");
    assert.strictEqual(pack!.sounds.greeting, undefined);
  });

  it("loads CESP format (openpeon.json)", () => {
    const packDir = path.join(TEST_DIR, "cesp-pack");
    const soundsDir = path.join(packDir, "sounds");
    fs.mkdirSync(soundsDir, { recursive: true });
    fs.writeFileSync(path.join(soundsDir, "greet.wav"), "audio");

    fs.writeFileSync(
      path.join(packDir, "openpeon.json"),
      JSON.stringify({
        id: "cesp-test",
        name: "CESP Test",
        categories: {
          "session.start": {
            sounds: [{ file: "sounds/greet.wav", label: "hello" }],
          },
        },
      })
    );

    const pack = loadPack(packDir);
    assert.ok(pack);
    assert.strictEqual(pack!.id, "cesp-test");
    assert.ok(pack!.sounds.greeting);
    assert.strictEqual(pack!.sounds.greeting!.length, 1);
  });
});

describe("listPacks", () => {
  beforeEach(() => setup());
  afterEach(() => teardown());

  it("lists packs with manifest.json", () => {
    const packDir = path.join(TEST_DIR, "valid-pack");
    fs.writeFileSync(
      path.join(packDir, "manifest.json"),
      JSON.stringify({ id: "test", name: "Test Pack", sounds: {} })
    );

    const packs = listPacks(TEST_DIR);
    assert.strictEqual(packs.length, 1);
    assert.strictEqual(packs[0].id, "test");
    assert.strictEqual(packs[0].name, "Test Pack");
  });

  it("returns empty array for nonexistent directory", () => {
    const packs = listPacks("/nonexistent/path");
    assert.deepStrictEqual(packs, []);
  });

  it("skips directories without manifest", () => {
    const noManifest = path.join(TEST_DIR, "no-manifest");
    fs.mkdirSync(noManifest, { recursive: true });

    const packs = listPacks(TEST_DIR);
    // Only valid-pack has a manifest from setup
    assert.strictEqual(
      packs.filter((p) => p.id === "no-manifest").length,
      0
    );
  });
});
