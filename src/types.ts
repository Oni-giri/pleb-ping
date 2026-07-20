export type SoundCategory =
  | "greeting"
  | "acknowledge"
  | "permission"
  | "complete"
  | "error"
  | "annoyed";

export const VALID_CATEGORIES: readonly SoundCategory[] = [
  "greeting",
  "acknowledge",
  "permission",
  "complete",
  "error",
  "annoyed",
] as const;

export function isValidCategory(value: string): value is SoundCategory {
  return VALID_CATEGORIES.includes(value as SoundCategory);
}

export interface SoundPack {
  id: string;
  name: string;
  author?: string;
  description?: string;
  sounds: Partial<Record<SoundCategory, string[]>>;
}

export interface PeonEvent {
  timestamp: number;
  category: SoundCategory;
}

/**
 * Parse a single event line: "<timestamp> <category>"
 * Returns null if the line is malformed.
 */
export function parseEventLine(
  line: string
): { timestamp: number; category: SoundCategory } | null {
  const trimmed = line.trim();
  if (!trimmed) return null;

  const spaceIndex = trimmed.indexOf(" ");
  if (spaceIndex === -1) return null;

  const timestampStr = trimmed.substring(0, spaceIndex);
  const category = trimmed.substring(spaceIndex + 1);

  const timestamp = parseInt(timestampStr, 10);
  if (isNaN(timestamp)) return null;

  if (!isValidCategory(category)) return null;

  return { timestamp, category };
}
