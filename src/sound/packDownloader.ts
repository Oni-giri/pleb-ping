import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import * as https from "https";
import * as vscode from "vscode";

const REPO_BASE =
  "https://raw.githubusercontent.com/PeonPing/og-packs/v1.1.0";

/** Known local peon-ping installation paths to check as a copy source. */
const PEON_PING_LOCAL_PATHS = [
  path.join(os.homedir(), ".claude", "hooks", "peon-ping", "packs"),
  path.join(os.homedir(), ".peon-ping", "packs"),
];

const DEFAULT_PACKS = ["peon", "peasant", "glados", "sc_battlecruiser"];

const ALL_PACKS = [
  "acolyte_ru",
  "aoe2",
  "aom_greek",
  "brewmaster_ru",
  "dota2_axe",
  "duke_nukem",
  "glados",
  "hd2_helldiver",
  "molag_bal",
  "murloc",
  "ocarina_of_time",
  "peon",
  "peon_cz",
  "peon_de",
  "peon_es",
  "peon_fr",
  "peon_pl",
  "peon_ru",
  "peasant",
  "peasant_cz",
  "peasant_es",
  "peasant_fr",
  "peasant_ru",
  "ra2_kirov",
  "ra2_soviet_engineer",
  "ra_soviet",
  "rick",
  "sc_battlecruiser",
  "sc_firebat",
  "sc_kerrigan",
  "sc_medic",
  "sc_scv",
  "sc_tank",
  "sc_terran",
  "sc_vessel",
  "sheogorath",
  "sopranos",
  "tf2_engineer",
  "wc2_peasant",
];

const CESP_CATEGORY_MAP: Record<string, string> = {
  "session.start": "greeting",
  "task.acknowledge": "acknowledge",
  "task.complete": "complete",
  "task.error": "error",
  "input.required": "permission",
  "user.spam": "annoyed",
  "resource.limit": "error",
};

function downloadFile(url: string, dest: string): Promise<boolean> {
  return new Promise((resolve) => {
    const file = fs.createWriteStream(dest);
    https
      .get(url, (response) => {
        if (
          response.statusCode &&
          response.statusCode >= 300 &&
          response.statusCode < 400 &&
          response.headers.location
        ) {
          file.close();
          try {
            fs.unlinkSync(dest);
          } catch {}
          downloadFile(response.headers.location, dest).then(resolve);
          return;
        }

        if (response.statusCode !== 200) {
          file.close();
          try {
            fs.unlinkSync(dest);
          } catch {}
          resolve(false);
          return;
        }

        response.pipe(file);
        file.on("finish", () => {
          file.close();
          resolve(true);
        });
      })
      .on("error", () => {
        file.close();
        try {
          fs.unlinkSync(dest);
        } catch {}
        resolve(false);
      });
  });
}

function parseCespManifest(manifest: any): Record<string, string[]> {
  const result: Record<string, string[]> = {};

  const categories = manifest.categories ?? {};
  for (const [cespCat, catData] of Object.entries<any>(categories)) {
    const ourCategory = CESP_CATEGORY_MAP[cespCat];
    if (!ourCategory) continue;

    const sounds: string[] = (catData.sounds ?? []).map((s: any) => {
      const filePath: string = typeof s === "string" ? s : s.file ?? "";
      return path.basename(filePath);
    });

    if (sounds.length > 0) {
      if (!result[ourCategory]) {
        result[ourCategory] = [];
      }
      result[ourCategory].push(...sounds);
    }
  }

  return result;
}

function parseLegacyManifest(manifest: any): Record<string, string[]> {
  return manifest.sounds ?? {};
}

/**
 * Try to copy a pack from a local peon-ping installation.
 * Returns true if the pack was successfully copied with at least one sound file.
 */
function copyPackFromLocal(
  packId: string,
  packsDir: string,
  outputChannel: vscode.OutputChannel
): boolean {
  for (const localPacksDir of PEON_PING_LOCAL_PATHS) {
    const sourceDir = path.join(localPacksDir, packId);
    const sourceSoundsDir = path.join(sourceDir, "sounds");

    if (!fs.existsSync(sourceSoundsDir)) continue;

    const soundFiles = fs.readdirSync(sourceSoundsDir).filter((f) =>
      /\.(wav|mp3|ogg)$/i.test(f)
    );
    if (soundFiles.length === 0) continue;

    // Found a valid local pack — copy it
    const destDir = path.join(packsDir, packId);
    const destSoundsDir = path.join(destDir, "sounds");
    fs.mkdirSync(destSoundsDir, { recursive: true });

    // Copy manifest (openpeon.json or manifest.json)
    const sourceManifest = fs.existsSync(path.join(sourceDir, "openpeon.json"))
      ? path.join(sourceDir, "openpeon.json")
      : fs.existsSync(path.join(sourceDir, "manifest.json"))
        ? path.join(sourceDir, "manifest.json")
        : null;

    if (!sourceManifest) continue;

    fs.copyFileSync(sourceManifest, path.join(destDir, path.basename(sourceManifest)));

    // Copy sound files
    let copied = 0;
    for (const f of soundFiles) {
      try {
        fs.copyFileSync(path.join(sourceSoundsDir, f), path.join(destSoundsDir, f));
        copied++;
      } catch {}
    }

    if (copied > 0) {
      // Write normalized manifest
      const isCesp = sourceManifest.endsWith("openpeon.json");
      try {
        const raw = JSON.parse(fs.readFileSync(sourceManifest, "utf-8"));
        const categoryFiles = isCesp
          ? parseCespManifest(raw)
          : parseLegacyManifest(raw);
        const normalizedManifest = {
          id: raw.id ?? raw.name ?? packId,
          name: raw.display_name ?? raw.name ?? packId,
          author: raw.author?.name ?? raw.author,
          description: raw.description,
          sounds: categoryFiles,
        };
        fs.writeFileSync(
          path.join(destDir, "manifest.json"),
          JSON.stringify(normalizedManifest, null, 2) + "\n"
        );
      } catch {}

      outputChannel.appendLine(
        `  [${packId}] Copied ${copied} files from local peon-ping`
      );
      return true;
    }
  }
  return false;
}

async function downloadPack(
  packId: string,
  packsDir: string,
  outputChannel: vscode.OutputChannel
): Promise<boolean> {
  // Try local copy first (instant, no network needed)
  if (copyPackFromLocal(packId, packsDir, outputChannel)) {
    return true;
  }

  // Fall back to downloading from GitHub
  const packDir = path.join(packsDir, packId);
  const soundsDir = path.join(packDir, "sounds");
  fs.mkdirSync(soundsDir, { recursive: true });

  const openpeonPath = path.join(packDir, "openpeon.json");
  const legacyPath = path.join(packDir, "manifest.json");

  let manifestPath: string | null = null;
  let isCesp = false;

  const openpeonUrl = `${REPO_BASE}/${packId}/openpeon.json`;
  if (await downloadFile(openpeonUrl, openpeonPath)) {
    manifestPath = openpeonPath;
    isCesp = true;
  } else {
    const legacyUrl = `${REPO_BASE}/${packId}/manifest.json`;
    if (await downloadFile(legacyUrl, legacyPath)) {
      manifestPath = legacyPath;
      isCesp = false;
    }
  }

  if (!manifestPath) {
    outputChannel.appendLine(`  [${packId}] No manifest found — skipping`);
    return false;
  }

  let manifest: any;
  try {
    manifest = JSON.parse(fs.readFileSync(manifestPath, "utf-8"));
  } catch {
    outputChannel.appendLine(
      `  [${packId}] Invalid manifest JSON — skipping`
    );
    return false;
  }

  const categoryFiles = isCesp
    ? parseCespManifest(manifest)
    : parseLegacyManifest(manifest);

  const allFiles = new Set<string>();
  for (const files of Object.values(categoryFiles)) {
    for (const f of files) {
      allFiles.add(f);
    }
  }

  if (allFiles.size === 0) {
    outputChannel.appendLine(
      `  [${packId}] No sound files in manifest — skipping`
    );
    return false;
  }

  let downloaded = 0;
  for (const filename of allFiles) {
    const url = `${REPO_BASE}/${packId}/sounds/${filename}`;
    const dest = path.join(soundsDir, filename);

    if (fs.existsSync(dest)) {
      downloaded++;
      continue;
    }

    if (await downloadFile(url, dest)) {
      downloaded++;
    } else {
      outputChannel.appendLine(
        `  [${packId}] Failed to download: ${filename}`
      );
    }
  }

  const normalizedManifest = {
    id: manifest.id ?? manifest.name ?? packId,
    name: manifest.display_name ?? manifest.name ?? packId,
    author: manifest.author?.name ?? manifest.author,
    description: manifest.description,
    sounds: categoryFiles,
  };
  fs.writeFileSync(
    path.join(packDir, "manifest.json"),
    JSON.stringify(normalizedManifest, null, 2) + "\n"
  );

  outputChannel.appendLine(
    `  [${packId}] ${downloaded}/${allFiles.size} sound files`
  );
  return downloaded > 0;
}

export function hasInstalledPacks(packsDir: string): boolean {
  if (!fs.existsSync(packsDir)) return false;
  try {
    const entries = fs.readdirSync(packsDir, { withFileTypes: true });
    return entries.some((e) => {
      if (!e.isDirectory()) return false;
      const soundsDir = path.join(packsDir, e.name, "sounds");
      if (!fs.existsSync(soundsDir)) return false;
      const files = fs.readdirSync(soundsDir);
      return files.some((f) => /\.(wav|mp3|ogg)$/i.test(f));
    });
  } catch {
    return false;
  }
}

export async function downloadDefaultPacks(
  packsDir: string,
  outputChannel: vscode.OutputChannel
): Promise<void> {
  await vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title: "Remote Peon: Downloading sound packs...",
      cancellable: true,
    },
    async (progress, token) => {
      const total = DEFAULT_PACKS.length;
      let done = 0;

      for (const packId of DEFAULT_PACKS) {
        if (token.isCancellationRequested) {
          outputChannel.appendLine("Pack download cancelled by user");
          break;
        }

        progress.report({
          message: `${packId} (${done + 1}/${total})`,
          increment: (1 / total) * 100,
        });

        outputChannel.appendLine(`Downloading pack: ${packId}`);
        await downloadPack(packId, packsDir, outputChannel);
        done++;
      }

      outputChannel.appendLine(
        `Downloaded ${done}/${total} default packs to ${packsDir}`
      );
    }
  );
}

export async function downloadAdditionalPacks(
  packsDir: string,
  outputChannel: vscode.OutputChannel
): Promise<void> {
  const installed = new Set<string>();
  if (fs.existsSync(packsDir)) {
    for (const entry of fs.readdirSync(packsDir, { withFileTypes: true })) {
      if (entry.isDirectory()) {
        installed.add(entry.name);
      }
    }
  }

  const items = ALL_PACKS.map((id) => ({
    label: id,
    description: installed.has(id) ? "installed" : "",
    picked: false,
    id,
  }));

  const selected = await vscode.window.showQuickPick(items, {
    placeHolder: "Select packs to download",
    canPickMany: true,
  });

  if (!selected || selected.length === 0) return;

  const toDownload = selected.filter((s) => !installed.has(s.id));

  if (toDownload.length === 0) {
    vscode.window.showInformationMessage(
      "All selected packs are already installed."
    );
    return;
  }

  await vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title: "Remote Peon: Downloading packs...",
      cancellable: true,
    },
    async (progress, token) => {
      for (let i = 0; i < toDownload.length; i++) {
        if (token.isCancellationRequested) break;
        const packId = toDownload[i].id;
        progress.report({
          message: `${packId} (${i + 1}/${toDownload.length})`,
          increment: (1 / toDownload.length) * 100,
        });
        await downloadPack(packId, packsDir, outputChannel);
      }
    }
  );

  vscode.window.showInformationMessage(
    `Downloaded ${toDownload.length} pack(s). Use "Remote Peon: Select Sound Pack" to switch.`
  );
}
