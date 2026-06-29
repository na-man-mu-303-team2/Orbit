import { QueryRunner } from "typeorm";
import { describe, expect, it, vi } from "vitest";
import { CreateWorkspaceInvites2026062902000 } from "./2026062902000-CreateWorkspaceInvites";

function createQueryRecorder() {
  const queries: string[] = [];
  const queryRunner = {
    query: vi.fn(async (query: string) => {
      queries.push(query);
    }),
  } as unknown as QueryRunner;

  return { queries, queryRunner };
}

describe("CreateWorkspaceInvites migration", () => {
  it("creates workspace membership and hashed invite tables", async () => {
    const migration = new CreateWorkspaceInvites2026062902000();
    const { queries, queryRunner } = createQueryRecorder();

    await migration.up(queryRunner);

    const sql = queries.join("\n");
    expect(sql).toContain("CREATE TABLE IF NOT EXISTS workspaces");
    expect(sql).toContain("CREATE TABLE IF NOT EXISTS workspace_members");
    expect(sql).toContain("role text NOT NULL CHECK (role IN ('owner', 'editor'))");
    expect(sql).toContain("CREATE TABLE IF NOT EXISTS workspace_invites");
    expect(sql).toContain("token_hash text NOT NULL");
    expect(sql).toContain("CREATE UNIQUE INDEX IF NOT EXISTS idx_workspace_invites_token_hash");
    expect(sql).not.toContain(" token text ");
  });

  it("drops invite tables before workspace tables", async () => {
    const migration = new CreateWorkspaceInvites2026062902000();
    const { queries, queryRunner } = createQueryRecorder();

    await migration.down(queryRunner);

    expect(queries.at(2)).toBe("DROP TABLE IF EXISTS workspace_invites");
    expect(queries.at(-1)).toBe("DROP TABLE IF EXISTS workspaces");
  });
});
