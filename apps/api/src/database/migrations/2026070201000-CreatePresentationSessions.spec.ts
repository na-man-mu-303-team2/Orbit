import type { QueryRunner } from "typeorm";
import { describe, expect, it, vi } from "vitest";
import { CreatePresentationSessions2026070201000 } from "./2026070201000-CreatePresentationSessions";

function createQueryRecorder() {
  const queries: string[] = [];
  const queryRunner = {
    query: vi.fn(async (query: string) => {
      queries.push(query);
    }),
  } as unknown as QueryRunner;

  return { queries, queryRunner };
}

describe("CreatePresentationSessions migration", () => {
  it("creates foundational audience engagement tables without passcode storage", async () => {
    const migration = new CreatePresentationSessions2026070201000();
    const { queries, queryRunner } = createQueryRecorder();

    await migration.up(queryRunner);

    const sql = queries.join("\n");
    expect(sql).toContain("DROP TABLE IF EXISTS presentation_sessions CASCADE");
    expect(sql).toContain("CREATE TABLE IF NOT EXISTS presentation_sessions");
    expect(sql).toContain("join_code text NOT NULL");
    expect(sql).toContain("entry_status text NOT NULL");
    expect(sql).toContain("raw_data_delete_after timestamptz NOT NULL");
    expect(sql).toContain("CREATE TABLE IF NOT EXISTS audience_participants");
    expect(sql).toContain("UNIQUE (session_id, nickname)");
    expect(sql).toContain(
      "CREATE TABLE IF NOT EXISTS audience_feature_settings",
    );
    expect(sql).toContain("CREATE TABLE IF NOT EXISTS audience_realtime_state");
    expect(sql).toContain("CREATE TABLE IF NOT EXISTS audience_events");
    expect(sql).not.toContain("session_password_hash");
    expect(sql).not.toContain("passcode");
    expect(sql).not.toContain(
      "CREATE TABLE IF NOT EXISTS session_interactions",
    );
    expect(sql).not.toContain("CREATE TABLE IF NOT EXISTS audience_questions");
    expect(sql).not.toContain(
      "CREATE TABLE IF NOT EXISTS session_survey_forms",
    );
  });

  it("drops foundational tables in dependency order on revert", async () => {
    const migration = new CreatePresentationSessions2026070201000();
    const { queries, queryRunner } = createQueryRecorder();

    await migration.down(queryRunner);

    expect(queries.at(-5)).toBe("DROP TABLE IF EXISTS audience_events");
    expect(queries.at(-4)).toBe("DROP TABLE IF EXISTS audience_realtime_state");
    expect(queries.at(-3)).toBe(
      "DROP TABLE IF EXISTS audience_feature_settings",
    );
    expect(queries.at(-2)).toBe("DROP TABLE IF EXISTS audience_participants");
    expect(queries.at(-1)).toBe("DROP TABLE IF EXISTS presentation_sessions");
  });
});
