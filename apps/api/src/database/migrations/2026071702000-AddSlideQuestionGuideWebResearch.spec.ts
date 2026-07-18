import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";

import { AddSlideQuestionGuideWebResearch2026071702000 } from "./2026071702000-AddSlideQuestionGuideWebResearch";

describe("AddSlideQuestionGuideWebResearch2026071702000", () => {
  it("is registered in the API data source", () => {
    const dataSource = readFileSync(new URL("../data-source.ts", import.meta.url), "utf8");

    expect(dataSource).toContain("AddSlideQuestionGuideWebResearch2026071702000");
  });

  it("adds bounded metadata without a raw web content column", async () => {
    const statements: string[] = [];
    const query = vi.fn(async (statement: string) => { statements.push(statement); });
    const migration = new AddSlideQuestionGuideWebResearch2026071702000();

    await migration.up({ query } as never);

    const sql = statements.join("\n");
    expect(sql).toContain("schema_version IN (1, 2)");
    expect(sql).toContain("research_status");
    expect(sql).toContain("official_source_count");
    expect(sql).toContain("research_issue_codes");
    expect(sql).not.toMatch(/web_(content|excerpt)|search_query/);
  });

  it("restores the v1 schema constraint on rollback", async () => {
    const statements: string[] = [];
    const query = vi.fn(async (statement: string) => { statements.push(statement); });
    const migration = new AddSlideQuestionGuideWebResearch2026071702000();

    await migration.down({ query } as never);

    const sql = statements.join("\n");
    expect(sql).toContain("DROP COLUMN IF EXISTS research_status");
    expect(sql).toContain("schema_version = 1");
  });
});
