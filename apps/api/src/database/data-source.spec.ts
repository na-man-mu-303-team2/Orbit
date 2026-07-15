import { describe, expect, it } from "vitest";

import { databaseOptions } from "./data-source";

describe("databaseOptions", () => {
  it("keeps TypeORM query logging disabled to protect user content", () => {
    expect(databaseOptions.logging).toBe(false);
  });

  it("registers the AI deck stage checkpoint migration", () => {
    const migrations = Array.isArray(databaseOptions.migrations)
      ? databaseOptions.migrations
      : [];
    expect(
      migrations.some(
        (migration) =>
          typeof migration === "function" &&
          migration.name === "CreateAiDeckGenerationStages2026071502000",
      ),
    ).toBe(true);
  });
});
