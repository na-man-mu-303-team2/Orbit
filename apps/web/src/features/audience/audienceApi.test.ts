import { afterEach, describe, expect, it, vi } from "vitest";
import {
  fetchAudienceMe,
  fetchAudienceState,
  joinAudienceSession,
  lookupAudienceSession,
} from "./audienceApi";

describe("audience API", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("looks up sessions by join code", async () => {
    const fetcher = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            session: {
              sessionId: "session_1",
              projectId: "project_1",
              joinCode: "123456",
              status: "draft",
              entryStatus: "open",
            },
          }),
        ),
    );
    vi.stubGlobal("fetch", fetcher);

    await expect(lookupAudienceSession("123456")).resolves.toMatchObject({
      session: { joinCode: "123456" },
    });
    expect(fetcher).toHaveBeenCalledWith(
      "/api/v1/presentation-sessions/join/123456",
      expect.objectContaining({ method: "GET", credentials: "include" }),
    );
  });

  it("posts nickname joins without exposing tokens in the body", async () => {
    const fetcher = vi.fn(
      async (_input: RequestInfo | URL, init?: RequestInit) => {
        expect(JSON.parse(String(init?.body))).toEqual({ nickname: "orbit" });
        return new Response(
          JSON.stringify({
            session: {
              sessionId: "session_1",
              projectId: "project_1",
              joinCode: "123456",
              status: "draft",
              entryStatus: "open",
            },
            participant: {
              audienceId: "audience_00000000-0000-4000-8000-000000000001",
              sessionId: "session_1",
              nickname: "orbit",
              joinedAt: "2026-07-05T00:00:00.000Z",
              lastSeenAt: "2026-07-05T00:00:00.000Z",
              joinedBeforeEnd: true,
            },
          }),
        );
      },
    );
    vi.stubGlobal("fetch", fetcher);

    await expect(
      joinAudienceSession({ joinCode: "123456", nickname: "orbit" }),
    ).resolves.toMatchObject({
      participant: { nickname: "orbit" },
    });
    expect(fetcher).toHaveBeenCalledWith(
      "/api/v1/presentation-sessions/join/123456",
      expect.objectContaining({ method: "POST", credentials: "include" }),
    );
  });

  it("restores the current audience participant by session id", async () => {
    const fetcher = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            session: {
              sessionId: "session_1",
              projectId: "project_1",
              joinCode: "123456",
              status: "draft",
              entryStatus: "open",
            },
            participant: {
              audienceId: "audience_00000000-0000-4000-8000-000000000001",
              sessionId: "session_1",
              nickname: "orbit",
              joinedAt: "2026-07-05T00:00:00.000Z",
              lastSeenAt: "2026-07-05T00:00:00.000Z",
              joinedBeforeEnd: true,
            },
          }),
        ),
    );
    vi.stubGlobal("fetch", fetcher);

    await expect(
      fetchAudienceMe({ sessionId: "session_1" }),
    ).resolves.toMatchObject({
      participant: { nickname: "orbit" },
    });
    expect(fetcher).toHaveBeenCalledWith(
      "/api/v1/presentation-sessions/session_1/audience/me",
      expect.objectContaining({ method: "GET", credentials: "include" }),
    );
  });

  it("fetches audience realtime state recovery by session id", async () => {
    const fetcher = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            session: {
              sessionId: "session_1",
              projectId: "project_1",
              joinCode: "123456",
              status: "live",
              entryStatus: "open",
            },
            participant: {
              audienceId: "audience_00000000-0000-4000-8000-000000000001",
              sessionId: "session_1",
              nickname: "orbit",
              joinedAt: "2026-07-05T00:00:00.000Z",
              lastSeenAt: "2026-07-05T00:00:00.000Z",
              joinedBeforeEnd: true,
            },
            state: {
              sessionId: "session_1",
              slideId: "slide_1",
              slideIndex: 0,
              effectState: { stepIndex: 1 },
              activeInteractionId: null,
              updatedAt: "2026-07-05T00:00:00.000Z",
            },
            features: {
              sessionId: "session_1",
              qnaEnabled: false,
              aiQnaEnabled: false,
              pollsEnabled: false,
              quizzesEnabled: false,
              reactionsEnabled: false,
              surveyEnabled: false,
              updatedAt: "2026-07-05T00:00:00.000Z",
            },
          }),
        ),
    );
    vi.stubGlobal("fetch", fetcher);

    await expect(
      fetchAudienceState({ sessionId: "session_1" }),
    ).resolves.toMatchObject({
      state: { slideId: "slide_1", effectState: { stepIndex: 1 } },
    });
    expect(fetcher).toHaveBeenCalledWith(
      "/api/v1/presentation-sessions/session_1/audience/state",
      expect.objectContaining({ method: "GET", credentials: "include" }),
    );
  });

  it("maps duplicate nickname responses to Korean copy", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("{}", { status: 409 })),
    );

    await expect(
      joinAudienceSession({ joinCode: "123456", nickname: "orbit" }),
    ).rejects.toThrow("이미 사용 중인 닉네임입니다.");
  });
});
