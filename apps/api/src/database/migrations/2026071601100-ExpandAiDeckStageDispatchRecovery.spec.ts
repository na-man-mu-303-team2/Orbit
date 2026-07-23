import type { QueryRunner } from "typeorm";
import { describe, expect, it, vi } from "vitest";

import { ExpandAiDeckStageDispatchRecovery2026071601100 } from "./2026071601100-ExpandAiDeckStageDispatchRecovery";

describe("ExpandAiDeckStageDispatchRecovery migration", () => {
  it("covers OCR and the four implemented planning queues", async () => {
    const { queries, queryRunner } = queryRunnerSpy();

    await new ExpandAiDeckStageDispatchRecovery2026071601100().up(queryRunner);

    const sql = compactSql(queries.join("\n"));
    expect(sql).toContain(
      "DROP INDEX IF EXISTS idx_ai_deck_generation_stages_stale_dispatch",
    );
    expect(sql).toContain(
      "stage IN ( 'reference-extract-file','source-grounding','content-planning', 'design-planning','layout-compile' )",
    );
    expect(sql).toContain("dispatched_at, pipeline_job_id, stage, shard_key");
  });

  it("restores the 338-1 OCR-only recovery index on revert", async () => {
    const { queries, queryRunner } = queryRunnerSpy();

    await new ExpandAiDeckStageDispatchRecovery2026071601100().down(queryRunner);

    const sql = compactSql(queries.join("\n"));
    expect(sql).toContain("WHERE stage = 'reference-extract-file'");
    expect(sql).not.toContain("source-grounding");
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

function compactSql(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}
