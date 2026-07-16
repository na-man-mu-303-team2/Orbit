import type { QueryRunner } from "typeorm";
import { describe, expect, it, vi } from "vitest";

import { SetEvidenceClipRetention14Days2026071604000 } from "./2026071604000-SetEvidenceClipRetention14Days";

describe("SetEvidenceClipRetention14Days migration", () => {
  it("updates existing clips and enforces the fourteen-day policy", async () => {
    const { queries, queryRunner } = queryRunnerSpy();

    await new SetEvidenceClipRetention14Days2026071604000().up(queryRunner);

    const sql = compactSql(queries.join("\n"));
    expect(sql).toContain("ALTER COLUMN retention_days SET DEFAULT 14");
    expect(sql).toContain("SET retention_days = 14,");
    expect(sql).toContain("WHERE retention_days = 7");
    expect(sql).toContain("created_at + interval '14 days'");
    expect(sql).toContain("CHECK (retention_days = 14)");
    expect(sql).toContain("ck_rehearsal_evidence_clip_retention");
  });

  it("restores the previous seven-day policy on revert", async () => {
    const { queries, queryRunner } = queryRunnerSpy();

    await new SetEvidenceClipRetention14Days2026071604000().down(queryRunner);

    const sql = compactSql(queries.join("\n"));
    expect(sql).toContain("SET retention_days = 7,");
    expect(sql).toContain("WHERE retention_days = 14");
    expect(sql).toContain("created_at + interval '7 days'");
    expect(sql).toContain("ALTER COLUMN retention_days SET DEFAULT 7");
    expect(sql).toContain("CHECK (retention_days = 7)");
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
  return { queries, queryRunner };
}

function compactSql(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}
