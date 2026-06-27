import { QueryRunner } from "typeorm";
import { describe, expect, it, vi } from "vitest";
import { CreateReferenceChunks2026062700100 } from "./2026062700100-CreateReferenceChunks";

function createQueryRecorder() {
  const queries: string[] = [];
  const queryRunner = {
    query: vi.fn(async (query: string) => {
      queries.push(query);
    })
  } as unknown as QueryRunner;

  return { queries, queryRunner };
}

describe("CreateReferenceChunks migration", () => {
  it("creates project-scoped reference chunk storage", async () => {
    const migration = new CreateReferenceChunks2026062700100();
    const { queries, queryRunner } = createQueryRecorder();

    await migration.up(queryRunner);

    const sql = queries.join("\n");
    expect(sql).toContain("CREATE TABLE IF NOT EXISTS reference_chunks");
    expect(sql).toContain("project_id text NOT NULL");
    expect(sql).toContain("file_id text NOT NULL");
    expect(sql).toContain("embedding vector(1536) NOT NULL");
    expect(sql).toContain("UNIQUE (project_id, file_id, chunk_index)");
    expect(sql).toContain("reference_chunks_project_file_idx");
  });

  it("drops reference chunks on revert", async () => {
    const migration = new CreateReferenceChunks2026062700100();
    const { queries, queryRunner } = createQueryRecorder();

    await migration.down(queryRunner);

    expect(queries.at(-1)).toBe("DROP TABLE IF EXISTS reference_chunks");
  });
});
