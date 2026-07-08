import type { QueryRunner } from "typeorm";
import { describe, expect, it, vi } from "vitest";
import { CreateAudienceInteractions2026070501000 } from "./2026070501000-CreateAudienceInteractions";

function createQueryRecorder() {
  const queries: string[] = [];
  const queryRunner = {
    query: vi.fn(async (query: string) => {
      queries.push(query);
    }),
  } as unknown as QueryRunner;

  return { queries, queryRunner };
}

describe("CreateAudienceInteractions migration", () => {
  it("creates only Milestone 5 poll and quiz interaction tables", async () => {
    const migration = new CreateAudienceInteractions2026070501000();
    const { queries, queryRunner } = createQueryRecorder();

    await migration.up(queryRunner);

    const sql = queries.join("\n");
    expect(sql).toContain(
      "CREATE TABLE IF NOT EXISTS project_interaction_library",
    );
    expect(sql).toContain("CREATE TABLE IF NOT EXISTS session_interactions");
    expect(sql).toContain("CREATE TABLE IF NOT EXISTS interaction_responses");
    expect(sql).toContain("idx_session_interactions_one_active");
    expect(sql).toContain("UNIQUE (interaction_id, audience_id, question_id)");
    expect(sql).not.toContain("exposed_result_question_ids");
    expect(sql).not.toContain("CREATE TABLE IF NOT EXISTS audience_questions");
    expect(sql).not.toContain(
      "CREATE TABLE IF NOT EXISTS audience_question_answers",
    );
    expect(sql).not.toContain(
      "CREATE TABLE IF NOT EXISTS session_survey_forms",
    );
  });

  it("drops interaction tables in dependency order", async () => {
    const migration = new CreateAudienceInteractions2026070501000();
    const { queries, queryRunner } = createQueryRecorder();

    await migration.down(queryRunner);

    expect(queries.at(-3)).toBe("DROP TABLE IF EXISTS interaction_responses");
    expect(queries.at(-2)).toBe("DROP TABLE IF EXISTS session_interactions");
    expect(queries.at(-1)).toBe(
      "DROP TABLE IF EXISTS project_interaction_library",
    );
  });
});
