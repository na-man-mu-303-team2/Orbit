import type { QueryRunner } from "typeorm";
import { describe, expect, it, vi } from "vitest";
import { CreateRehearsalRuns2026062901000 } from "./2026062901000-CreateRehearsalRuns";

function createQueryRecorder() {
  const queries: string[] = [];
  const queryRunner = {
    query: vi.fn(async (query: string) => {
      queries.push(query);
    })
  } as unknown as QueryRunner;

  return { queries, queryRunner };
}

describe("CreateRehearsalRuns migration", () => {
  it("creates rehearsal runs and extends project asset deletion state", async () => {
    const migration = new CreateRehearsalRuns2026062901000();
    const { queries, queryRunner } = createQueryRecorder();

    await migration.up(queryRunner);

    const sql = queries.join("\n");
    expect(sql).toContain("ADD COLUMN IF NOT EXISTS deleted_at timestamptz");
    expect(sql).toContain("CHECK (status IN ('pending', 'uploaded', 'deleted'))");
    expect(sql).toContain("CREATE TABLE IF NOT EXISTS rehearsal_runs");
    expect(sql).toContain("raw_audio_deleted_at timestamptz");
    expect(sql).toContain("idx_rehearsal_runs_project_created_at");
  });

  it("drops rehearsal runs and restores project asset status on revert", async () => {
    const migration = new CreateRehearsalRuns2026062901000();
    const { queries, queryRunner } = createQueryRecorder();

    await migration.down(queryRunner);

    const sql = queries.join("\n");
    expect(sql).toContain("DROP TABLE IF EXISTS rehearsal_runs");
    expect(sql).toContain("CHECK (status IN ('pending', 'uploaded'))");
    expect(sql).toContain("DROP COLUMN IF EXISTS deleted_at");
  });
});
