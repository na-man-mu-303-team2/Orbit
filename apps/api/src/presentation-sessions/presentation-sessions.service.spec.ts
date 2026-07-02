import { describe, expect, it, vi } from "vitest";
import type { DataSource } from "typeorm";

import { PresentationSessionsService } from "./presentation-sessions.service";

const openSessionRow = {
  session_id: "session_existing",
  project_id: "project_1",
  status: "open" as const,
  created_at: "2026-07-02T00:00:00.000Z",
  expires_at: "2026-07-02T02:00:00.000Z"
};

describe("PresentationSessionsService", () => {
  it("returns the existing open session when concurrent creation hits the unique index", async () => {
    const query = vi
      .fn()
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockRejectedValueOnce(Object.assign(new Error("duplicate open session"), { code: "23505" }))
      .mockResolvedValueOnce([openSessionRow]);

    const service = new PresentationSessionsService({ query } as unknown as DataSource);

    await expect(
      service.create("project_1", {
        passcode: "1234",
        expiresInHours: 2
      })
    ).resolves.toMatchObject({
      session: {
        sessionId: "session_existing",
        projectId: "project_1",
        status: "open"
      },
      audienceUrl: "/audience/session_existing"
    });

    expect(query).toHaveBeenCalledTimes(4);
  });
});
