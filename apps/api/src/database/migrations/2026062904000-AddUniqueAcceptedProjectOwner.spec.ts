import { QueryRunner } from "typeorm";
import { describe, expect, it, vi } from "vitest";
import { AddUniqueAcceptedProjectOwner2026062904000 } from "./2026062904000-AddUniqueAcceptedProjectOwner";

function createQueryRecorder() {
  const queries: string[] = [];
  const queryRunner = {
    query: vi.fn(async (query: string) => {
      queries.push(query);
    }),
  } as unknown as QueryRunner;

  return { queries, queryRunner };
}

describe("AddUniqueAcceptedProjectOwner migration", () => {
  it("deduplicates accepted owners before adding the partial unique index", async () => {
    const migration = new AddUniqueAcceptedProjectOwner2026062904000();
    const { queries, queryRunner } = createQueryRecorder();

    await migration.up(queryRunner);

    const sql = queries.join("\n");
    expect(sql).toContain("ranked_owners");
    expect(sql).toContain("SET role = 'editor'");
    expect(sql).toContain("idx_project_members_unique_accepted_owner");
    expect(sql).toContain("WHERE role = 'owner' AND status = 'accepted'");
  });

  it("drops the partial unique index on revert", async () => {
    const migration = new AddUniqueAcceptedProjectOwner2026062904000();
    const { queries, queryRunner } = createQueryRecorder();

    await migration.down(queryRunner);

    expect(queries.join("\n")).toContain(
      "DROP INDEX IF EXISTS idx_project_members_unique_accepted_owner",
    );
  });
});
