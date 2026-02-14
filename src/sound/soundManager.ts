import { SoundPack, SoundCategory } from "../types";
import { Config } from "../config";
import { loadPack, listPacks } from "./packLoader";

export class SoundManager {
  private pack: SoundPack | null = null;
  private lastPlayed = new Map<SoundCategory, string>();

  constructor(private config: Config) {
    this.loadActivePack();
  }

  loadActivePack(): void {
    const packs = listPacks(this.config.packsDirectory);
    const target = this.config.pack;

    const found = packs.find((p) => p.id === target);
    if (!found) {
      console.warn(
        `Remote Peon: Pack "${target}" not found in ${this.config.packsDirectory}. ` +
          `Available: ${packs.map((p) => p.id).join(", ") || "(none)"}`
      );
      this.pack = null;
      return;
    }

    this.pack = loadPack(found.dir);
    this.lastPlayed.clear();
  }

  pickSound(category: SoundCategory): string | null {
    if (!this.config.isCategoryEnabled(category)) {
      return null;
    }

    if (!this.pack) {
      return null;
    }

    let files = this.pack.sounds[category];

    if (!files?.length && category === "complete") {
      files = this.pack.sounds["acknowledge"];
    }

    if (!files?.length) {
      return null;
    }

    if (files.length === 1) {
      return files[0];
    }

    const last = this.lastPlayed.get(category);
    const candidates = last ? files.filter((f) => f !== last) : files;
    const pick = candidates[Math.floor(Math.random() * candidates.length)];
    this.lastPlayed.set(category, pick);

    return pick;
  }

  getAvailablePacks(): Array<{ id: string; name: string }> {
    return listPacks(this.config.packsDirectory);
  }

  get isReady(): boolean {
    if (!this.pack) return false;
    return Object.values(this.pack.sounds).some(
      (files) => files && files.length > 0
    );
  }
}
