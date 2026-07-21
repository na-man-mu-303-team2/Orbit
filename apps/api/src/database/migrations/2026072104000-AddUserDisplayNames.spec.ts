import type { QueryRunner } from "typeorm";
import { describe, expect, it, vi } from "vitest";
import { AddUserDisplayNames2026072104000 } from "./2026072104000-AddUserDisplayNames";

describe("AddUserDisplayNames migration", () => {
  it("backfills bounded unique display names before enforcing the contract", async () => {
    const { queryRunner, queries } = queryRunnerSpy();
    await new AddUserDisplayNames2026072104000().up(queryRunner);
    const sql = queries.join("\n");

    expect(sql).toContain("ADD COLUMN display_name text");
    expect(sql).toContain("split_part(user_record.email, '@', 1)");
    expect(sql).toContain("WHILE EXISTS");
    expect(sql).toContain("ALTER COLUMN display_name SET NOT NULL");
    expect(sql).toContain("char_length(btrim(display_name)) BETWEEN 2 AND 20");
    expect(sql).toContain("uq_users_display_name_normalized");
    expect(sql).toContain("lower(btrim(display_name))");
  });

  it("removes the unique index before dropping the column", async () => {
    const { queryRunner, queries } = queryRunnerSpy();
    await new AddUserDisplayNames2026072104000().down(queryRunner);
    const sql = queries.join("\n");

    expect(sql.indexOf("DROP INDEX")).toBeLessThan(sql.indexOf("DROP COLUMN"));
  });
});

function queryRunnerSpy() {
  const queries: string[] = [];
  const queryRunner = {
    query: vi.fn(async (sql: string) => {
      queries.push(sql);
      return [];
    })
  } as unknown as QueryRunner;
  return { queryRunner, queries };
}
