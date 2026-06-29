import { QueryRunner } from "typeorm";
import { describe, expect, it, vi } from "vitest";
import { CreateProjectMembers2026062902000 } from "./2026062902000-CreateProjectMembers";

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
  it("creates project_members and backfills owners from projects.created_by", async () => {
    const migration = new CreateProjectMembers2026062902000();
    const { queries, queryRunner } = createQueryRecorder();

    await migration.up(queryRunner);

    const sql = queries.join("\n");
    expect(sql).toContain("CREATE TABLE IF NOT EXISTS project_members");
    expect(sql).toContain("PRIMARY KEY (project_id, user_id)");
    expect(sql).toContain("role text NOT NULL CHECK");
    expect(sql).toContain("status text NOT NULL CHECK");
    expect(sql).toContain("idx_project_members_user_project");
    expect(sql).toContain("idx_project_members_unique_accepted_owner");
    expect(sql).toContain("WHERE role = 'owner' AND status = 'accepted'");
    expect(sql).toContain(
      "SELECT project_id, created_by, 'owner', 'accepted', created_at",
    );
  });

  it("drops project_members on revert", async () => {
    const migration = new CreateProjectMembers2026062902000();
    const { queries, queryRunner } = createQueryRecorder();

    await migration.down(queryRunner);

    expect(queries.join("\n")).toContain("DROP TABLE IF EXISTS project_members");
  });
});
