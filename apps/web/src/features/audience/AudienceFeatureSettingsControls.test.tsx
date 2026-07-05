import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import {
  applyAudienceFeaturePatch,
  AudienceFeatureSettingsControls,
  PreparedInteractionLibrarySelector,
  AudienceSessionSetupSummary,
  normalizeAudienceFeaturePatch,
} from "./AudienceFeatureSettingsControls";

const features = {
  sessionId: "session_1",
  qnaEnabled: false,
  aiQnaEnabled: false,
  pollsEnabled: false,
  quizzesEnabled: false,
  reactionsEnabled: false,
  surveyEnabled: false,
  updatedAt: "2026-07-05T00:00:00.000Z",
};

describe("AudienceFeatureSettingsControls", () => {
  it("renders accessible feature toggles", () => {
    const html = renderToStaticMarkup(
      <AudienceFeatureSettingsControls
        features={features}
        onToggle={() => undefined}
      />,
    );

    expect(html).toContain('aria-label="Q&amp;A 켜기"');
    expect(html).toContain('aria-label="Poll 켜기"');
    expect(html).toContain('type="checkbox"');
  });

  it("keeps AI Q&A and Q&A dependencies in feature patches", () => {
    expect(normalizeAudienceFeaturePatch("aiQnaEnabled", true)).toEqual({
      aiQnaEnabled: true,
      qnaEnabled: true,
    });
    expect(normalizeAudienceFeaturePatch("qnaEnabled", false)).toEqual({
      aiQnaEnabled: false,
      qnaEnabled: false,
    });

    expect(
      applyAudienceFeaturePatch(features, {
        aiQnaEnabled: true,
        qnaEnabled: true,
      }),
    ).toMatchObject({
      aiQnaEnabled: true,
      qnaEnabled: true,
    });
  });

  it("renders editor setup sections for prepared interactions and references", () => {
    const html = renderToStaticMarkup(
      <AudienceSessionSetupSummary
        interactions={[
          {
            interactionId: "interaction_00000000-0000-4000-8000-000000000001",
            sessionId: "session_1",
            libraryInteractionId: null,
            kind: "poll",
            title: "만족도",
            questions: [
              {
                type: "scale",
                questionId: "question_00000000-0000-4000-8000-000000000001",
                prompt: "만족도",
                required: true,
                min: 1,
                max: 5,
              },
            ],
            resultVisibility: "manual",
            quizScoring: "none",
            exposedResultQuestionIds: [],
            source: "library",
            order: 0,
            activatedAt: null,
            closedAt: null,
          },
        ]}
        selectedReferenceCount={2}
        surveyTitle="발표 설문"
      />,
    );

    expect(html).toContain("선택된 상호작용");
    expect(html).toContain("만족도");
    expect(html).toContain("표시 순서");
    expect(html).toContain("발표 설문 · 초안");
    expect(html).toContain("AI Q&amp;A 참고자료");
    expect(html).toContain("2개 선택됨");
    expect(html).not.toContain("Poll/Quiz library 연결 대기");
  });

  it("renders prepared interaction library selection and manual ordering controls", () => {
    const html = renderToStaticMarkup(
      <PreparedInteractionLibrarySelector
        library={[
          {
            libraryInteractionId:
              "library_interaction_00000000-0000-4000-8000-000000000001",
            projectId: "project_1",
            kind: "poll",
            title: "준비된 투표",
            questions: [
              {
                type: "scale",
                questionId: "question_00000000-0000-4000-8000-000000000001",
                prompt: "만족도",
                required: true,
                min: 1,
                max: 5,
              },
            ],
            resultVisibility: "manual",
            quizScoring: "none",
            createdAt: "2026-07-05T00:00:00.000Z",
            updatedAt: "2026-07-05T00:00:00.000Z",
          },
          {
            libraryInteractionId:
              "library_interaction_00000000-0000-4000-8000-000000000002",
            projectId: "project_1",
            kind: "quiz",
            title: "준비된 퀴즈",
            questions: [
              {
                type: "quiz-true-false",
                questionId: "question_00000000-0000-4000-8000-000000000002",
                prompt: "확인 문제",
                correctAnswer: true,
                timeLimitSeconds: 30,
              },
            ],
            resultVisibility: "after-close",
            quizScoring: "speed-bonus",
            createdAt: "2026-07-05T00:00:00.000Z",
            updatedAt: "2026-07-05T00:00:00.000Z",
          },
        ]}
        selectedLibraryInteractionIds={[
          "library_interaction_00000000-0000-4000-8000-000000000002",
        ]}
        onChange={() => undefined}
      />,
    );

    expect(html).toContain("Prepared Poll/Quiz");
    expect(html).toContain("준비된 퀴즈 · Quiz · 1번");
    expect(html).toContain('aria-label="준비된 투표 선택"');
    expect(html).toContain('aria-label="준비된 퀴즈 순서 올리기"');
    expect(html).not.toContain("Poll/Quiz library 연결 대기");
  });
});
