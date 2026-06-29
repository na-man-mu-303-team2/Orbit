import { describe, expect, it, vi } from "vitest";
import type { QueryRunner } from "typeorm";
import { CreateAiSuggestions2026062902000 } from "./2026062902000-CreateAiSuggestions";

function createQueryRunner() {
  const queries: string[] = [];
  const queryRunner = {
    query: vi.fn(async (query: string) => {
      queries.push(query);
    })
  } as unknown as QueryRunner;

  return { queries, queryRunner };
}

describe("CreateAiSuggestions2026062902000", () => {
  it("creates the ai_suggestions table and lookup index", async () => {
    const { queries, queryRunner } = createQueryRunner();

    await new CreateAiSuggestions2026062902000().up(queryRunner);
    const sql = queries.join("\n");

    expect(sql).toContain("CREATE TABLE IF NOT EXISTS ai_suggestions");
    expect(sql).toContain("FOREIGN KEY (project_id)");
    expect(sql).toContain("status IN ('pending', 'applied', 'rejected')");
    expect(sql).toContain("idx_ai_suggestions_project_deck_slide_status");
  });

  it("drops the index before the table on revert", async () => {
    const { queries, queryRunner } = createQueryRunner();

    await new CreateAiSuggestions2026062902000().down(queryRunner);

    expect(queries).toEqual([
      "DROP INDEX IF EXISTS idx_ai_suggestions_project_deck_slide_status",
      "DROP TABLE IF EXISTS ai_suggestions"
    ]);
  });
});
