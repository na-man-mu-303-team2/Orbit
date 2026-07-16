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
    expect(
      migrations.some(
        (migration) =>
          typeof migration === "function" &&
          migration.name ===
            "CreateAiDeckReferenceExtractionArtifacts2026071503000",
      ),
    ).toBe(true);
    expect(
      migrations.some(
        (migration) =>
          typeof migration === "function" &&
          migration.name === "CreateAiDeckPlanningArtifacts2026071601000",
      ),
    ).toBe(true);
    expect(
      migrations.some(
        (migration) =>
          typeof migration === "function" &&
          migration.name === "ExpandAiDeckStageDispatchRecovery2026071601100",
      ),
    ).toBe(true);
  });

  it("registers the rehearsal transcript artifact migration", () => {
    const migrations = Array.isArray(databaseOptions.migrations)
      ? databaseOptions.migrations
      : [];

    expect(
      migrations.some(
        (migration) =>
          typeof migration === "function" &&
          migration.name === "AddRehearsalTranscriptArtifacts2026071603000",
      ),
    ).toBe(true);
  });

  it("registers the fourteen-day evidence retention migration", () => {
    const migrations = Array.isArray(databaseOptions.migrations)
      ? databaseOptions.migrations
      : [];

    expect(
      migrations.some(
        (migration) =>
          typeof migration === "function" &&
          migration.name === "SetEvidenceClipRetention14Days2026071604000",
      ),
    ).toBe(true);
  });
});
