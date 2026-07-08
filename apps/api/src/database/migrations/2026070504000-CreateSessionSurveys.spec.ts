import type { QueryRunner } from "typeorm";
import { describe, expect, it, vi } from "vitest";
import { CreateSessionSurveys2026070504000 } from "./2026070504000-CreateSessionSurveys";

function createQueryRecorder() {
  const queries: string[] = [];
  const queryRunner = {
    query: vi.fn(async (query: string) => {
      queries.push(query);
    }),
  } as unknown as QueryRunner;

  return { queries, queryRunner };
}

describe("CreateSessionSurveys migration", () => {
  it("creates session-owned survey form and response tables", async () => {
    const migration = new CreateSessionSurveys2026070504000();
    const { queries, queryRunner } = createQueryRecorder();

    await migration.up(queryRunner);

    const sql = queries.join("\n");
    expect(sql).toContain("CREATE TABLE IF NOT EXISTS session_survey_forms");
    expect(sql).toContain("session_id text NOT NULL UNIQUE");
    expect(sql).toContain(
      "CREATE TABLE IF NOT EXISTS session_survey_responses",
    );
    expect(sql).toContain("UNIQUE (survey_id, audience_id)");
    expect(sql).toContain("contact_consent boolean NOT NULL");
    expect(sql).toContain("contact_answers_json jsonb NOT NULL");
  });

  it("drops survey tables in dependency order", async () => {
    const migration = new CreateSessionSurveys2026070504000();
    const { queries, queryRunner } = createQueryRecorder();

    await migration.down(queryRunner);

    expect(queries.at(-2)).toBe(
      "DROP TABLE IF EXISTS session_survey_responses",
    );
    expect(queries.at(-1)).toBe("DROP TABLE IF EXISTS session_survey_forms");
  });
});
