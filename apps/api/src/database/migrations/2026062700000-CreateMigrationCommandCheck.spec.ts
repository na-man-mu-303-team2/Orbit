import { QueryRunner } from "typeorm";
import { describe, expect, it, vi } from "vitest";
import { CreateMigrationCommandCheck2026062700000 } from "./2026062700000-CreateMigrationCommandCheck";

function createQueryRecorder() {
  const queries: string[] = [];
  const queryRunner = {
    query: vi.fn(async (query: string) => {
      queries.push(query);
    })
  } as unknown as QueryRunner;

  return { queries, queryRunner };
}

describe("CreateMigrationCommandCheck migration", () => {
  it("creates only the sample migration validation table and pgvector extension", async () => {
    const migration = new CreateMigrationCommandCheck2026062700000();
    const { queries, queryRunner } = createQueryRecorder();

    await migration.up(queryRunner);

    const sql = queries.join("\n");
    expect(sql).toContain("CREATE EXTENSION IF NOT EXISTS vector");
    expect(sql).toContain("CREATE TABLE IF NOT EXISTS migration_command_checks");
    expect(sql).toContain("embedding vector(3)");
    expect(sql).toContain("sample_migration_check");
    expect(sql).not.toContain("CREATE TABLE IF NOT EXISTS projects");
    expect(sql).not.toContain("CREATE TABLE IF NOT EXISTS users");
    expect(sql).not.toContain("CREATE TABLE IF NOT EXISTS decks");
  });

  it("drops the sample table on revert", async () => {
    const migration = new CreateMigrationCommandCheck2026062700000();
    const { queries, queryRunner } = createQueryRecorder();

    await migration.down(queryRunner);

    expect(queries).toEqual(["DROP TABLE IF EXISTS migration_command_checks"]);
  });
});
