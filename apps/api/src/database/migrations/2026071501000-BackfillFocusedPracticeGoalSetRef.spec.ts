import type { QueryRunner } from "typeorm";
import { describe, expect, it, vi } from "vitest";

import { BackfillFocusedPracticeGoalSetRef2026071501000 } from "./2026071501000-BackfillFocusedPracticeGoalSetRef";

describe("BackfillFocusedPracticeGoalSetRef migration", () => {
  it("freezes the referenced goal-set revision in existing session snapshots", async () => {
    const { queries, queryRunner } = queryRunnerSpy();

    await new BackfillFocusedPracticeGoalSetRef2026071501000().up(queryRunner);

    const sql = queries.join("\n");
    expect(sql).toContain("UPDATE focused_practice_sessions sessions");
    expect(sql).toContain("'{goalSetRef}'");
    expect(sql).toContain("'goalSetId', goal_sets.goal_set_id");
    expect(sql).toContain("'revision', goal_sets.revision");
    expect(sql).toContain("goal_sets.goal_set_id = sessions.source_goal_set_id");
  });

  it("removes only the snapshot field introduced by this migration", async () => {
    const { queries, queryRunner } = queryRunnerSpy();

    await new BackfillFocusedPracticeGoalSetRef2026071501000().down(queryRunner);

    expect(queries.join("\n")).toContain("snapshot_json - 'goalSetRef'");
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
