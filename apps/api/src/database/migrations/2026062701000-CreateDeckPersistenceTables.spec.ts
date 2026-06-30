import { QueryRunner } from "typeorm";
import { describe, expect, it, vi } from "vitest";
import { CreateDeckPersistenceTables2026062701000 } from "./2026062701000-CreateDeckPersistenceTables";

function createQueryRecorder() {
  const queries: string[] = [];
  const queryRunner = {
    query: vi.fn(async (query: string) => {
      queries.push(query);
    })
  } as unknown as QueryRunner;

  return { queries, queryRunner };
}

describe("CreateDeckPersistenceTables migration", () => {
  it("creates deck persistence tables and indexes without project FK", async () => {
    const migration = new CreateDeckPersistenceTables2026062701000();
    const { queries, queryRunner } = createQueryRecorder();

    await migration.up(queryRunner);

    const sql = queries.join("\n");
    expect(sql).toContain("CREATE TABLE IF NOT EXISTS decks");
    expect(sql).toContain("project_id text PRIMARY KEY");
    expect(sql).toContain("deck_json jsonb NOT NULL");
    expect(sql).toContain("CREATE TABLE IF NOT EXISTS deck_patches");
    expect(sql).toContain("after_version integer NOT NULL CHECK");
    expect(sql).toContain("source IN ('user', 'ai', 'import', 'system')");
    expect(sql).toContain("CREATE TABLE IF NOT EXISTS deck_snapshots");
    expect(sql).toContain(
      "reason IN ('auto-save', 'deck-replaced', 'patch-applied', 'snapshot-restore')"
    );
    expect(sql).toContain("idx_decks_deck_id");
    expect(sql).toContain("idx_deck_patches_project_deck_version");
    expect(sql).toContain("uq_deck_patches_project_deck_after_version");
    expect(sql).toContain("idx_deck_snapshots_project_created_at");
    expect(sql).not.toContain("REFERENCES projects");
  });

  it("drops deck persistence tables and indexes on revert", async () => {
    const migration = new CreateDeckPersistenceTables2026062701000();
    const { queries, queryRunner } = createQueryRecorder();

    await migration.down(queryRunner);

    expect(queries).toEqual([
      "DROP INDEX IF EXISTS idx_deck_snapshots_project_created_at",
      "DROP TABLE IF EXISTS deck_snapshots",
      "DROP INDEX IF EXISTS uq_deck_patches_project_deck_after_version",
      "DROP INDEX IF EXISTS idx_deck_patches_project_deck_version",
      "DROP TABLE IF EXISTS deck_patches",
      "DROP INDEX IF EXISTS idx_decks_deck_id",
      "DROP TABLE IF EXISTS decks"
    ]);
  });
});
