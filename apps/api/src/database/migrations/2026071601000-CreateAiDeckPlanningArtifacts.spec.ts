import type { QueryRunner } from "typeorm";
import { describe, expect, it, vi } from "vitest";

import { CreateAiDeckPlanningArtifacts2026071601000 } from "./2026071601000-CreateAiDeckPlanningArtifacts";

describe("CreateAiDeckPlanningArtifacts migration", () => {
  it("creates tenant-safe planning artifacts tied to singleton checkpoints", async () => {
    const { queries, queryRunner } = queryRunnerSpy();

    await new CreateAiDeckPlanningArtifacts2026071601000().up(queryRunner);

    const sql = compactSql(queries.join("\n"));
    expect(sql).toContain("CREATE TABLE ai_deck_planning_artifacts");
    expect(sql).toContain("artifact_id uuid PRIMARY KEY");
    expect(sql).toContain("payload_json jsonb NOT NULL");
    expect(sql).toContain("UNIQUE (pipeline_job_id, stage)");
    expect(sql).toContain(
      "FOREIGN KEY (pipeline_job_id, project_id) REFERENCES jobs(job_id, project_id) ON DELETE CASCADE",
    );
    expect(sql).toContain(
      "FOREIGN KEY (pipeline_job_id, stage, shard_key) REFERENCES ai_deck_generation_stages(pipeline_job_id, stage, shard_key) ON DELETE CASCADE",
    );
    expect(sql).toContain("shard_key text NOT NULL DEFAULT '' CHECK (shard_key = '')");
  });

  it("allows exact planning locators only on declared stage boundaries", async () => {
    const { queries, queryRunner } = queryRunnerSpy();

    await new CreateAiDeckPlanningArtifacts2026071601000().up(queryRunner);

    const sql = compactSql(queries.join("\n"));
    expect(sql).toContain("DROP CONSTRAINT ck_ai_deck_generation_stages_input_ref");
    expect(sql).toContain("DROP CONSTRAINT ck_ai_deck_generation_stages_result_ref");
    expect(sql).toContain("planningArtifactId");
    expect(sql).toContain(
      "stage IN ('content-planning','design-planning','layout-compile')",
    );
    expect(sql).toContain(
      "stage IN ( 'source-grounding','content-planning', 'design-planning','layout-compile' )",
    );
    expect(sql).toContain("stage = 'reference-extract-file'");
  });

  it("removes planning references and restores the 338-1 constraints on revert", async () => {
    const { queries, queryRunner } = queryRunnerSpy();

    await new CreateAiDeckPlanningArtifacts2026071601000().down(queryRunner);

    const sql = compactSql(queries.join("\n"));
    expect(sql).toContain("SET input_ref_json = '{}'::jsonb, result_ref_json = NULL");
    expect(sql).toContain("DROP TABLE IF EXISTS ai_deck_planning_artifacts");
    expect(sql).toContain("CHECK (input_ref_json = '{}'::jsonb)");
    expect(sql).toContain("referenceExtractionArtifactId");
    expect(sql).not.toContain("planningArtifactId");
    expect(sql.indexOf("SET input_ref_json")).toBeLessThan(
      sql.indexOf("DROP TABLE IF EXISTS ai_deck_planning_artifacts"),
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

function compactSql(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}
