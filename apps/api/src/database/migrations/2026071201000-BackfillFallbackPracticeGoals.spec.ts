import type { QueryRunner } from "typeorm";
import { describe, expect, it, vi } from "vitest";

import { BackfillFallbackPracticeGoals2026071201000 } from "./2026071201000-BackfillFallbackPracticeGoals";

describe("BackfillFallbackPracticeGoals migration", () => {
  it("creates fallback goal sets and goals for eligible historical runs", async () => {
    const { queries, queryRunner } = queryRunnerSpy();

    await new BackfillFallbackPracticeGoals2026071201000().up(queryRunner);

    const sql = queries.join("\n");
    expect(sql).toContain("CREATE EXTENSION IF NOT EXISTS pgcrypto");
    expect(sql).toContain("goalset_backfill_");
    expect(sql).toContain("practice_goal_heads");
    expect(sql).toContain("jsonb_array_elements");
    expect(sql).toContain("goal_backfill_");
    expect(sql).toContain("NOT EXISTS");
  });

  it("removes only generated fallback rows on rollback", async () => {
    const { queries, queryRunner } = queryRunnerSpy();

    await new BackfillFallbackPracticeGoals2026071201000().down(queryRunner);

    const sql = queries.join("\n");
    expect(sql).toContain("goal_backfill_%");
    expect(sql).toContain("goalset_backfill_%");
    expect(sql.indexOf("DELETE FROM practice_goals")).toBeLessThan(
      sql.indexOf("DELETE FROM practice_goal_heads"),
    );
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
  return { queries, queryRunner };
}
