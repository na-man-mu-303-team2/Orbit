import type { QueryRunner } from "typeorm";
import { describe, expect, it, vi } from "vitest";
import { CreateOrganizationsAndBrandKits2026071102000 } from "./2026071102000-CreateOrganizationsAndBrandKits";

describe("CreateOrganizationsAndBrandKits migration", () => {
  it("creates organization membership and Brand Kit constraints", async () => {
    const queries: string[] = [];
    const queryRunner = {
      query: vi.fn(async (sql: string) => {
        queries.push(sql);
      })
    } as unknown as QueryRunner;

    await new CreateOrganizationsAndBrandKits2026071102000().up(queryRunner);

    const sql = queries.join("\n");
    expect(sql).toContain("CREATE TABLE IF NOT EXISTS organizations");
    expect(sql).toContain("CREATE TABLE IF NOT EXISTS organization_members");
    expect(sql).toContain("role IN ('admin', 'member')");
    expect(sql).toContain("CREATE TABLE IF NOT EXISTS brand_kits");
    expect(sql).toContain("uq_brand_kits_organization_name");
  });
});
