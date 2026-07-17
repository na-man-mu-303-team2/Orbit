import type { DataSource } from "typeorm";
import { describe, expect, it, vi } from "vitest";

import { PresentationSessionRepository } from "./presentation-session.repository";

describe("PresentationSessionRepository", () => {
  it("qualifies session columns in the audience project join", async () => {
    const query = vi.fn().mockResolvedValue([]);
    const repository = new PresentationSessionRepository({ query } as unknown as DataSource);

    await repository.findAudienceInfo("session_1");

    const sql = String(query.mock.calls[0]?.[0]);
    expect(sql).toContain("sessions.project_id");
    expect(sql).toContain("projects.title AS project_title");
    expect(sql).toContain("WHERE sessions.session_id = $1");
  });

  it("casts the shared close timestamp before adding the retention interval", async () => {
    const query = vi
      .fn()
      .mockResolvedValueOnce([{ session_id: "session_1" }])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);
    const repository = new PresentationSessionRepository({} as DataSource);

    await repository.closeActive(
      { query } as never,
      "project_1",
      new Date("2026-07-17T01:00:00.000Z")
    );

    const closeSql = String(query.mock.calls[2]?.[0]);
    expect(closeSql).toContain("raw_responses_delete_after = $2::timestamptz");
    expect(closeSql).toContain("updated_at = $2::timestamptz");
  });

  it("reloads the canonical session row after closing", async () => {
    const live = { session_id: "session_1", status: "live" };
    const ended = { ...live, deck_id: "deck_1", deck_version: 1, status: "ended" };
    const query = vi
      .fn()
      .mockResolvedValueOnce([live])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([ended]);
    const repository = new PresentationSessionRepository({} as DataSource);

    await expect(
      repository.close(
        { query } as never,
        "project_1",
        "session_1",
        new Date("2026-07-17T01:00:00.000Z")
      )
    ).resolves.toEqual(ended);

    expect(String(query.mock.calls[3]?.[0])).toContain(
      "WHERE project_id = $1 AND session_id = $2"
    );
    expect(String(query.mock.calls[3]?.[0])).not.toContain("FOR UPDATE");
  });

  it("registers a successful audience join idempotently", async () => {
    const query = vi.fn().mockResolvedValue([]);
    const repository = new PresentationSessionRepository({ query } as unknown as DataSource);

    await repository.registerAudience(
      "project_1",
      "session_1",
      "audience_1",
      new Date("2026-07-17T01:00:00.000Z")
    );

    const sql = String(query.mock.calls[0]?.[0]);
    expect(sql).toContain("INSERT INTO presentation_session_audiences");
    expect(sql).toContain(
      "ON CONFLICT (project_id, session_id, audience_id) DO NOTHING"
    );
  });
});
