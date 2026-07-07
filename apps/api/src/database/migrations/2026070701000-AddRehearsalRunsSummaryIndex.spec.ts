import type { QueryRunner } from "typeorm";
import { describe, expect, it, vi } from "vitest";

import { AddRehearsalRunsSummaryIndex2026070701000 } from "./2026070701000-AddRehearsalRunsSummaryIndex";

function createQueryRunner() {
  const queries: string[] = [];
  const queryRunner = {
    query: vi.fn(async (query: string) => {
      queries.push(query);
    })
  } as unknown as QueryRunner;

  return { queries, queryRunner };
}

describe("AddRehearsalRunsSummaryIndex2026070701000", () => {
  it("adds a project deck status created-at index for rehearsal summaries", async () => {
    const { queries, queryRunner } = createQueryRunner();

    await new AddRehearsalRunsSummaryIndex2026070701000().up(queryRunner);
    const sql = queries.join("\n");

    expect(sql).toContain("CREATE INDEX IF NOT EXISTS idx_rehearsal_runs_summary");
    expect(sql).toContain("ON rehearsal_runs (project_id, deck_id, status, created_at DESC)");
  });

  it("drops the summary index on revert", async () => {
    const { queries, queryRunner } = createQueryRunner();

    await new AddRehearsalRunsSummaryIndex2026070701000().down(queryRunner);

    expect(queries.join("\n")).toContain(
      "DROP INDEX IF EXISTS idx_rehearsal_runs_summary"
    );
  });
});
