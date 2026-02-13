/**
 * Sound categories correspond to different agent states.
 * These names match the values written by the hook script
 * and the keys in manifest.json sound packs.
 */
export type SoundCategory =
  | "greeting"
  | "acknowledge"
  | "permission"
  | "complete"
  | "error"
  | "annoyed";

/**
 * All valid sound categories. Used for validation.
 */
export const VALID_CATEGORIES: readonly SoundCategory[] = [
  "greeting",
  "acknowledge",
  "permission",
  "complete",
  "error",
  "annoyed",
] as const;

/**
 * Check if a string is a valid SoundCategory.
 */
export function isValidCategory(value: string): value is SoundCategory {
  return VALID_CATEGORIES.includes(value as SoundCategory);
}

/**
 * A parsed sound pack manifest.
 */
export interface SoundPack {
  /** Unique identifier, e.g. "peon" */
  id: string;
  /** Display name, e.g. "Orc Peon" */
  name: string;
  /** Author name */
  author?: string;
  /** Description */
  description?: string;
  /** Map of category → array of sound file paths (absolute) */
  sounds: Partial<Record<SoundCategory, string[]>>;
}

/**
 * An event read from the event file.
 */
export interface PeonEvent {
  /** Unix timestamp in milliseconds */
  timestamp: number;
  /** Sound category to play */
  category: SoundCategory;
}
