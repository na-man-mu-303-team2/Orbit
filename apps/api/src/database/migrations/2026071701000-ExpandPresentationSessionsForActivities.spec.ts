import { describe, expect, it, vi } from "vitest";

import { ExpandPresentationSessionsForActivities2026071701000 } from "./2026071701000-ExpandPresentationSessionsForActivities";

describe("ExpandPresentationSessionsForActivities migration", () => {
  it("backfills the server deck version and constrains active sessions", async () => {
    const query = vi.fn(async (_sql: string) => undefined);

    await new ExpandPresentationSessionsForActivities2026071701000().up({ query } as never);

    const sql = query.mock.calls.map(([value]) => value).join("\n");
    expect(sql).toContain("deck_id = decks.deck_id");
    expect(sql).toContain("deck_version = decks.version");
    expect(sql).toContain("status = 'ended' OR (deck_id IS NOT NULL AND deck_version IS NOT NULL)");
    expect(sql).toContain("expires_at <= starts_at + interval '30 days'");
    expect(sql).toContain("idx_presentation_sessions_one_active_per_project");
  });

  it("restores the legacy status and index after dropping new constraints", async () => {
    const query = vi.fn(async (_sql: string) => undefined);

    await new ExpandPresentationSessionsForActivities2026071701000().down({ query } as never);

    const sql = query.mock.calls.map(([value]) => value).join("\n");
    expect(sql.indexOf("DROP CONSTRAINT")).toBeLessThan(sql.indexOf("DROP COLUMN"));
    expect(sql).toContain("status IN ('draft', 'live') THEN 'open'");
    expect(sql).toContain("idx_presentation_sessions_one_open_per_project");
  });
});
