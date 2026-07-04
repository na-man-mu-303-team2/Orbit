import type { QueryRunner } from "typeorm";
import { describe, expect, it, vi } from "vitest";
import { CreateAudienceAggregateReports2026070505000 } from "./2026070505000-CreateAudienceAggregateReports";

function createQueryRecorder() {
  const queries: string[] = [];
  const queryRunner = {
    query: vi.fn(async (query: string) => {
      queries.push(query);
    }),
  } as unknown as QueryRunner;

  return { queries, queryRunner };
}

describe("CreateAudienceAggregateReports migration", () => {
  it("creates retained anonymous aggregate report storage", async () => {
    const migration = new CreateAudienceAggregateReports2026070505000();
    const { queries, queryRunner } = createQueryRecorder();

    await migration.up(queryRunner);

    const sql = queries.join("\n");
    expect(sql).toContain(
      "CREATE TABLE IF NOT EXISTS audience_aggregate_reports",
    );
    expect(sql).toContain("session_id text NOT NULL UNIQUE");
    expect(sql).toContain("aggregate_json jsonb NOT NULL");
    expect(sql).toContain("raw_data_deleted_at timestamptz");
  });

  it("drops aggregate report storage", async () => {
    const migration = new CreateAudienceAggregateReports2026070505000();
    const { queries, queryRunner } = createQueryRecorder();

    await migration.down(queryRunner);

    expect(queries.at(-1)).toBe(
      "DROP TABLE IF EXISTS audience_aggregate_reports",
    );
  });
});
