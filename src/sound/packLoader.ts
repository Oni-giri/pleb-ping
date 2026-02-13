import * as fs from "fs";
import * as path from "path";
import { SoundPack, SoundCategory, VALID_CATEGORIES } from "../types";

/**
 * Loads a sound pack from a manifest.json file.
 *
 * Expected directory structure:
 *   packs/peon/
 *   ├── manifest.json
 *   └── sounds/
 *       ├── greeting_1.mp3
 *       └── ...
 */
export function loadPack(packDir: string): SoundPack | null {
  const manifestPath = path.join(packDir, "manifest.json");

  if (!fs.existsSync(manifestPath)) {
    console.warn(`Remote Peon: No manifest.json in ${packDir}`);
    return null;
  }

  let raw: any;
  try {
    raw = JSON.parse(fs.readFileSync(manifestPath, "utf-8"));
  } catch (err) {
    console.error(`Remote Peon: Invalid manifest.json in ${packDir}:`, err);
    return null;
  }

  if (!raw.id || typeof raw.id !== "string") {
    console.error(`Remote Peon: manifest.json missing "id" in ${packDir}`);
    return null;
  }
  if (!raw.sounds || typeof raw.sounds !== "object") {
    console.error(`Remote Peon: manifest.json missing "sounds" in ${packDir}`);
    return null;
  }

  const soundsDir = path.join(packDir, "sounds");

  const sounds: Partial<Record<SoundCategory, string[]>> = {};

  for (const category of VALID_CATEGORIES) {
    const files: string[] = raw.sounds[category] ?? [];
    if (!Array.isArray(files)) continue;

    const resolved: string[] = [];
    for (const file of files) {
      const fullPath = path.join(soundsDir, file);
      if (fs.existsSync(fullPath)) {
        resolved.push(fullPath);
      } else {
        console.warn(`Remote Peon: Sound file not found: ${fullPath}`);
      }
    }

    if (resolved.length > 0) {
      sounds[category] = resolved;
    }
  }

  return {
    id: raw.id,
    name: raw.name ?? raw.id,
    author: raw.author,
    description: raw.description,
    sounds,
  };
}

/**
 * Lists all available packs in the packs directory.
 */
export function listPacks(
  packsDirectory: string
): Array<{ id: string; name: string; dir: string }> {
  if (!fs.existsSync(packsDirectory)) {
    return [];
  }

  const entries = fs.readdirSync(packsDirectory, { withFileTypes: true });
  const packs: Array<{ id: string; name: string; dir: string }> = [];

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;

    const packDir = path.join(packsDirectory, entry.name);
    const manifestPath = path.join(packDir, "manifest.json");

    if (!fs.existsSync(manifestPath)) continue;

    try {
      const raw = JSON.parse(fs.readFileSync(manifestPath, "utf-8"));
      packs.push({
        id: raw.id ?? entry.name,
        name: raw.name ?? entry.name,
        dir: packDir,
      });
    } catch {
      // Skip invalid manifests
    }
  }

  return packs;
}
