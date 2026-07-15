import type { QueryRunner } from "typeorm";
import { describe, expect, it, vi } from "vitest";
import { AddRehearsalOwnership2026071503000 } from "./2026071503000-AddRehearsalOwnership";

function createQueryRecorder() {
  const queries: string[] = [];
  const queryRunner = {
    query: vi.fn(async (query: string) => {
      queries.push(query);
    })
  } as unknown as QueryRunner;

  return { queries, queryRunner };
}

describe("AddRehearsalOwnership migration", () => {
  it("backfills creators before enforcing private rehearsal ownership", async () => {
    const migration = new AddRehearsalOwnership2026071503000();
    const { queries, queryRunner } = createQueryRecorder();

    await migration.up(queryRunner);

    const sql = queries.join("\n");
    expect(sql).toContain("UPDATE rehearsal_runs runs");
    expect(sql).toContain("SET created_by_user_id = projects.created_by");
    expect(sql).toContain("ALTER COLUMN created_by_user_id SET NOT NULL");
    expect(sql).toContain("REFERENCES users(user_id) ON DELETE RESTRICT");
    expect(sql).toContain("purpose IN ('rehearsal-audio', 'rehearsal-slide-snapshot')");
    expect(sql).toContain("ck_project_assets_private_rehearsal_creator");
    expect(sql).toContain("ON rehearsal_runs (project_id, created_by_user_id, created_at DESC)");
    expect(sql).toContain("ON project_assets (project_id, created_by_user_id, purpose, status)");
    expect(sql.indexOf("UPDATE rehearsal_runs runs")).toBeLessThan(
      sql.indexOf("ALTER COLUMN created_by_user_id SET NOT NULL")
    );
    expect(sql.indexOf("UPDATE project_assets assets")).toBeLessThan(
      sql.indexOf("ck_project_assets_private_rehearsal_creator")
    );
  });

  it("drops indexes, constraints, and columns in reverse dependency order", async () => {
    const migration = new AddRehearsalOwnership2026071503000();
    const { queries, queryRunner } = createQueryRecorder();

    await migration.down(queryRunner);

    const sql = queries.join("\n");
    const firstIndex = sql.indexOf("DROP INDEX");
    const firstConstraint = sql.indexOf("DROP CONSTRAINT");
    const firstColumn = sql.indexOf("DROP COLUMN");
    expect(firstIndex).toBeGreaterThanOrEqual(0);
    expect(firstIndex).toBeLessThan(firstConstraint);
    expect(firstConstraint).toBeLessThan(firstColumn);
    expect(sql).toContain("DROP COLUMN IF EXISTS created_by_user_id");
  });
});
