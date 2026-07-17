import { describe, expect, it, vi } from "vitest";

import { CreatePresentationSessionAudienceRegistry2026071703000 } from "./2026071703000-CreatePresentationSessionAudienceRegistry";

describe("CreatePresentationSessionAudienceRegistry migration", () => {
  it("creates a session-scoped anonymous audience registry and backfills responders", async () => {
    const query = vi.fn().mockResolvedValue([]);

    await new CreatePresentationSessionAudienceRegistry2026071703000().up({
      query
    } as never);

    const sql = query.mock.calls.map(([statement]) => String(statement)).join("\n");
    expect(sql).toContain("CREATE TABLE presentation_session_audiences");
    expect(sql).toContain("PRIMARY KEY (project_id, session_id, audience_id)");
    expect(sql).toContain("REFERENCES presentation_sessions(project_id, session_id)");
    expect(sql).toContain("MIN(responses.submitted_at)");
    expect(sql).toContain("ON CONFLICT (project_id, session_id, audience_id) DO NOTHING");
  });

  it("drops the registry on rollback", async () => {
    const query = vi.fn().mockResolvedValue([]);

    await new CreatePresentationSessionAudienceRegistry2026071703000().down({
      query
    } as never);

    expect(String(query.mock.calls[0]?.[0])).toContain(
      "DROP TABLE IF EXISTS presentation_session_audiences"
    );
  });
});
