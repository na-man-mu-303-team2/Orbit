import { describe, expect, it } from "vitest";

import { databaseOptions } from "./data-source";

describe("database migration registry", () => {
  it("registers slide practice content hash and keeps migrations ordered", () => {
    const migrations = databaseOptions.migrations;
    expect(Array.isArray(migrations)).toBe(true);
    const migrationNames = Array.isArray(migrations)
      ? migrations.map((migration) => (migration as { name?: string }).name)
      : [];
    const latest = migrationNames.at(-1);
    expect(migrationNames).toContain("AddSlidePracticeContentHash2026072101000");
    expect(latest).toBe("AddUserDisplayNames2026072104000");
  });
});
