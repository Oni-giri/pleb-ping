import { describe, it, beforeEach, afterEach } from "node:test";
import * as assert from "node:assert";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";

import { isValidCategory, parseEventLine } from "../src/types";

describe("Event parsing", () => {
  it("parses valid complete event", () => {
    const result = parseEventLine("1707834567890 complete");
    assert.deepStrictEqual(result, {
      timestamp: 1707834567890,
      category: "complete",
    });
  });

  it("parses valid greeting event", () => {
    const result = parseEventLine("1707834567890 greeting");
    assert.deepStrictEqual(result, {
      timestamp: 1707834567890,
      category: "greeting",
    });
  });

  it("parses valid permission event", () => {
    const result = parseEventLine("1707834567890 permission");
    assert.deepStrictEqual(result, {
      timestamp: 1707834567890,
      category: "permission",
    });
  });

  it("rejects content with no space", () => {
    assert.strictEqual(parseEventLine("1707834567890complete"), null);
  });

  it("rejects invalid category", () => {
    assert.strictEqual(parseEventLine("1707834567890 foobar"), null);
  });

  it("rejects empty string", () => {
    assert.strictEqual(parseEventLine(""), null);
  });

  it("rejects whitespace-only string", () => {
    assert.strictEqual(parseEventLine("   "), null);
  });

  it("rejects non-numeric timestamp", () => {
    assert.strictEqual(parseEventLine("abc complete"), null);
  });

  it("handles trailing newline", () => {
    const result = parseEventLine("1707834567890 complete\n");
    assert.deepStrictEqual(result, {
      timestamp: 1707834567890,
      category: "complete",
    });
  });

  it("parses all valid categories", () => {
    const categories = [
      "greeting",
      "acknowledge",
      "permission",
      "complete",
      "error",
      "annoyed",
    ];
    for (const cat of categories) {
      const result = parseEventLine(`1000 ${cat}`);
      assert.ok(result, `should parse ${cat}`);
      assert.strictEqual(result!.category, cat);
    }
  });
});

describe("Multi-line event parsing", () => {
  it("parses multiple events from a multi-line string", () => {
    const content =
      "1707834567890 greeting\n1707834567891 complete\n1707834567892 permission\n";
    const lines = content.split("\n");
    const events = lines.map(parseEventLine).filter(Boolean);
    assert.strictEqual(events.length, 3);
    assert.strictEqual(events[0]!.category, "greeting");
    assert.strictEqual(events[1]!.category, "complete");
    assert.strictEqual(events[2]!.category, "permission");
  });

  it("skips malformed lines in a multi-line string", () => {
    const content = "1707834567890 greeting\ngarbage\n1707834567892 complete\n";
    const lines = content.split("\n");
    const events = lines.map(parseEventLine).filter(Boolean);
    assert.strictEqual(events.length, 2);
    assert.strictEqual(events[0]!.category, "greeting");
    assert.strictEqual(events[1]!.category, "complete");
  });

  it("handles empty lines between events", () => {
    const content = "1707834567890 greeting\n\n\n1707834567892 complete\n";
    const lines = content.split("\n");
    const events = lines.map(parseEventLine).filter(Boolean);
    assert.strictEqual(events.length, 2);
  });

  it("different categories from concurrent instances are all parsed", () => {
    const content =
      "1707834567890 greeting\n1707834567890 complete\n";
    const lines = content.split("\n");
    const events = lines.map(parseEventLine).filter(Boolean);
    assert.strictEqual(events.length, 2);
    const categories = events.map((e) => e!.category);
    assert.ok(categories.includes("greeting"));
    assert.ok(categories.includes("complete"));
  });
});

describe("isValidCategory", () => {
  it("returns true for valid categories", () => {
    assert.strictEqual(isValidCategory("complete"), true);
    assert.strictEqual(isValidCategory("greeting"), true);
    assert.strictEqual(isValidCategory("permission"), true);
  });

  it("returns false for invalid categories", () => {
    assert.strictEqual(isValidCategory("invalid"), false);
    assert.strictEqual(isValidCategory(""), false);
    assert.strictEqual(isValidCategory("COMPLETE"), false);
  });
});
