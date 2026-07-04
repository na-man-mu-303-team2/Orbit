import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import {
  AudiencePresenterControlPage,
  AudiencePresenterResultsSummary,
} from "./AudiencePresenterPanel";

describe("AudiencePresenterPanel", () => {
  it("renders the presenter control/results route shell accessibly", () => {
    const html = renderToStaticMarkup(
      <AudiencePresenterControlPage projectId="project_1" />,
    );

    expect(html).toContain("청중 제어");
    expect(html).toContain("활성 청중 세션 없음");
    expect(html).toContain(
      'aria-labelledby="audience-presenter-control-title"',
    );
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
});
