import type { QueryRunner } from "typeorm";
import { describe, expect, it, vi } from "vitest";

import { CreateAiDeckGenerationStages2026071502000 } from "./2026071502000-CreateAiDeckGenerationStages";

describe("CreateAiDeckGenerationStages migration", () => {
  it("creates the durable stage checkpoint contract", async () => {
    const { queries, queryRunner } = queryRunnerSpy();

    await new CreateAiDeckGenerationStages2026071502000().up(queryRunner);

    const sql = queries.join("\n");
    expect(sql).toContain("CREATE TABLE ai_deck_generation_stages");
    expect(sql).toContain(
      "FOREIGN KEY (pipeline_job_id) REFERENCES jobs(job_id) ON DELETE CASCADE",
    );
    expect(sql).toContain("reference-extract-file");
    expect(sql).toContain("rendered-visual-quality");
    expect(sql).toContain("status IN ('queued','running','succeeded','failed')");
    expect(sql).toContain("attempt BETWEEN 0 AND 5");
    expect(sql).toContain("jsonb_typeof(input_ref_json) = 'object'");
    expect(sql).toContain("position(':' in pipeline_job_id) = 0");
    expect(sql).toContain("position(':' in shard_key) = 0");
    expect(sql).toContain("stage IN ('reference-extract-file','image-slide')");
    expect(sql).toContain("status = 'running' AND lease_owner IS NOT NULL");
    expect(sql).toContain(
      "UNIQUE (pipeline_job_id, stage, shard_key)",
    );
  });

  it("indexes undispatched checkpoints and expired leases", async () => {
    const { queries, queryRunner } = queryRunnerSpy();

    await new CreateAiDeckGenerationStages2026071502000().up(queryRunner);

    const sql = queries.join("\n");
    expect(sql).toContain("idx_ai_deck_generation_stages_undispatched");
    expect(sql).toContain("status = 'queued' AND dispatched_at IS NULL");
    expect(sql).toContain("idx_ai_deck_generation_stages_expired_lease");
    expect(sql).toContain("WHERE status = 'running'");
  });

  it("drops indexes before the checkpoint table", async () => {
    const { queries, queryRunner } = queryRunnerSpy();

    await new CreateAiDeckGenerationStages2026071502000().down(queryRunner);

    const sql = queries.join("\n");
    expect(sql.indexOf("idx_ai_deck_generation_stages_undispatched")).toBeLessThan(
      sql.indexOf("DROP TABLE IF EXISTS ai_deck_generation_stages"),
    );
    expect(sql.indexOf("idx_ai_deck_generation_stages_expired_lease")).toBeLessThan(
      sql.indexOf("DROP TABLE IF EXISTS ai_deck_generation_stages"),
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
