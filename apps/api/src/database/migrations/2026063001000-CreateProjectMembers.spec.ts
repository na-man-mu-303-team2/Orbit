import { QueryRunner } from "typeorm";
import { describe, expect, it, vi } from "vitest";
import { CreateProjectMembers2026063001000 } from "./2026063001000-CreateProjectMembers";

function createQueryRecorder() {
  const queries: string[] = [];
  const queryRunner = {
    query: vi.fn(async (query: string) => {
      queries.push(query);
    }),
  } as unknown as QueryRunner;

  return { queries, queryRunner };
}

describe("CreateProjectMembers migration", () => {
  it("creates project members and backfills existing project owners", async () => {
    const migration = new CreateProjectMembers2026063001000();
    const { queries, queryRunner } = createQueryRecorder();

    await migration.up(queryRunner);

    const sql = queries.join("\n");
    expect(sql).toContain("CREATE TABLE IF NOT EXISTS project_members");
    expect(sql).toContain("PRIMARY KEY (project_id, user_id)");
    expect(sql).toContain("INSERT INTO project_members");
    expect(sql).toContain("SELECT projects.project_id, projects.created_by, 'owner', 'accepted'");
    expect(sql).toContain("ON CONFLICT (project_id, user_id) DO NOTHING");
  });

  it("drops project member indexes and table on revert", async () => {
    const migration = new CreateProjectMembers2026063001000();
    const { queries, queryRunner } = createQueryRecorder();

    await migration.down(queryRunner);

    expect(queries).toEqual([
      "DROP INDEX IF EXISTS idx_project_members_project_status",
      "DROP INDEX IF EXISTS idx_project_members_user_status",
      "DROP TABLE IF EXISTS project_members",
    ]);
  });
});
