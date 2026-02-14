import { describe, it, beforeEach, afterEach } from "node:test";
import * as assert from "node:assert";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";

// SoundManager depends on Config (vscode API). We test the core logic
// by creating a mock environment with real files.

import { loadPack } from "../src/sound/packLoader";
import { SoundPack, SoundCategory } from "../src/types";

const TEST_DIR = path.join(
  os.tmpdir(),
  "remote-peon-sm-test-" + process.pid
);

function setup() {
  fs.rmSync(TEST_DIR, { recursive: true, force: true });
  const soundsDir = path.join(TEST_DIR, "sounds");
  fs.mkdirSync(soundsDir, { recursive: true });

  fs.writeFileSync(path.join(soundsDir, "greet1.wav"), "audio1");
  fs.writeFileSync(path.join(soundsDir, "greet2.wav"), "audio2");
  fs.writeFileSync(path.join(soundsDir, "ack.wav"), "audio3");
  fs.writeFileSync(path.join(soundsDir, "done.wav"), "audio4");

  fs.writeFileSync(
    path.join(TEST_DIR, "manifest.json"),
    JSON.stringify({
      id: "test",
      name: "Test",
      sounds: {
        greeting: ["greet1.wav", "greet2.wav"],
        acknowledge: ["ack.wav"],
        complete: ["done.wav"],
      },
    })
  );
}

function teardown() {
  fs.rmSync(TEST_DIR, { recursive: true, force: true });
}

// Minimal pick logic mirroring SoundManager without vscode dependency
function pickSound(
  pack: SoundPack,
  category: SoundCategory,
  lastPlayed: Map<SoundCategory, string>,
  enabled: boolean = true
): string | null {
  if (!enabled) return null;
  if (!pack) return null;

  let files = pack.sounds[category];
  if (!files?.length && category === "complete") {
    files = pack.sounds["acknowledge"];
  }
  if (!files?.length) return null;

  if (files.length === 1) return files[0];

  const last = lastPlayed.get(category);
  const candidates = last ? files.filter((f) => f !== last) : files;
  const pick = candidates[Math.floor(Math.random() * candidates.length)];
  lastPlayed.set(category, pick);
  return pick;
}

describe("Sound picking logic", () => {
  let pack: SoundPack;

  beforeEach(() => {
    setup();
    pack = loadPack(TEST_DIR)!;
    assert.ok(pack, "pack should load");
  });

  afterEach(() => teardown());

  it("picks a file from a category with multiple files", () => {
    const lastPlayed = new Map<SoundCategory, string>();
    const file = pickSound(pack, "greeting", lastPlayed);
    assert.ok(file);
    assert.ok(file!.includes("greet"));
  });

  it("never repeats consecutively with 2+ files", () => {
    const lastPlayed = new Map<SoundCategory, string>();
    const picks = new Set<string>();
    let prevPick: string | null = null;

    for (let i = 0; i < 20; i++) {
      const pick = pickSound(pack, "greeting", lastPlayed);
      assert.ok(pick);
      if (prevPick !== null) {
        assert.notStrictEqual(
          pick,
          prevPick,
          `Should not repeat: got ${pick} twice`
        );
      }
      picks.add(pick!);
      prevPick = pick;
    }

    assert.strictEqual(picks.size, 2, "Should use both greeting files");
  });

  it("returns the single file when category has 1 file", () => {
    const lastPlayed = new Map<SoundCategory, string>();
    const file = pickSound(pack, "acknowledge", lastPlayed);
    assert.ok(file);
    assert.ok(file!.endsWith("ack.wav"));
  });

  it("returns null for empty category", () => {
    const lastPlayed = new Map<SoundCategory, string>();
    const file = pickSound(pack, "error", lastPlayed);
    assert.strictEqual(file, null);
  });

  it("returns null when disabled", () => {
    const lastPlayed = new Map<SoundCategory, string>();
    const file = pickSound(pack, "greeting", lastPlayed, false);
    assert.strictEqual(file, null);
  });

  it("complete falls back to acknowledge files when empty", () => {
    // Create a pack where complete has no files
    const noCompletePack: SoundPack = {
      ...pack,
      sounds: {
        acknowledge: pack.sounds.acknowledge,
        greeting: pack.sounds.greeting,
        // complete is missing
      },
    };

    const lastPlayed = new Map<SoundCategory, string>();
    const file = pickSound(noCompletePack, "complete", lastPlayed);
    assert.ok(file);
    assert.ok(file!.endsWith("ack.wav"));
  });
});
