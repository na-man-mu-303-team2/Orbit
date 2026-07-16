import type { QueryRunner } from "typeorm";
import { describe, expect, it, vi } from "vitest";
import { AddOfficialImageAssetProvenance2026071201000 } from "./2026071201000-AddOfficialImageAssetProvenance";

describe("AddOfficialImageAssetProvenance migration", () => {
  it("adds direct asset URL, authority, and usage basis columns", async () => {
    const queries: string[] = [];
    const runner = {
      query: vi.fn(async (sql: string) => queries.push(sql))
    } as unknown as QueryRunner;

    await new AddOfficialImageAssetProvenance2026071201000().up(runner);

    const sql = queries.join("\n");
    expect(sql).toContain("source_asset_url text");
    expect(sql).toContain("source_authority text");
    expect(sql).toContain("usage_basis text");
  });
});
