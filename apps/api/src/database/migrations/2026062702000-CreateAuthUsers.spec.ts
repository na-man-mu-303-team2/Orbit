import { QueryRunner } from "typeorm";
import { describe, expect, it, vi } from "vitest";
import { CreateAuthUsers2026062702000 } from "./2026062702000-CreateAuthUsers";

function createQueryRecorder() {
  const queries: string[] = [];
  const queryRunner = {
    query: vi.fn(async (query: string) => {
      queries.push(query);
    })
  } as unknown as QueryRunner;

  return { queries, queryRunner };
}

describe("CreateAuthUsers migration", () => {
  it("creates users with password hashes and unique normalized email lookup", async () => {
    const migration = new CreateAuthUsers2026062702000();
    const { queries, queryRunner } = createQueryRecorder();

    await migration.up(queryRunner);

    const sql = queries.join("\n");
    expect(sql).toContain("CREATE TABLE IF NOT EXISTS users");
    expect(sql).toContain("password_hash text NOT NULL");
    expect(sql).toContain("CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email_lower");
    expect(sql).toContain("ON users (lower(email))");
    expect(sql).not.toContain("password text");
  });

  it("drops the auth user table after indexes on revert", async () => {
    const migration = new CreateAuthUsers2026062702000();
    const { queries, queryRunner } = createQueryRecorder();

    await migration.down(queryRunner);

    expect(queries).toEqual([
      "DROP INDEX IF EXISTS idx_users_email_lower",
      "DROP TABLE IF EXISTS users"
    ]);
  });
});
