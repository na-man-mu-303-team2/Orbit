import { QueryRunner } from "typeorm";
import { describe, expect, it, vi } from "vitest";
import { CreateJobs2026062700200 } from "./2026062700200-CreateJobs";

function createQueryRecorder() {
  const queries: string[] = [];
  const queryRunner = {
    query: vi.fn(async (query: string) => {
      queries.push(query);
    })
  } as unknown as QueryRunner;

  return { queries, queryRunner };
}

describe("CreateJobs migration", () => {
  it("creates durable job state storage", async () => {
    const migration = new CreateJobs2026062700200();
    const { queries, queryRunner } = createQueryRecorder();

    await migration.up(queryRunner);

    const sql = queries.join("\n");
    expect(sql).toContain("CREATE TABLE IF NOT EXISTS jobs");
    expect(sql).toContain("job_id text PRIMARY KEY");
    expect(sql).toContain("project_id text NOT NULL");
    expect(sql).toContain("payload jsonb");
    expect(sql).toContain("result jsonb");
    expect(sql).toContain("error jsonb");
    expect(sql).toContain("jobs_project_status_idx");
    expect(sql).toContain("jobs_type_status_idx");
  });

  it("drops jobs on revert", async () => {
    const migration = new CreateJobs2026062700200();
    const { queries, queryRunner } = createQueryRecorder();

    await migration.down(queryRunner);

    expect(queries.at(-1)).toBe("DROP TABLE IF EXISTS jobs");
  });
});
