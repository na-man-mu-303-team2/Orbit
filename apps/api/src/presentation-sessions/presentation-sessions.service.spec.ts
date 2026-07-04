import { describe, expect, it, vi } from "vitest";
import type { DataSource } from "typeorm";

import { PresentationSessionsService } from "./presentation-sessions.service";

const activeSessionRow = {
  session_id: "session_existing",
  project_id: "project_1",
  deck_id: "deck_1",
  presenter_user_id: "user_1",
  join_code: "123456",
  status: "draft" as const,
  entry_status: "open" as const,
  audience_slide_render_mode: "image-first" as const,
  created_at: "2026-07-05T00:00:00.000Z",
  started_at: null,
  ended_at: null,
  survey_closes_at: null,
  raw_data_delete_after: "2026-08-04T00:00:00.000Z",
};

describe("PresentationSessionsService", () => {
  it("creates a draft session with a 6-digit join code and no passcode", async () => {
    const query = vi
      .fn()
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ ...activeSessionRow, join_code: "654321" }])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);

    const service = new PresentationSessionsService({
      query,
    } as unknown as DataSource);

    await expect(
      service.create("project_1", "user_1", {
        deckId: "deck_1",
      }),
    ).resolves.toMatchObject({
      session: {
        sessionId: "session_existing",
        projectId: "project_1",
        deckId: "deck_1",
        presenterUserId: "user_1",
        joinCode: "654321",
        status: "draft",
        entryStatus: "open",
      },
      audienceUrl: "/join/654321",
    });

    const insertSql = query.mock.calls[1][0] as string;
    expect(insertSql).toContain("join_code");
    expect(insertSql).not.toContain("passcode");
    expect(insertSql).not.toContain("session_password_hash");
  });

  it("returns the existing active session when concurrent creation hits the unique index", async () => {
    const query = vi
      .fn()
      .mockResolvedValueOnce([])
      .mockRejectedValueOnce(
        Object.assign(new Error("duplicate active session"), { code: "23505" }),
      )
      .mockResolvedValueOnce([activeSessionRow]);

    const service = new PresentationSessionsService({
      query,
    } as unknown as DataSource);

    await expect(
      service.create("project_1", "user_1", {
        deckId: "deck_1",
      }),
    ).resolves.toMatchObject({
      session: {
        sessionId: "session_existing",
        projectId: "project_1",
        joinCode: "123456",
        status: "draft",
      },
      audienceUrl: "/join/123456",
    });

    expect(query).toHaveBeenCalledTimes(3);
  });
});
