import { describe, expect, it, vi } from "vitest";
import type { QueryRunner } from "typeorm";
import { AddRehearsalReportColumns2026062903000 } from "./2026062903000-AddRehearsalReportColumns";

function createQueryRunner() {
  const queries: string[] = [];
  const queryRunner = {
    query: vi.fn(async (query: string) => {
      queries.push(query);
    })
  } as unknown as QueryRunner;

  return { queries, queryRunner };
}

describe("AddRehearsalReportColumns2026062903000", () => {
  it("adds report JSON and transcript retention columns", async () => {
    const { queries, queryRunner } = createQueryRunner();

    await new AddRehearsalReportColumns2026062903000().up(queryRunner);
    const sql = queries.join("\n");

    expect(sql).toContain("ALTER TABLE rehearsal_runs");
    expect(sql).toContain("ADD COLUMN IF NOT EXISTS report_json jsonb");
    expect(sql).toContain(
      "ADD COLUMN IF NOT EXISTS transcript_retained boolean NOT NULL DEFAULT false"
    );
  });

  it("drops transcript retention before report JSON on revert", async () => {
    const { queries, queryRunner } = createQueryRunner();

    await new AddRehearsalReportColumns2026062903000().down(queryRunner);
    const sql = queries.join("\n");

    expect(sql).toContain("DROP COLUMN IF EXISTS transcript_retained");
    expect(sql).toContain("DROP COLUMN IF EXISTS report_json");
    expect(sql.indexOf("transcript_retained")).toBeLessThan(sql.indexOf("report_json"));
  });
});
