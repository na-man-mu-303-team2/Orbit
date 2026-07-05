import { describe, expect, it, vi } from "vitest";

import { AddAudienceSlideSnapshots2026070507000 } from "./2026070507000-AddAudienceSlideSnapshots";

describe("AddAudienceSlideSnapshots migration", () => {
  it("adds a durable audience slide snapshot map to presentation sessions", async () => {
    const migration = new AddAudienceSlideSnapshots2026070507000();
    const queryRunner = {
      query: vi.fn(),
    };

    await migration.up(queryRunner as never);

    const sql = queryRunner.query.mock.calls.map(([query]) => query).join("\n");
    expect(sql).toContain("ALTER TABLE presentation_sessions");
    expect(sql).toContain("audience_slide_snapshots_json jsonb");
    expect(sql).toContain("DEFAULT '{}'::jsonb");
  });

  it("removes the snapshot map on revert", async () => {
    const migration = new AddAudienceSlideSnapshots2026070507000();
    const queryRunner = {
      query: vi.fn(),
    };

    await migration.down(queryRunner as never);

    const sql = queryRunner.query.mock.calls.map(([query]) => query).join("\n");
    expect(sql).toContain("DROP COLUMN IF EXISTS audience_slide_snapshots_json");
  });
});
