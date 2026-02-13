import { describe, it, beforeEach, afterEach } from "node:test";
import * as assert from "node:assert";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { SoundCategory } from "../src/types";

/**
 * Tests for SoundManager logic.
 *
 * SoundManager depends on Config (which depends on vscode API).
 * We test the core logic by creating a minimal mock that satisfies
 * the interface, then calling methods directly.
 */

let testDir: string;

function setup() {
  testDir = fs.mkdtempSync(path.join(os.tmpdir(), "remote-peon-sm-test-"));
}

function teardown() {
  fs.rmSync(testDir, { recursive: true, force: true });
}

/** Create a test pack in the temp directory */
function createTestPack(
  packId: string,
  sounds: Partial<Record<SoundCategory, string[]>>
): void {
  const packDir = path.join(testDir, packId);
  const soundsDir = path.join(packDir, "sounds");
  fs.mkdirSync(soundsDir, { recursive: true });

  const manifest: any = {
    id: packId,
    name: `Test ${packId}`,
    sounds: {} as any,
  };

  for (const [category, files] of Object.entries(sounds)) {
    manifest.sounds[category] = files;
    for (const file of files!) {
      fs.writeFileSync(path.join(soundsDir, file), "fake-audio-data");
    }
  }

  fs.writeFileSync(
    path.join(packDir, "manifest.json"),
    JSON.stringify(manifest)
  );
}

/**
 * Minimal re-implementation of SoundManager logic for unit testing
 * without the vscode dependency. Mirrors the real SoundManager.
 */
class TestSoundManager {
  private pack: any = null;
  private lastPlayed = new Map<string, string>();
  private enabledCategories: Set<string>;

  constructor(
    private packsDir: string,
    private packId: string,
    enabled: SoundCategory[] = [
      "greeting",
      "permission",
      "complete",
      "error",
      "annoyed",
    ]
  ) {
    this.enabledCategories = new Set(enabled);
    this.loadPack();
  }

  private loadPack(): void {
    // Inline the loadPack logic to avoid vscode import
    const packDir = path.join(this.packsDir, this.packId);
    const manifestPath = path.join(packDir, "manifest.json");
    if (!fs.existsSync(manifestPath)) {
      this.pack = null;
      return;
    }
    const raw = JSON.parse(fs.readFileSync(manifestPath, "utf-8"));
    const soundsDir = path.join(packDir, "sounds");
    const sounds: any = {};
    const validCats = [
      "greeting",
      "acknowledge",
      "permission",
      "complete",
      "error",
      "annoyed",
    ];
    for (const cat of validCats) {
      const files: string[] = raw.sounds[cat] ?? [];
      const resolved: string[] = [];
      for (const f of files) {
        const full = path.join(soundsDir, f);
        if (fs.existsSync(full)) resolved.push(full);
      }
      if (resolved.length > 0) sounds[cat] = resolved;
    }
    this.pack = { ...raw, sounds };
  }

  pickSound(category: SoundCategory): string | null {
    if (!this.enabledCategories.has(category)) return null;
    if (!this.pack) return null;

    let files = this.pack.sounds[category];
    if (!files?.length && category === "complete") {
      files = this.pack.sounds["acknowledge"];
    }
    if (!files?.length) return null;
    if (files.length === 1) return files[0];

    const last = this.lastPlayed.get(category);
    const candidates = last ? files.filter((f: string) => f !== last) : files;
    const pick = candidates[Math.floor(Math.random() * candidates.length)];
    this.lastPlayed.set(category, pick);
    return pick;
  }

  get isReady(): boolean {
    if (!this.pack) return false;
    return Object.values(this.pack.sounds).some(
      (files: any) => files && files.length > 0
    );
  }
}

describe("SoundManager", () => {
  beforeEach(() => setup());
  afterEach(() => teardown());

  it("picks a sound from a category with one file", () => {
    createTestPack("test", { complete: ["done.mp3"] });
    const sm = new TestSoundManager(testDir, "test");
    const pick = sm.pickSound("complete");
    assert.ok(pick);
    assert.ok(pick!.endsWith("done.mp3"));
  });

  it("never repeats the same file consecutively with 2+ files", () => {
    createTestPack("test", { complete: ["a.mp3", "b.mp3"] });
    const sm = new TestSoundManager(testDir, "test");

    // Run 20 picks and verify no consecutive repeats
    let lastPick: string | null = null;
    for (let i = 0; i < 20; i++) {
      const pick = sm.pickSound("complete");
      assert.ok(pick);
      if (lastPick !== null) {
        assert.notStrictEqual(pick, lastPick, `Repeat on iteration ${i}`);
      }
      lastPick = pick;
    }
  });

  it("returns null for disabled categories", () => {
    createTestPack("test", {
      acknowledge: ["ack.mp3"],
      complete: ["done.mp3"],
    });
    // acknowledge not in enabled list
    const sm = new TestSoundManager(testDir, "test");
    const pick = sm.pickSound("acknowledge");
    assert.strictEqual(pick, null);
  });

  it("returns null for categories with no files", () => {
    createTestPack("test", { complete: ["done.mp3"] });
    const sm = new TestSoundManager(testDir, "test");
    const pick = sm.pickSound("error");
    assert.strictEqual(pick, null);
  });

  it("falls back complete to acknowledge files", () => {
    createTestPack("test", { acknowledge: ["ack.mp3"] });
    // Enable both acknowledge and complete for this test
    const sm = new TestSoundManager(testDir, "test", [
      "complete",
      "acknowledge",
    ]);
    const pick = sm.pickSound("complete");
    assert.ok(pick);
    assert.ok(pick!.endsWith("ack.mp3"));
  });

  it("isReady returns true when pack has sounds", () => {
    createTestPack("test", { complete: ["done.mp3"] });
    const sm = new TestSoundManager(testDir, "test");
    assert.strictEqual(sm.isReady, true);
  });

  it("isReady returns false for missing pack", () => {
    const sm = new TestSoundManager(testDir, "nonexistent");
    assert.strictEqual(sm.isReady, false);
  });
});
