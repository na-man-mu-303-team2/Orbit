import type { QueryRunner } from "typeorm";
import { describe, expect, it, vi } from "vitest";
import { CreateAudienceQuestions2026070502000 } from "./2026070502000-CreateAudienceQuestions";

function createQueryRecorder() {
  const queries: string[] = [];
  const queryRunner = {
    query: vi.fn(async (query: string) => {
      queries.push(query);
    }),
  } as unknown as QueryRunner;

  return { queries, queryRunner };
}

describe("CreateAudienceQuestions migration", () => {
  it("creates the M6 Q&A queue table without AI answer tables", async () => {
    const migration = new CreateAudienceQuestions2026070502000();
    const { queries, queryRunner } = createQueryRecorder();

    await migration.up(queryRunner);

    const sql = queries.join("\n");
    expect(sql).toContain("CREATE TABLE IF NOT EXISTS audience_questions");
    expect(sql).toContain("question_group_id text NOT NULL");
    expect(sql).toContain("embedding_json jsonb");
    expect(sql).toContain("status text NOT NULL CHECK");
    expect(sql).not.toContain(
      "CREATE TABLE IF NOT EXISTS audience_question_answers",
    );
  });

  it("drops the Q&A queue table", async () => {
    const migration = new CreateAudienceQuestions2026070502000();
    const { queries, queryRunner } = createQueryRecorder();

    await migration.down(queryRunner);

    expect(queries.at(-1)).toBe("DROP TABLE IF EXISTS audience_questions");
  });
});
