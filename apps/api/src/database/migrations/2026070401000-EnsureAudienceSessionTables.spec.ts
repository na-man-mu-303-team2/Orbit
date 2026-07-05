import type { QueryRunner } from "typeorm";
import { describe, expect, it, vi } from "vitest";
import { EnsureAudienceSessionTables2026070401000 } from "./2026070401000-EnsureAudienceSessionTables";

function createQueryRecorder() {
  const queries: string[] = [];
  const queryRunner = {
    query: vi.fn(async (query: string) => {
      queries.push(query);
    }),
  } as unknown as QueryRunner;

  return { queries, queryRunner };
}

describe("EnsureAudienceSessionTables migration", () => {
  it("creates missing foundational audience session tables idempotently", async () => {
    const migration = new EnsureAudienceSessionTables2026070401000();
    const { queries, queryRunner } = createQueryRecorder();

    await migration.up(queryRunner);

    const sql = queries.join("\n");
    expect(sql).toContain("CREATE TABLE IF NOT EXISTS audience_participants");
    expect(sql).toContain(
      "session_id text NOT NULL REFERENCES presentation_sessions(session_id)",
    );
    expect(sql).toContain(
      "CREATE TABLE IF NOT EXISTS audience_feature_settings",
    );
    expect(sql).toContain("CREATE TABLE IF NOT EXISTS audience_realtime_state");
    expect(sql).toContain("CREATE TABLE IF NOT EXISTS audience_events");
    expect(sql).toContain(
      "idx_audience_participants_session_last_seen_at",
    );
    expect(sql).toContain("idx_audience_events_session_occurred_at");
  });

  it("does not drop tables it may not have created on revert", async () => {
    const migration = new EnsureAudienceSessionTables2026070401000();
    const { queries } = createQueryRecorder();

    await migration.down();

    expect(queries).toEqual([]);
  });
});
