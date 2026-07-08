import type { QueryRunner } from "typeorm";
import { describe, expect, it, vi } from "vitest";
import { AddUniqueOpenPresentationSession2026070202000 } from "./2026070202000-AddUniqueOpenPresentationSession";

function createQueryRecorder() {
  const queries: string[] = [];
  const queryRunner = {
    query: vi.fn(async (query: string) => {
      queries.push(query);
    }),
  } as unknown as QueryRunner;

  return { queries, queryRunner };
}

describe("AddUniqueOpenPresentationSession migration", () => {
  it("enforces active join code and project uniqueness", async () => {
    const migration = new AddUniqueOpenPresentationSession2026070202000();
    const { queries, queryRunner } = createQueryRecorder();

    await migration.up(queryRunner);

    const sql = queries.join("\n");
    expect(sql).toContain("idx_presentation_sessions_active_join_code");
    expect(sql).toContain("ON presentation_sessions (join_code)");
    expect(sql).toContain("idx_presentation_sessions_one_active_per_project");
    expect(sql).toContain("ON presentation_sessions (project_id)");
    expect(sql).toContain("WHERE status IN ('draft', 'live')");
  });

  it("drops active uniqueness indexes on revert", async () => {
    const migration = new AddUniqueOpenPresentationSession2026070202000();
    const { queries, queryRunner } = createQueryRecorder();

    await migration.down(queryRunner);

    expect(queries.join("\n")).toContain(
      "DROP INDEX IF EXISTS idx_presentation_sessions_one_active_per_project",
    );
    expect(queries.join("\n")).toContain(
      "DROP INDEX IF EXISTS idx_presentation_sessions_active_join_code",
    );
  });
});
