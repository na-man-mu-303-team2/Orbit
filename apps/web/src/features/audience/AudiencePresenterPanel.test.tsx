import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import {
  AudiencePresenterControlPage,
  AudiencePresenterResultsSummary,
  saveAudienceFeatureToggle,
} from "./AudiencePresenterPanel";

describe("AudiencePresenterPanel", () => {
  it("renders the presenter control/results route shell accessibly", () => {
    const html = renderToStaticMarkup(
      <AudiencePresenterControlPage
        projectId="project_1"
        sessionId="session_1"
      />,
    );

    expect(html).toContain("청중 제어");
    expect(html).toContain("활성 청중 세션 없음");
    expect(html).toContain(
      'aria-labelledby="audience-presenter-control-title"',
    );
  });

  it("renders a safe message for canonical audience routes without project context", () => {
    const html = renderToStaticMarkup(
      <AudiencePresenterControlPage
        sessionId="session_1"
        variant="missing-project"
      />,
    );

    expect(html).toContain("청중 제어");
    expect(html).toContain("프로젝트 정보를 포함한 상세 제어 링크");
  });

  it("renders aggregate result summaries as text", () => {
    const html = renderToStaticMarkup(
      <AudiencePresenterResultsSummary
        results={{
          report: {
            reportId: "audience_report_00000000-0000-4000-8000-000000000001",
            sessionId: "session_1",
            status: "preliminary",
            aggregate: {
              qna: { total: 2, unanswered: 1 },
              reactions: { clap: 3 },
              interactions: [{ title: "만족도", responseCount: 4 }],
              survey: { responseCount: 1 },
            },
            generatedAt: "2026-07-05T00:00:00.000Z",
            rawDataDeletedAt: null,
          },
          surveyResponses: [
            {
              responseId:
                "survey_response_00000000-0000-4000-8000-000000000001",
              surveyId: "survey_00000000-0000-4000-8000-000000000001",
              sessionId: "session_1",
              audienceId: "audience_00000000-0000-4000-8000-000000000001",
              submittedAt: "2026-07-05T00:00:00.000Z",
              answers: {},
              contactConsent: false,
              contactAnswers: {},
            },
          ],
        }}
      />,
    );

    expect(html).toContain("Q&amp;A 2개");
    expect(html).toContain("반응 3개");
    expect(html).toContain("설문 응답 1개");
    expect(html).toContain("개별 응답 1개");
  });

  it("commits feature toggles from the durable REST response", async () => {
    const saveFeatureSettings = vi.fn(async () => ({
      features: {
        sessionId: "session_1",
        qnaEnabled: true,
        aiQnaEnabled: true,
        pollsEnabled: false,
        quizzesEnabled: false,
        reactionsEnabled: false,
        surveyEnabled: false,
        updatedAt: "2026-07-05T00:05:00.000Z",
      },
    }));

    await expect(
      saveAudienceFeatureToggle({
        enabled: true,
        key: "aiQnaEnabled",
        projectId: "project_1",
        sessionId: "session_1",
        saveFeatureSettings,
      }),
    ).resolves.toMatchObject({
      aiQnaEnabled: true,
      qnaEnabled: true,
      updatedAt: "2026-07-05T00:05:00.000Z",
    });

    expect(saveFeatureSettings).toHaveBeenCalledWith({
      projectId: "project_1",
      sessionId: "session_1",
      settings: { aiQnaEnabled: true, qnaEnabled: true },
    });
  });

  it("does not produce an optimistic feature state when durable save fails", async () => {
    const saveFeatureSettings = vi.fn(async () => {
      throw new Error("REST persistence failed");
    });

    await expect(
      saveAudienceFeatureToggle({
        enabled: true,
        key: "pollsEnabled",
        projectId: "project_1",
        sessionId: "session_1",
        saveFeatureSettings,
      }),
    ).rejects.toThrow("REST persistence failed");

    expect(saveFeatureSettings).toHaveBeenCalledWith({
      projectId: "project_1",
      sessionId: "session_1",
      settings: { pollsEnabled: true },
    });
  });
});
