import * as fs from "fs";
import * as path from "path";
import { SoundPack, SoundCategory, VALID_CATEGORIES } from "../types";

const CESP_CATEGORY_MAP: Record<string, string> = {
  "session.start": "greeting",
  "task.acknowledge": "acknowledge",
  "task.complete": "complete",
  "task.error": "error",
  "input.required": "permission",
  "user.spam": "annoyed",
  "resource.limit": "error",
};

export function loadPack(packDir: string): SoundPack | null {
  let manifestPath = path.join(packDir, "manifest.json");
  let isCesp = false;

  if (!fs.existsSync(manifestPath)) {
    manifestPath = path.join(packDir, "openpeon.json");
    if (!fs.existsSync(manifestPath)) {
      console.warn(`Remote Peon: No manifest in ${packDir}`);
      return null;
    }
    isCesp = true;
  }

  let raw: any;
  try {
    raw = JSON.parse(fs.readFileSync(manifestPath, "utf-8"));
  } catch (err) {
    console.error(`Remote Peon: Invalid manifest in ${packDir}:`, err);
    return null;
  }

  const id = raw.id ?? path.basename(packDir);
  const soundsDir = path.join(packDir, "sounds");

  let categoryFiles: Record<string, string[]>;

  if (isCesp || raw.categories) {
    categoryFiles = {};
    for (const [cespCat, catData] of Object.entries<any>(
      raw.categories ?? {}
    )) {
      const ourCat = CESP_CATEGORY_MAP[cespCat];
      if (!ourCat) continue;
      const files = (catData.sounds ?? []).map((s: any) =>
        path.basename(typeof s === "string" ? s : s.file ?? "")
      );
      if (files.length > 0) {
        if (!categoryFiles[ourCat]) categoryFiles[ourCat] = [];
        categoryFiles[ourCat].push(...files);
      }
    }
  } else {
    categoryFiles = raw.sounds ?? {};
  }

  const sounds: Partial<Record<SoundCategory, string[]>> = {};
  for (const category of VALID_CATEGORIES) {
    const files: string[] = categoryFiles[category] ?? [];
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
    id,
    name: raw.name ?? id,
    author: raw.author,
    description: raw.description,
    sounds,
  };
}

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
    const openpeonPath = path.join(packDir, "openpeon.json");

    const mPath = fs.existsSync(manifestPath)
      ? manifestPath
      : fs.existsSync(openpeonPath)
        ? openpeonPath
        : null;

    if (!mPath) continue;

    try {
      const raw = JSON.parse(fs.readFileSync(mPath, "utf-8"));
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
