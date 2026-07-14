import { describe, expect, it, vi } from "vitest";
import type { QueryRunner } from "typeorm";
import { CreateDesignAgentTables2026071101000 } from "./2026071101000-CreateDesignAgentTables";

describe("CreateDesignAgentTables2026071101000", () => {
  it("creates independent message and proposal tables", async () => {
    const queries: string[] = [];
    const queryRunner = {
      query: vi.fn(async (query: string) => {
        queries.push(query);
      }),
    } as unknown as QueryRunner;

    await new CreateDesignAgentTables2026071101000().up(queryRunner);
    const sql = queries.join("\n");

    expect(sql).toContain("CREATE TABLE IF NOT EXISTS design_agent_messages");
    expect(sql).toContain("actor_user_id text NOT NULL");
    expect(sql).toContain("CREATE TABLE IF NOT EXISTS design_agent_proposals");
    expect(sql).not.toContain("ai_suggestions");
  });

  it("drops proposals before messages", async () => {
    const queries: string[] = [];
    const queryRunner = {
      query: vi.fn(async (query: string) => {
        queries.push(query);
      }),
    } as unknown as QueryRunner;

    await new CreateDesignAgentTables2026071101000().down(queryRunner);
    expect(queries).toEqual([
      "DROP TABLE IF EXISTS design_agent_proposals",
      "DROP TABLE IF EXISTS design_agent_messages",
    ]);
  });
});
