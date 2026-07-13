import type { QueryRunner } from "typeorm";
import { describe, expect, it, vi } from "vitest";
import { CreateSavedDesignPacks2026071101000 } from "./2026071101000-CreateSavedDesignPacks";

function recorder() {
  const queries: Array<{ sql: string; parameters?: unknown[] }> = [];
  const queryRunner = {
    query: vi.fn(async (sql: string, parameters?: unknown[]) => {
      queries.push({ sql, parameters });
    })
  } as unknown as QueryRunner;
  return { queries, queryRunner };
}

describe("CreateSavedDesignPacks migration", () => {
  it("creates ownership constraints and seven system presets", async () => {
    const { queries, queryRunner } = recorder();
    await new CreateSavedDesignPacks2026071101000().up(queryRunner);

    const sql = queries.map((query) => query.sql).join("\n");
    expect(sql).toContain("CREATE TABLE IF NOT EXISTS saved_design_packs");
    expect(sql).toContain("uq_saved_design_packs_owner_name");
    expect(sql).toContain("uq_saved_design_packs_owner_default");
    expect(queries.filter((query) => query.sql.includes("INSERT INTO saved_design_packs"))).toHaveLength(7);
  });

  it("drops the saved design pack storage on revert", async () => {
    const { queries, queryRunner } = recorder();
    await new CreateSavedDesignPacks2026071101000().down(queryRunner);

    expect(queries.at(-1)?.sql).toContain("DROP TABLE IF EXISTS saved_design_packs");
  });
});
