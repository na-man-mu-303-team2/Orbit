import { QueryRunner } from "typeorm";
import { describe, expect, it, vi } from "vitest";
import { AddProjectMemberStatus2026062903000 } from "./2026062903000-AddProjectMemberStatus";

function createQueryRecorder() {
  const queries: string[] = [];
  const queryRunner = {
    query: vi.fn(async (query: string) => {
      queries.push(query);
    }),
  } as unknown as QueryRunner;

  return { queries, queryRunner };
}

describe("AddProjectMemberStatus migration", () => {
  it("adds status and backfills accepted memberships", async () => {
    const migration = new AddProjectMemberStatus2026062903000();
    const { queries, queryRunner } = createQueryRecorder();

    await migration.up(queryRunner);

    const sql = queries.join("\n");
    expect(sql).toContain("ADD COLUMN IF NOT EXISTS status text");
    expect(sql).toContain("SET status = 'accepted'");
    expect(sql).toContain("ALTER COLUMN status SET NOT NULL");
    expect(sql).toContain("project_members_status_check");
  });

  it("drops status on revert", async () => {
    const migration = new AddProjectMemberStatus2026062903000();
    const { queries, queryRunner } = createQueryRecorder();

    await migration.down(queryRunner);

    expect(queries.join("\n")).toContain("DROP COLUMN IF EXISTS status");
  });
});
