import { afterEach, describe, expect, it, vi } from "vitest";

import {
  fetchAudienceFeatureSettings,
  fetchSessionResults,
  fetchSessionSurveyForm,
  sessionSurveyCsvUrl,
  updateAudienceAccessEntryStatus,
  updateAudienceFeatureSettings,
  upsertSessionSurveyForm,
} from "./audienceLinkApi";

const features = {
  sessionId: "session_1",
  qnaEnabled: false,
  aiQnaEnabled: false,
  pollsEnabled: true,
  quizzesEnabled: false,
  reactionsEnabled: false,
  surveyEnabled: false,
  updatedAt: "2026-07-05T00:00:00.000Z",
};

describe("audience link API", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("fetches presenter feature settings", async () => {
    const fetcher = vi.fn(
      async () => new Response(JSON.stringify({ features })),
    );
    vi.stubGlobal("fetch", fetcher);

    await expect(
      fetchAudienceFeatureSettings({
        projectId: "project_1",
        sessionId: "session_1",
      }),
    ).resolves.toEqual({ features });

    expect(fetcher).toHaveBeenCalledWith(
      "/api/v1/projects/project_1/presentation-sessions/session_1/features",
      expect.objectContaining({ credentials: "include", method: "GET" }),
    );
  });

  it("updates presenter feature settings without audience tokens in the body", async () => {
    const fetcher = vi.fn(
      async (_input: RequestInfo | URL, init?: RequestInit) => {
        expect(JSON.parse(String(init?.body))).toEqual({ pollsEnabled: true });
        return new Response(JSON.stringify({ features }));
      },
    );
    vi.stubGlobal("fetch", fetcher);

    await expect(
      updateAudienceFeatureSettings({
        projectId: "project_1",
        sessionId: "session_1",
        settings: { pollsEnabled: true },
      }),
    ).resolves.toEqual({ features });

    expect(fetcher).toHaveBeenCalledWith(
      "/api/v1/projects/project_1/presentation-sessions/session_1/features",
      expect.objectContaining({ credentials: "include", method: "PATCH" }),
    );
  });

  it("updates audience entry status through the presenter endpoint", async () => {
    const fetcher = vi.fn(
      async (_input: RequestInfo | URL, init?: RequestInit) => {
        expect(JSON.parse(String(init?.body))).toEqual({
          entryStatus: "open",
        });
        return new Response(
          JSON.stringify({
            session: {
              sessionId: "session_1",
              projectId: "project_1",
              deckId: "deck_1",
              presenterUserId: "user_1",
              joinCode: "123456",
              status: "live",
              entryStatus: "open",
              audienceSlideRenderMode: "image-first",
              createdAt: "2026-07-05T00:00:00.000Z",
              startedAt: null,
              endedAt: null,
              surveyClosesAt: null,
              rawDataDeleteAfter: "2026-08-04T00:00:00.000Z",
            },
          }),
        );
      },
    );
    vi.stubGlobal("fetch", fetcher);

    await expect(
      updateAudienceAccessEntryStatus({
        entryStatus: "open",
        projectId: "project_1",
        sessionId: "session_1",
      }),
    ).resolves.toMatchObject({ entryStatus: "open" });
  });

  it("fetches and upserts presenter survey forms", async () => {
    const survey = {
      surveyId: "survey_00000000-0000-4000-8000-000000000001",
      sessionId: "session_1",
      title: "발표 설문",
      questions: [],
      contact: {
        enabled: false,
        consentText: "동의",
        fields: [],
      },
      lockedAt: null,
    };
    const fetcher = vi.fn(
      async (_input: RequestInfo | URL, init?: RequestInit) => {
        if (init?.method === "PUT") {
          expect(JSON.parse(String(init.body))).toEqual({
            title: "발표 설문",
            questions: [],
            contact: {
              enabled: false,
              consentText: "동의",
              fields: [],
            },
          });
        }
        return new Response(JSON.stringify({ survey }));
      },
    );
    vi.stubGlobal("fetch", fetcher);

    await expect(
      fetchSessionSurveyForm({
        projectId: "project_1",
        sessionId: "session_1",
      }),
    ).resolves.toEqual({ survey });
    await expect(
      upsertSessionSurveyForm({
        projectId: "project_1",
        sessionId: "session_1",
        form: {
          title: "발표 설문",
          questions: [],
          contact: {
            enabled: false,
            consentText: "동의",
            fields: [],
          },
        },
      }),
    ).resolves.toEqual({ survey });
    expect(
      sessionSurveyCsvUrl({ projectId: "project_1", sessionId: "session_1" }),
    ).toBe(
      "/api/v1/projects/project_1/presentation-sessions/session_1/survey.csv",
    );
  });

  it("fetches presenter audience results", async () => {
    const fetcher = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            report: {
              reportId: "audience_report_00000000-0000-4000-8000-000000000001",
              sessionId: "session_1",
              status: "preliminary",
              aggregate: { qna: { total: 1, unanswered: 1 } },
              generatedAt: "2026-07-05T00:00:00.000Z",
              rawDataDeletedAt: null,
            },
            surveyResponses: [],
          }),
        ),
    );
    vi.stubGlobal("fetch", fetcher);

    await expect(
      fetchSessionResults({ projectId: "project_1", sessionId: "session_1" }),
    ).resolves.toMatchObject({ report: { status: "preliminary" } });
    expect(fetcher).toHaveBeenCalledWith(
      "/api/v1/projects/project_1/presentation-sessions/session_1/results",
      expect.objectContaining({ credentials: "include", method: "GET" }),
    );
  });
});
