import { QueryRunner } from "typeorm";
import { describe, expect, it, vi } from "vitest";
import { CreateTemplateBlueprints2026070301000 } from "./2026070301000-CreateTemplateBlueprints";

function createQueryRecorder() {
  const queries: string[] = [];
  const queryRunner = {
    query: vi.fn(async (query: string) => {
      queries.push(query);
    })
  } as unknown as QueryRunner;

  return { queries, queryRunner };
}

describe("CreateTemplateBlueprints migration", () => {
  it("creates template blueprint sidecar storage", async () => {
    const migration = new CreateTemplateBlueprints2026070301000();
    const { queries, queryRunner } = createQueryRecorder();

    await migration.up(queryRunner);

    const sql = queries.join("\n");
    expect(sql).toContain("CREATE TABLE IF NOT EXISTS template_blueprints");
    expect(sql).toContain("template_id text PRIMARY KEY");
    expect(sql).toContain("blueprint_json jsonb NOT NULL");
    expect(sql).toContain("quality_report_json jsonb NOT NULL");
    expect(sql).toContain("idx_template_blueprints_project_created_at");
  });

  it("drops template blueprint sidecar storage on revert", async () => {
    const migration = new CreateTemplateBlueprints2026070301000();
    const { queries, queryRunner } = createQueryRecorder();

    await migration.down(queryRunner);

    expect(queries).toEqual([
      "DROP INDEX IF EXISTS idx_template_blueprints_project_created_at",
      "DROP TABLE IF EXISTS template_blueprints"
    ]);
  });
});
