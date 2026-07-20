import { describe, expect, it } from "vitest";

import { databaseOptions } from "./data-source";

describe("database migration registry", () => {
  it("registers slide practice content hash as the latest migration", () => {
    const migrations = databaseOptions.migrations;
    expect(Array.isArray(migrations)).toBe(true);
    const latest = Array.isArray(migrations) ? migrations.at(-1) : null;
    expect(typeof latest).toBe("function");
    expect((latest as { name?: string } | null)?.name)
      .toBe("AddSlidePracticeContentHash2026072101000");
  });
});
