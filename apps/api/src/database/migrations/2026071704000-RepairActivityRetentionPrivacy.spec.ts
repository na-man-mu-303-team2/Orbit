import { describe, expect, it, vi } from "vitest";

import { RepairActivityRetentionPrivacy2026071704000 } from "./2026071704000-RepairActivityRetentionPrivacy";

describe("RepairActivityRetentionPrivacy migration", () => {
  it("removes retained text and backfills missing deletion deadlines", async () => {
    const query = vi.fn().mockResolvedValue([]);

    await new RepairActivityRetentionPrivacy2026071704000().up({ query } as never);

    const sql = query.mock.calls.map(([statement]) => String(statement)).join("\n");
    expect(sql).toContain("UPDATE activity_result_snapshots");
    expect(sql).toContain("'{textEntries}'");
    expect(sql).toContain("'[]'::jsonb");
    expect(sql).toContain("COALESCE(closed_at, ended_at, expires_at)");
    expect(sql).toContain("interval '90 days'");
  });

  it("does not attempt to restore deleted personal text on rollback", async () => {
    const query = vi.fn();

    await new RepairActivityRetentionPrivacy2026071704000().down({ query } as never);

    expect(query).not.toHaveBeenCalled();
  });
});
