import type { QueryRunner } from "typeorm";
import { describe, expect, it, vi } from "vitest";
import { RepairPresentationSessionsContract2026070601000 } from "./2026070601000-RepairPresentationSessionsContract";

function createQueryRecorder() {
  const queries: string[] = [];
  const queryRunner = {
    query: vi.fn(async (query: string) => {
      queries.push(query);
    }),
  } as unknown as QueryRunner;

  return { queries, queryRunner };
}

describe("RepairPresentationSessionsContract migration", () => {
  it("repairs legacy presentation session columns before enforcing the current contract", async () => {
    const migration = new RepairPresentationSessionsContract2026070601000();
    const { queries, queryRunner } = createQueryRecorder();

    await migration.up(queryRunner);

    const sql = queries.join("\n");
    expect(sql).toContain("ADD COLUMN IF NOT EXISTS deck_id text");
    expect(sql).toContain("ADD COLUMN IF NOT EXISTS presenter_user_id text");
    expect(sql).toContain("ADD COLUMN IF NOT EXISTS join_code text");
    expect(sql).toContain("ADD COLUMN IF NOT EXISTS entry_status text");
    expect(sql).toContain(
      "ADD COLUMN IF NOT EXISTS audience_slide_render_mode text",
    );
    expect(sql).toContain("ADD COLUMN IF NOT EXISTS raw_data_delete_after");
    expect(sql).toContain("decks.deck_id");
    expect(sql).toContain("projects.created_by");
    expect(sql).toContain("generated_join_code");
    expect(sql).toContain("DROP CONSTRAINT IF EXISTS presentation_sessions_status_check");
    expect(sql).toContain("DROP COLUMN IF EXISTS session_password_hash");
    expect(sql).toContain("DROP COLUMN IF EXISTS expires_at");
  });

  it("restores constraints and indexes expected by presentation session queries", async () => {
    const migration = new RepairPresentationSessionsContract2026070601000();
    const { queries, queryRunner } = createQueryRecorder();

    await migration.up(queryRunner);

    const sql = queries.join("\n");
    expect(sql).toContain("ALTER COLUMN deck_id SET NOT NULL");
    expect(sql).toContain("presentation_sessions_presenter_user_id_fkey");
    expect(sql).toContain("presentation_sessions_join_code_check");
    expect(sql).toContain("CHECK (status IN ('draft', 'live', 'ended'))");
    expect(sql).toContain("presentation_sessions_entry_status_check");
    expect(sql).toContain(
      "presentation_sessions_audience_slide_render_mode_check",
    );
    expect(sql).toContain(
      "idx_presentation_sessions_project_status_created_at",
    );
    expect(sql).toContain("idx_presentation_sessions_active_join_code");
    expect(sql).toContain("idx_presentation_sessions_one_active_per_project");
  });

  it("keeps revert non-destructive for repaired local databases", async () => {
    const migration = new RepairPresentationSessionsContract2026070601000();
    const { queries } = createQueryRecorder();

    await migration.down();

    expect(queries).toEqual([]);
  });
});
