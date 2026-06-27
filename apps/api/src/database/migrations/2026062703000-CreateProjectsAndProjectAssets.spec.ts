import { QueryRunner } from "typeorm";
import { describe, expect, it, vi } from "vitest";
import { CreateProjectsAndProjectAssets2026062703000 } from "./2026062703000-CreateProjectsAndProjectAssets";

function createQueryRecorder() {
  const queries: string[] = [];
  const queryRunner = {
    query: vi.fn(async (query: string) => {
      queries.push(query);
    }),
  } as unknown as QueryRunner;

  return { queries, queryRunner };
}

describe("CreateProjectsAndProjectAssets migration", () => {
  it("creates projects and project_assets with project-scoped metadata", async () => {
    const migration = new CreateProjectsAndProjectAssets2026062703000();
    const { queries, queryRunner } = createQueryRecorder();

    await migration.up(queryRunner);

    const sql = queries.join("\n");
    expect(sql).toContain("CREATE TABLE IF NOT EXISTS projects");
    expect(sql).toContain("workspace_id text NOT NULL");
    expect(sql).toContain("CREATE TABLE IF NOT EXISTS project_assets");
    expect(sql).toContain(
      "project_id text NOT NULL REFERENCES projects(project_id) ON DELETE CASCADE",
    );
    expect(sql).toContain("status text NOT NULL CHECK");
    expect(sql).toContain("uploaded_at timestamptz");
  });

  it("drops project_assets before projects on revert", async () => {
    const migration = new CreateProjectsAndProjectAssets2026062703000();
    const { queries, queryRunner } = createQueryRecorder();

    await migration.down(queryRunner);

    expect(queries.join("\n")).toContain("DROP TABLE IF EXISTS project_assets");
    expect(queries.join("\n")).toContain("DROP TABLE IF EXISTS projects");
    expect(
      queries.findIndex((query) => query.includes("project_assets")),
    ).toBeLessThan(queries.findIndex((query) => query.includes("projects")));
  });
});
