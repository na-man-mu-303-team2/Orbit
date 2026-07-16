import type { QueryRunner } from "typeorm";
import { describe, expect, it, vi } from "vitest";
import { CreateSmartArtLayouts2026071701000 } from "./2026071701000-CreateSmartArtLayouts";

function recorder() {
  const queries: Array<{ sql: string; parameters?: unknown[] }> = [];
  const queryRunner = {
    query: vi.fn(async (sql: string, parameters?: unknown[]) => {
      queries.push({ sql, parameters });
    })
  } as unknown as QueryRunner;
  return { queries, queryRunner };
}

describe("CreateSmartArtLayouts migration", () => {
  it("creates the smart_art_layouts table and seeds list, card, and process presets", async () => {
    const { queries, queryRunner } = recorder();
    await new CreateSmartArtLayouts2026071701000().up(queryRunner);

    const sql = queries.map((query) => query.sql).join("\n");
    expect(sql).toContain("CREATE TABLE IF NOT EXISTS smart_art_layouts");
    expect(sql).toContain("idx_smart_art_layouts_type_count");
    expect(
      queries.filter((query) => query.sql.includes("INSERT INTO smart_art_layouts"))
    ).toHaveLength(7);
  });

  it("drops the smart art layout storage on revert", async () => {
    const { queries, queryRunner } = recorder();
    await new CreateSmartArtLayouts2026071701000().down(queryRunner);

    expect(queries.at(-1)?.sql).toContain("DROP TABLE IF EXISTS smart_art_layouts");
  });
});
