import { describe, it, beforeEach, afterEach } from "node:test";
import * as assert from "node:assert";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { loadPack, listPacks } from "../src/sound/packLoader";

let testDir: string;

function setup() {
  testDir = fs.mkdtempSync(path.join(os.tmpdir(), "remote-peon-test-"));
}

function teardown() {
  fs.rmSync(testDir, { recursive: true, force: true });
}

describe("loadPack", () => {
  beforeEach(() => setup());
  afterEach(() => teardown());

  it("loads a valid pack with sound files", () => {
    const packDir = path.join(testDir, "test-pack");
    const soundsDir = path.join(packDir, "sounds");
    fs.mkdirSync(soundsDir, { recursive: true });

    // Create manifest
    fs.writeFileSync(
      path.join(packDir, "manifest.json"),
      JSON.stringify({
        id: "test",
        name: "Test Pack",
        author: "tester",
        sounds: {
          greeting: ["hello.mp3"],
          complete: ["done1.mp3", "done2.mp3"],
        },
      })
    );

    // Create sound files
    fs.writeFileSync(path.join(soundsDir, "hello.mp3"), "fake-audio");
    fs.writeFileSync(path.join(soundsDir, "done1.mp3"), "fake-audio");
    fs.writeFileSync(path.join(soundsDir, "done2.mp3"), "fake-audio");

    const pack = loadPack(packDir);
    assert.ok(pack);
    assert.strictEqual(pack!.id, "test");
    assert.strictEqual(pack!.name, "Test Pack");
    assert.strictEqual(pack!.author, "tester");
    assert.strictEqual(pack!.sounds.greeting?.length, 1);
    assert.strictEqual(pack!.sounds.complete?.length, 2);
  });

  it("returns null for directory without manifest.json", () => {
    const packDir = path.join(testDir, "no-manifest");
    fs.mkdirSync(packDir);

    const pack = loadPack(packDir);
    assert.strictEqual(pack, null);
  });

  it("returns null for invalid JSON in manifest", () => {
    const packDir = path.join(testDir, "bad-json");
    fs.mkdirSync(packDir);
    fs.writeFileSync(path.join(packDir, "manifest.json"), "not json{{{");

    const pack = loadPack(packDir);
    assert.strictEqual(pack, null);
  });

  it("returns null for manifest missing id", () => {
    const packDir = path.join(testDir, "no-id");
    fs.mkdirSync(packDir);
    fs.writeFileSync(
      path.join(packDir, "manifest.json"),
      JSON.stringify({ sounds: { greeting: ["a.mp3"] } })
    );

    const pack = loadPack(packDir);
    assert.strictEqual(pack, null);
  });

  it("returns null for manifest missing sounds", () => {
    const packDir = path.join(testDir, "no-sounds");
    fs.mkdirSync(packDir);
    fs.writeFileSync(
      path.join(packDir, "manifest.json"),
      JSON.stringify({ id: "test" })
    );

    const pack = loadPack(packDir);
    assert.strictEqual(pack, null);
  });

  it("skips missing sound files but loads existing ones", () => {
    const packDir = path.join(testDir, "partial");
    const soundsDir = path.join(packDir, "sounds");
    fs.mkdirSync(soundsDir, { recursive: true });

    fs.writeFileSync(
      path.join(packDir, "manifest.json"),
      JSON.stringify({
        id: "partial",
        sounds: {
          greeting: ["exists.mp3", "missing.mp3"],
        },
      })
    );

    fs.writeFileSync(path.join(soundsDir, "exists.mp3"), "fake-audio");

    const pack = loadPack(packDir);
    assert.ok(pack);
    assert.strictEqual(pack!.sounds.greeting?.length, 1);
    assert.ok(pack!.sounds.greeting![0].endsWith("exists.mp3"));
  });

  it("defaults name to id when name is missing", () => {
    const packDir = path.join(testDir, "no-name");
    const soundsDir = path.join(packDir, "sounds");
    fs.mkdirSync(soundsDir, { recursive: true });

    fs.writeFileSync(
      path.join(packDir, "manifest.json"),
      JSON.stringify({ id: "mypack", sounds: {} })
    );

    const pack = loadPack(packDir);
    assert.ok(pack);
    assert.strictEqual(pack!.name, "mypack");
  });
});

describe("listPacks", () => {
  beforeEach(() => setup());
  afterEach(() => teardown());

  it("returns empty array for non-existent directory", () => {
    const result = listPacks("/tmp/does-not-exist-ever-12345");
    assert.deepStrictEqual(result, []);
  });

  it("returns empty array for directory with no packs", () => {
    const result = listPacks(testDir);
    assert.deepStrictEqual(result, []);
  });

  it("lists valid packs and skips invalid ones", () => {
    // Valid pack
    const goodDir = path.join(testDir, "good");
    fs.mkdirSync(goodDir);
    fs.writeFileSync(
      path.join(goodDir, "manifest.json"),
      JSON.stringify({ id: "good", name: "Good Pack", sounds: {} })
    );

    // Invalid pack (bad JSON)
    const badDir = path.join(testDir, "bad");
    fs.mkdirSync(badDir);
    fs.writeFileSync(path.join(badDir, "manifest.json"), "{{invalid");

    // Not a pack (just a file)
    fs.writeFileSync(path.join(testDir, "not-a-dir"), "just a file");

    // Directory without manifest
    const emptyDir = path.join(testDir, "empty");
    fs.mkdirSync(emptyDir);

    const packs = listPacks(testDir);
    assert.strictEqual(packs.length, 1);
    assert.strictEqual(packs[0].id, "good");
    assert.strictEqual(packs[0].name, "Good Pack");
  });
});
