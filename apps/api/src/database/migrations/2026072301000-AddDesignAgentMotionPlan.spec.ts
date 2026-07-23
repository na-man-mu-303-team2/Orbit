import type { QueryRunner } from "typeorm";
import { describe, expect, it, vi } from "vitest";
import { AddDesignAgentMotionPlan2026072301000 } from "./2026072301000-AddDesignAgentMotionPlan";

describe("AddDesignAgentMotionPlan migration", () => {
  it("adds nullable validated motion plan metadata", async () => {
    const { queryRunner, queries } = queryRunnerSpy();
    await new AddDesignAgentMotionPlan2026072301000().up(queryRunner);
    const sql = queries.join("\n");

    expect(sql).toContain("ADD COLUMN motion_plan_json jsonb");
    expect(sql).toContain("motion_plan_json IS NULL");
    expect(sql).toContain("jsonb_typeof(motion_plan_json) = 'object'");
  });

  it("removes the constraint before the motion plan column", async () => {
    const { queryRunner, queries } = queryRunnerSpy();
    await new AddDesignAgentMotionPlan2026072301000().down(queryRunner);
    const sql = queries.join("\n");

    expect(sql.indexOf("DROP CONSTRAINT")).toBeLessThan(
      sql.indexOf("DROP COLUMN"),
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
  return { queryRunner, queries };
}
