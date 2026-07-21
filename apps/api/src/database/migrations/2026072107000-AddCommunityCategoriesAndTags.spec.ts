import type { QueryRunner } from "typeorm";
import { describe, expect, it, vi } from "vitest";

import { AddCommunityCategoriesAndTags2026072107000 } from "./2026072107000-AddCommunityCategoriesAndTags";

describe("AddCommunityCategoriesAndTags migration", () => {
  it("creates managed categories and normalized reusable tags", async () => {
    const queries: string[] = [];
    const queryRunner = {
      query: vi.fn(async (query: string) => queries.push(query)),
    } as unknown as QueryRunner;

    await new AddCommunityCategoriesAndTags2026072107000().up(queryRunner);

    const sql = queries.join("\n");
    expect(sql).toContain("CREATE TABLE community_categories");
    expect(sql).toContain("('data-research', '데이터·리서치', 6)");
    expect(sql).toContain("RENAME COLUMN category TO category_id");
    expect(sql).toContain("CREATE TABLE community_tags");
    expect(sql).toContain("lower(btrim(name))");
    expect(sql).toContain("CREATE TABLE community_template_tags");
    expect(sql).toContain("PRIMARY KEY (template_id, tag_id)");
  });
});
