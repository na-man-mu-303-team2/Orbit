import { afterEach, describe, expect, it, vi } from "vitest";

import { activityApi, ActivityApiError } from "./activityApi";

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

  it("loads the active activity from the audience session boundary", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ activity: null }), {
        status: 200,
        headers: { "Content-Type": "application/json" }
      })
    );
    vi.stubGlobal("fetch", fetchMock);

    await activityApi.getAudienceActiveActivity("session_1");

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/v1/audience-sessions/session_1/active-activity",
      expect.objectContaining({ credentials: "include" })
    );
  });

  it("preserves Activity conflict codes for editor recovery", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            code: "ACTIVITY_DEFINITION_LOCKED",
            message: "Activity definition cannot change after the first response"
          }),
          { status: 409, headers: { "Content-Type": "application/json" } }
        )
      )
    );

    const error = await activityApi
      .ensureRun("project_1", "session_1", "activity_1")
      .catch((cause: unknown) => cause);

    expect(error).toBeInstanceOf(ActivityApiError);
    expect(error).toMatchObject({
      code: "ACTIVITY_DEFINITION_LOCKED",
      status: 409
    });
  });
});
