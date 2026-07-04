import { describe, expect, it, vi } from "vitest";
import type { QueryRunner } from "typeorm";
import { AddRehearsalRunMetaJson2026070301000 } from "./2026070301000-AddRehearsalRunMetaJson";

function createQueryRunner() {
  const queries: string[] = [];
  const queryRunner = {
    query: vi.fn(async (query: string) => {
      queries.push(query);
    })
  } as unknown as QueryRunner;

  return { queries, queryRunner };
}

describe("AddRehearsalRunMetaJson2026070301000", () => {
  it("adds a strict default meta JSON column", async () => {
    const { queries, queryRunner } = createQueryRunner();

    await new AddRehearsalRunMetaJson2026070301000().up(queryRunner);
    const sql = queries.join("\n");

    expect(sql).toContain("ALTER TABLE rehearsal_runs");
    expect(sql).toContain("ADD COLUMN IF NOT EXISTS meta_json jsonb NOT NULL DEFAULT '{}'::jsonb");
  });

  it("drops the meta JSON column on revert", async () => {
    const { queries, queryRunner } = createQueryRunner();

    await new AddRehearsalRunMetaJson2026070301000().down(queryRunner);

    expect(queries.join("\n")).toContain("DROP COLUMN IF EXISTS meta_json");
  });
});
