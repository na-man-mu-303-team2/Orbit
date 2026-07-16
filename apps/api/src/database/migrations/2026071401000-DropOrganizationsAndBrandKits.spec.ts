import type { QueryRunner } from "typeorm";
import { describe, expect, it, vi } from "vitest";
import { DropOrganizationsAndBrandKits2026071401000 } from "./2026071401000-DropOrganizationsAndBrandKits";

describe("DropOrganizationsAndBrandKits migration", () => {
  it("drops Brand Kit and organization storage without touching Design Packs", async () => {
    const queries: string[] = [];
    const query = vi.fn(async (sql: string) => queries.push(sql));
    const queryRunner = { query } as unknown as QueryRunner;

    await new DropOrganizationsAndBrandKits2026071401000().up(queryRunner);

    const sql = queries.join("\n");
    expect(sql).toContain("DROP COLUMN IF EXISTS generated_for_organization_id");
    expect(sql.indexOf("DROP TABLE IF EXISTS brand_kits")).toBeLessThan(
      sql.indexOf("DROP TABLE IF EXISTS organization_members")
    );
    expect(sql.indexOf("DROP TABLE IF EXISTS organization_members")).toBeLessThan(
      sql.indexOf("DROP TABLE IF EXISTS organizations")
    );
    expect(sql).not.toContain("saved_design_packs");
  });

  it("recreates the removed schema on rollback", async () => {
    const queries: string[] = [];
    const query = vi.fn(async (sql: string) => queries.push(sql));
    const queryRunner = { query } as unknown as QueryRunner;

    await new DropOrganizationsAndBrandKits2026071401000().down(queryRunner);

    const sql = queries.join("\n");
    expect(sql).toContain("CREATE TABLE IF NOT EXISTS organizations");
    expect(sql).toContain("CREATE TABLE IF NOT EXISTS organization_members");
    expect(sql).toContain("CREATE TABLE IF NOT EXISTS brand_kits");
    expect(sql).toContain("ADD COLUMN IF NOT EXISTS generated_for_organization_id text");
  });
});
