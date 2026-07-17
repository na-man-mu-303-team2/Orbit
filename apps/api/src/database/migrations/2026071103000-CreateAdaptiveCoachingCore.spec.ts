import { describe, expect, it, vi } from "vitest";
import type { QueryRunner } from "typeorm";

import { CreateAdaptiveCoachingCore2026071103000 } from "./2026071103000-CreateAdaptiveCoachingCore";

describe("CreateAdaptiveCoachingCore migration", () => {
  it("creates tenant-safe immutable coaching core tables and safety columns", async () => {
    const { queryRunner, queries } = queryRunnerSpy();
    await new CreateAdaptiveCoachingCore2026071103000().up(queryRunner);
    const sql = queries.join("\n");

    expect(sql).toContain("'cancelled'");
    expect(sql).toContain("analysis_revision");
    expect(sql).toContain("content_hash");
    expect(sql).toContain("dispatch_attempt_count");
    expect(sql).toContain("CREATE TABLE presentation_briefs");
    expect(sql).toContain("CREATE TABLE practice_goal_sets");
    expect(sql).toContain("CREATE TABLE practice_goal_resolutions");
    expect(sql).toContain("CREATE TABLE storage_deletion_outbox");
    expect(sql).toContain("FOREIGN KEY (project_id, goal_id)");
    expect(sql).not.toMatch(/transcript|typed_answer|speaker_notes|audio_bytes/i);
  });

  it("reverses tables and additive columns in dependency order", async () => {
    const { queryRunner, queries } = queryRunnerSpy();
    await new CreateAdaptiveCoachingCore2026071103000().down(queryRunner);
    const sql = queries.join("\n");

    expect(sql.indexOf("DROP TABLE IF EXISTS practice_goal_resolutions")).toBeLessThan(
      sql.indexOf("DROP TABLE IF EXISTS practice_goals"),
    );
    expect(sql).toContain("DROP COLUMN IF EXISTS analysis_revision");
    expect(sql).toContain("Run cancelled before rollback");
  });
});

function queryRunnerSpy() {
  const queries: string[] = [];
  const queryRunner = {
    query: vi.fn(async (sql: string) => {
      queries.push(sql);
      return [];
    }),
  } as unknown as QueryRunner;
  return { queryRunner, queries };
}

