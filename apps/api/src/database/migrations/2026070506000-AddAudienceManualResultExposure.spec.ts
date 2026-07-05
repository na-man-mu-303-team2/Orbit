import type { QueryRunner } from "typeorm";
import { describe, expect, it, vi } from "vitest";
import { AddAudienceManualResultExposure2026070506000 } from "./2026070506000-AddAudienceManualResultExposure";

function createQueryRecorder() {
  const queries: string[] = [];
  const queryRunner = {
    query: vi.fn(async (query: string) => {
      queries.push(query);
    }),
  } as unknown as QueryRunner;

  return { queries, queryRunner };
}

describe("AddAudienceManualResultExposure migration", () => {
  it("adds manual result exposure storage to session interactions", async () => {
    const migration = new AddAudienceManualResultExposure2026070506000();
    const { queries, queryRunner } = createQueryRecorder();

    await migration.up(queryRunner);

    const sql = queries.join("\n");
    expect(sql).toContain("ALTER TABLE session_interactions");
    expect(sql).toContain("ADD COLUMN IF NOT EXISTS exposed_result_question_ids");
    expect(sql).toContain("jsonb NOT NULL DEFAULT '[]'::jsonb");
  });

  it("drops manual result exposure storage", async () => {
    const migration = new AddAudienceManualResultExposure2026070506000();
    const { queries, queryRunner } = createQueryRecorder();

    await migration.down(queryRunner);

    const sql = queries.join("\n");
    expect(sql).toContain("ALTER TABLE session_interactions");
    expect(sql).toContain("DROP COLUMN IF EXISTS exposed_result_question_ids");
  });
});
