import type { QueryRunner } from "typeorm";
import { describe, expect, it, vi } from "vitest";

import { CreateAiDeckExecutionArtifacts2026071602000 } from "./2026071602000-CreateAiDeckExecutionArtifacts";

describe("CreateAiDeckExecutionArtifacts migration", () => {
  it("creates tenant-safe artifacts for image and final stages", async () => {
    const { queries, queryRunner } = queryRunnerSpy();
    await new CreateAiDeckExecutionArtifacts2026071602000().up(queryRunner);
    const sql = compactSql(queries.join("\n"));
    expect(sql).toContain("CREATE TABLE ai_deck_execution_artifacts");
    expect(sql).toContain("UNIQUE (pipeline_job_id, stage, shard_key)");
    expect(sql).toContain(
      "'image-slide','semantic-quality','rendered-visual-quality','publication'",
    );
    expect(sql).toContain("executionArtifactId");
    expect(sql).toContain("'layout-compile','image-slide','semantic-quality'");
  });

  it("removes final-stage references before restoring 338-2 constraints", async () => {
    const { queries, queryRunner } = queryRunnerSpy();
    await new CreateAiDeckExecutionArtifacts2026071602000().down(queryRunner);
    const sql = compactSql(queries.join("\n"));
    expect(sql).toContain(
      "SET input_ref_json = '{}'::jsonb, result_ref_json = NULL",
    );
    expect(sql).toContain("DROP TABLE IF EXISTS ai_deck_execution_artifacts");
    expect(sql).not.toContain("executionArtifactId");
    expect(sql).toContain("planningArtifactId");
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
