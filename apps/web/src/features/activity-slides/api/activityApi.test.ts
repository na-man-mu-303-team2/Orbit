import { afterEach, describe, expect, it, vi } from "vitest";

import { activityApi } from "./activityApi";

afterEach(() => vi.unstubAllGlobals());

describe("activityApi", () => {
  it("uses the canonical audience route and includes signed cookies", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          verified: true,
          session: {
            sessionId: "session_1",
            projectId: "project_1",
            deckId: "deck_1",
            accessMode: "public",
            startsAt: "2026-07-17T00:00:00.000Z",
            expiresAt: "2026-07-31T00:00:00.000Z",
            activeActivityRunId: null
          }
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      )
    );
    vi.stubGlobal("fetch", fetchMock);

    await activityApi.joinAudience("session_1", {});

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/v1/audience-sessions/session_1/join",
      expect.objectContaining({
        credentials: "include",
        method: "POST",
        headers: { "Content-Type": "application/json" }
      })
    );
  });
});
