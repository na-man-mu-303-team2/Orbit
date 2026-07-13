import type { QueryRunner } from "typeorm";
import { describe, expect, it, vi } from "vitest";
import { AddImageAssetProvenance2026071103000 } from "./2026071103000-AddImageAssetProvenance";

describe("AddImageAssetProvenance migration", () => {
  it("adds source, license, provider, and budget scope columns", async () => {
    const queries: string[] = [];
    const runner = {
      query: vi.fn(async (sql: string) => queries.push(sql))
    } as unknown as QueryRunner;

    await new AddImageAssetProvenance2026071103000().up(runner);

    const sql = queries.join("\n");
    expect(sql).toContain("source_url text");
    expect(sql).toContain("license_checked_at timestamptz");
    expect(sql).toContain("asset_provider text");
    expect(sql).toContain("generated_for_user_id text");
    expect(sql).toContain("generated_for_organization_id text");
  });
});
