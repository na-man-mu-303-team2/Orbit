import { describe, expect, it, vi } from "vitest";
import type { QueryRunner } from "typeorm";

import { AddRehearsalEvaluationSnapshot2026071001000 } from "./2026071001000-AddRehearsalEvaluationSnapshot";

function createQueryRunner() {
  const queries: string[] = [];
  const queryRunner = {
    query: vi.fn(async (query: string) => {
      queries.push(query);
    })
  } as unknown as QueryRunner;

  return { queries, queryRunner };
}

describe("AddRehearsalEvaluationSnapshot2026071001000", () => {
  it("adds nullable snapshot columns and a full-mode default", async () => {
    const { queries, queryRunner } = createQueryRunner();

    await new AddRehearsalEvaluationSnapshot2026071001000().up(queryRunner);
    const sql = queries.join("\n");

    expect(sql).toContain("ADD COLUMN IF NOT EXISTS deck_version integer");
    expect(sql).toContain("ADD COLUMN IF NOT EXISTS evaluation_snapshot_json jsonb");
    expect(sql).toContain(
      "ADD COLUMN IF NOT EXISTS semantic_evaluation_mode text NOT NULL DEFAULT 'full'"
    );
  });

  it("drops the three columns in reverse dependency order", async () => {
    const { queries, queryRunner } = createQueryRunner();

    await new AddRehearsalEvaluationSnapshot2026071001000().down(queryRunner);
    const sql = queries.join("\n");

    expect(sql.indexOf("semantic_evaluation_mode")).toBeLessThan(
      sql.indexOf("evaluation_snapshot_json")
    );
    expect(sql.indexOf("evaluation_snapshot_json")).toBeLessThan(
      sql.indexOf("deck_version")
    );
  });
});
