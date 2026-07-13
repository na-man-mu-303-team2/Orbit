import { describe, expect, it, vi } from "vitest";
import type { QueryRunner } from "typeorm";

import { CreateP0CoachingContracts2026071301000 } from "./2026071301000-CreateP0CoachingContracts";

describe("CreateP0CoachingContracts migration", () => {
  it("creates tenant-safe focus profile and bounded evidence clip tables", async () => {
    const { queryRunner, queries } = queryRunnerSpy();
    await new CreateP0CoachingContracts2026071301000().up(queryRunner);
    const sql = queries.join("\n");

    expect(sql).toContain("CREATE TABLE rehearsal_focus_profiles");
    expect(sql).toContain("CREATE TABLE rehearsal_evidence_clips");
    expect(sql).toContain("duration_ms BETWEEN 1 AND 12000");
    expect(sql).toContain("access_policy = 'owner-only'");
    expect(sql).toContain("retention_policy_version");
    expect(sql).toContain("retention_days");
    expect(sql).toContain("expires_at = created_at + interval '7 days'");
    expect(sql).toContain(
      "storage_key IS NOT NULL AND storage_key_hash IS NOT NULL",
    );
    expect(sql).toContain("FOREIGN KEY (project_id, run_id)");
    expect(sql).toContain("idx_rehearsal_evidence_clips_expiry");
    expect(sql).not.toMatch(/transcript|speaker_notes|audio_bytes|signed_url/i);
  });

  it("drops clip storage before the focus profile aggregate", async () => {
    const { queryRunner, queries } = queryRunnerSpy();
    await new CreateP0CoachingContracts2026071301000().down(queryRunner);
    const sql = queries.join("\n");

    expect(
      sql.indexOf("DROP TABLE IF EXISTS rehearsal_evidence_clips"),
    ).toBeLessThan(
      sql.indexOf("DROP TABLE IF EXISTS rehearsal_focus_profiles"),
    );
  });
});

function queryRunnerSpy() {
  const queries: string[] = [];
  const queryRunner = {
    query: vi.fn(async (sql: string) => {
      queries.push(sql);
      return [];
    }),
  } as unknown as QueryRunner;
  return { queryRunner, queries };
}
