import type { QueryRunner } from "typeorm";
import { describe, expect, it, vi } from "vitest";
import { CreateAudienceQuestionAnswers2026070503000 } from "./2026070503000-CreateAudienceQuestionAnswers";

function createQueryRecorder() {
  const queries: string[] = [];
  const queryRunner = {
    query: vi.fn(async (query: string) => {
      queries.push(query);
    }),
  } as unknown as QueryRunner;

  return { queries, queryRunner };
}

describe("CreateAudienceQuestionAnswers migration", () => {
  it("adds selected references and AI answer storage", async () => {
    const migration = new CreateAudienceQuestionAnswers2026070503000();
    const { queries, queryRunner } = createQueryRecorder();

    await migration.up(queryRunner);

    const sql = queries.join("\n");
    expect(sql).toContain("selected_reference_ids_json");
    expect(sql).toContain(
      "CREATE TABLE IF NOT EXISTS audience_question_answers",
    );
    expect(sql).toContain("escalated_to_presenter boolean NOT NULL");
    expect(sql).toContain(
      "failure_reason IN ('low-confidence', 'no-grounding', 'timeout', 'worker-error')",
    );
  });

  it("drops AI answer storage and selected reference ids", async () => {
    const migration = new CreateAudienceQuestionAnswers2026070503000();
    const { queries, queryRunner } = createQueryRecorder();

    await migration.down(queryRunner);

    expect(queries.join("\n")).toContain(
      "DROP TABLE IF EXISTS audience_question_answers",
    );
    expect(queries.join("\n")).toContain(
      "DROP COLUMN IF EXISTS selected_reference_ids_json",
    );
  });
});
