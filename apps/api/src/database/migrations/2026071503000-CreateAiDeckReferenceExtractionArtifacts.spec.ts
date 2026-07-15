import type { QueryRunner } from "typeorm";
import { describe, expect, it, vi } from "vitest";

import { CreateAiDeckReferenceExtractionArtifacts2026071503000 } from "./2026071503000-CreateAiDeckReferenceExtractionArtifacts";

describe("CreateAiDeckReferenceExtractionArtifacts migration", () => {
  it("creates one tenant-safe OCR artifact per pipeline file", async () => {
    const { queries, queryRunner } = queryRunnerSpy();

    await new CreateAiDeckReferenceExtractionArtifacts2026071503000().up(
      queryRunner,
    );

    const sql = compactSql(queries.join("\n"));
    expect(sql).toContain("CREATE TABLE ai_deck_reference_extraction_artifacts");
    expect(sql).toContain("artifact_id uuid PRIMARY KEY");
    expect(sql).toContain("extraction_json jsonb NOT NULL");
    expect(sql).toContain("usable boolean NOT NULL");
    expect(sql).toContain("UNIQUE (pipeline_job_id, file_id)");
    expect(sql).toContain(
      "FOREIGN KEY (pipeline_job_id, project_id) REFERENCES jobs(job_id, project_id) ON DELETE CASCADE",
    );
    expect(sql).toContain(
      "FOREIGN KEY (project_id, file_id) REFERENCES project_assets(project_id, file_id) ON DELETE CASCADE",
    );
    expect(sql).toContain(
      "FOREIGN KEY (pipeline_job_id, stage, file_id) REFERENCES ai_deck_generation_stages(pipeline_job_id, stage, shard_key) ON DELETE CASCADE",
    );
    expect(sql).toContain("stage = 'reference-extract-file'");
    expect(sql).toContain(
      "CREATE INDEX idx_ai_deck_generation_stages_stale_dispatch",
    );
    expect(sql).toContain(
      "ON ai_deck_generation_stages ( dispatched_at, pipeline_job_id, shard_key )",
    );
    expect(sql).toContain(
      "WHERE stage = 'reference-extract-file' AND status = 'queued' AND dispatched_at IS NOT NULL",
    );
  });

  it("allows the exact OCR locator only on reference extraction results", async () => {
    const { queries, queryRunner } = queryRunnerSpy();

    await new CreateAiDeckReferenceExtractionArtifacts2026071503000().up(
      queryRunner,
    );

    const sql = compactSql(queries.join("\n"));
    expect(sql).toContain(
      "DROP CONSTRAINT ck_ai_deck_generation_stages_result_ref",
    );
    expect(sql).toContain("referenceExtractionArtifactId");
    expect(sql).toContain("result_ref_json = jsonb_build_object");
    expect(sql).not.toContain("jsonb_object_length");
    expect(sql).toContain("stage = 'reference-extract-file'");
    expect(sql).toContain("result_ref_json IS NULL");
    expect(sql).toContain("result_ref_json = '{}'::jsonb");
  });

  it("restores the 338-0 empty reference constraint on revert", async () => {
    const { queries, queryRunner } = queryRunnerSpy();

    await new CreateAiDeckReferenceExtractionArtifacts2026071503000().down(
      queryRunner,
    );

    const sql = compactSql(queries.join("\n"));
    expect(sql).toContain(
      "UPDATE ai_deck_generation_stages SET result_ref_json = NULL",
    );
    expect(sql).toContain(
      "DROP TABLE IF EXISTS ai_deck_reference_extraction_artifacts",
    );
    expect(sql).toContain(
      "DROP INDEX IF EXISTS idx_ai_deck_generation_stages_stale_dispatch",
    );
    expect(sql).toContain(
      "result_ref_json IS NULL OR result_ref_json = '{}'::jsonb",
    );
    expect(sql.indexOf("SET result_ref_json = NULL")).toBeLessThan(
      sql.indexOf("DROP TABLE IF EXISTS ai_deck_reference_extraction_artifacts"),
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
