import { describe, it } from "node:test";
import * as assert from "node:assert";
import { isValidCategory, VALID_CATEGORIES } from "../src/types";

/**
 * Tests for event parsing logic used by EventWatcher.
 * We test the parsing helpers directly since EventWatcher.handleChange
 * is private and depends on fs / vscode.
 */

describe("isValidCategory", () => {
  it("returns true for all valid categories", () => {
    for (const cat of VALID_CATEGORIES) {
      assert.strictEqual(isValidCategory(cat), true, `${cat} should be valid`);
    }
  });

  it("returns false for invalid categories", () => {
    assert.strictEqual(isValidCategory("unknown"), false);
    assert.strictEqual(isValidCategory(""), false);
    assert.strictEqual(isValidCategory("COMPLETE"), false);
    assert.strictEqual(isValidCategory("greet"), false);
    assert.strictEqual(isValidCategory("complete "), false);
  });
});

describe("event line parsing", () => {
  /**
   * Mirrors the parsing logic in EventWatcher.handleChange.
   */
  function parseEventLine(
    content: string
  ): { timestamp: number; category: string } | null {
    const trimmed = content.trim();
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

  it("parses valid content correctly", () => {
    const result = parseEventLine("1707834567890 complete");
    assert.deepStrictEqual(result, {
      timestamp: 1707834567890,
      category: "complete",
    });
  });

  it("parses all valid categories", () => {
    for (const cat of VALID_CATEGORIES) {
      const result = parseEventLine(`1000000000000 ${cat}`);
      assert.ok(result, `should parse category: ${cat}`);
      assert.strictEqual(result!.category, cat);
    }
  });

  it("handles content with trailing newline", () => {
    const result = parseEventLine("1707834567890 complete\n");
    assert.deepStrictEqual(result, {
      timestamp: 1707834567890,
      category: "complete",
    });
  });

  it("rejects empty content", () => {
    assert.strictEqual(parseEventLine(""), null);
    assert.strictEqual(parseEventLine("  "), null);
    assert.strictEqual(parseEventLine("\n"), null);
  });

  it("rejects content without space", () => {
    assert.strictEqual(parseEventLine("1707834567890complete"), null);
  });

  it("rejects invalid category", () => {
    assert.strictEqual(parseEventLine("1707834567890 invalid"), null);
  });

  it("rejects non-numeric timestamp", () => {
    assert.strictEqual(parseEventLine("abc complete"), null);
  });

  it("rejects content with only timestamp", () => {
    assert.strictEqual(parseEventLine("1707834567890"), null);
  });
});
