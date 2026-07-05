import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { AudienceEntrance, AudienceLiveShell } from "./AudienceEntrance";

const participant = {
  audienceId: "audience_00000000-0000-4000-8000-000000000001",
  sessionId: "session_1",
  nickname: "orbit",
  joinedAt: "2026-07-05T00:00:00.000Z",
  lastSeenAt: "2026-07-05T00:00:00.000Z",
  joinedBeforeEnd: true,
};

const disabledFeatures = {
  sessionId: "session_1",
  qnaEnabled: false,
  aiQnaEnabled: false,
  pollsEnabled: false,
  quizzesEnabled: false,
  reactionsEnabled: false,
  surveyEnabled: false,
  updatedAt: "2026-07-05T00:00:00.000Z",
};

describe("AudienceEntrance", () => {
  it("renders the public join code form with accessible labels", () => {
    const html = renderToStaticMarkup(<AudienceEntrance />);

    expect(html).toContain("청중 입장");
    expect(html).toContain("입장 코드");
    expect(html).toContain("6자리 숫자");
    expect(html).toContain('id="audience-join-code"');
  });

  it("renders current slide recovery state with assistive status text", () => {
    const html = renderToStaticMarkup(
      <AudienceLiveShell
        activeInteraction={null}
        connectionStatus="connected"
        features={disabledFeatures}
        participant={participant}
        state={{
          sessionId: "session_1",
          slideId: "slide_1",
          slideIndex: 0,
          effectState: {
            slideSnapshotUrl: "https://cdn.example.test/slide_1.png",
          },
          activeInteractionId: null,
          updatedAt: "2026-07-05T00:00:00.000Z",
        }}
      />,
    );

    expect(html).toContain("현재 슬라이드 1");
    expect(html).toContain("실시간 연결됨");
    expect(html).toContain("https://cdn.example.test/slide_1.png");
    expect(html).toContain("orbit");
  });

  it("renders a readable fallback when the slide image snapshot is missing", () => {
    const html = renderToStaticMarkup(
      <AudienceLiveShell
        activeInteraction={null}
        connectionStatus="reconnecting"
        features={disabledFeatures}
        participant={participant}
        state={{
          sessionId: "session_1",
          slideId: "slide_1",
          slideIndex: 0,
          effectState: {},
          activeInteractionId: null,
          updatedAt: "2026-07-05T00:00:00.000Z",
        }}
      />,
    );

    expect(html).toContain("슬라이드 준비 중");
    expect(html).toContain("연결을 다시 시도하고 있습니다.");
    expect(html).toContain('role="img"');
    expect(html).not.toContain("질문 보내기");
  });

  it("renders only enabled audience feature cards", () => {
    const html = renderToStaticMarkup(
      <AudienceLiveShell
        activeInteraction={null}
        connectionStatus="connected"
        features={{
          ...disabledFeatures,
          qnaEnabled: true,
          pollsEnabled: true,
        }}
        participant={participant}
        state={null}
      />,
    );

    expect(html).toContain("질문 보내기");
    expect(html).toContain("대기 중");
    expect(html).not.toContain("설문 작성");
  });

  it("renders an active poll response form", () => {
    const html = renderToStaticMarkup(
      <AudienceLiveShell
        activeInteraction={{
          interactionId: "interaction_00000000-0000-4000-8000-000000000001",
          sessionId: "session_1",
          kind: "poll",
          title: "만족도",
          questions: [
            {
              type: "scale",
              questionId: "question_00000000-0000-4000-8000-000000000001",
              prompt: "만족도를 골라 주세요.",
              required: true,
              min: 1,
              max: 5,
            },
          ],
          resultVisibility: "live",
          quizScoring: "none",
          source: "ad-hoc",
          order: 0,
          exposedResultQuestionIds: [],
          activatedAt: "2026-07-05T00:00:00.000Z",
          closedAt: null,
        }}
        connectionStatus="connected"
        features={{
          ...disabledFeatures,
          pollsEnabled: true,
        }}
        participant={participant}
        state={null}
      />,
    );

    expect(html).toContain("만족도를 골라 주세요.");
    expect(html).toContain("응답 제출");
    expect(html).toContain('type="number"');
  });

  it("renders enabled reaction controls with accessible names", () => {
    const html = renderToStaticMarkup(
      <AudienceLiveShell
        activeInteraction={null}
        connectionStatus="connected"
        features={{
          ...disabledFeatures,
          reactionsEnabled: true,
        }}
        participant={participant}
        recentReactions={["clap", "heart"]}
        state={null}
      />,
    );

    expect(html).toContain("Reactions");
    expect(html).toContain('aria-label="박수 반응 보내기"');
    expect(html).toContain('aria-label="최근 반응"');
    expect(html).toContain("👏");
    expect(html).toContain("❤");
  });

  it("renders an ended-session survey with contact consent warning", () => {
    const html = renderToStaticMarkup(
      <AudienceLiveShell
        activeInteraction={null}
        connectionStatus="connected"
        features={{
          ...disabledFeatures,
          surveyEnabled: true,
        }}
        participant={participant}
        state={null}
        survey={{
          surveyId: "survey_00000000-0000-4000-8000-000000000001",
          sessionId: "session_1",
          title: "발표 설문",
          questions: [
            {
              type: "scale",
              questionId: "question_00000000-0000-4000-8000-000000000001",
              prompt: "발표 만족도",
              required: true,
              min: 1,
              max: 5,
            },
          ],
          contact: {
            enabled: true,
            consentText: "후속 연락에 동의합니다.",
            fields: [],
          },
          lockedAt: null,
        }}
      />,
    );

    expect(html).toContain("발표 설문");
    expect(html).toContain("발표 만족도");
    expect(html).toContain("후속 연락에 동의합니다.");
    expect(html).toContain("민감정보 또는 고유식별정보");
    expect(html).toContain("설문 제출");
  });

  it("renders active participation surfaces with labels and without presenter-only fields", () => {
    const html = renderToStaticMarkup(
      <AudienceLiveShell
        activeInteraction={{
          interactionId: "interaction_00000000-0000-4000-8000-000000000101",
          sessionId: "session_1",
          kind: "quiz",
          title: "이해도 확인",
          questions: [
            {
              type: "quiz-true-false",
              questionId: "question_00000000-0000-4000-8000-000000000101",
              prompt: "청중은 로그인 없이 참여한다.",
              correctAnswer: true,
            },
          ],
          resultVisibility: "after-close",
          quizScoring: "correct-count",
          source: "ad-hoc",
          order: 0,
          exposedResultQuestionIds: [],
          activatedAt: "2026-07-05T00:00:00.000Z",
          closedAt: null,
        }}
        connectionStatus="connected"
        features={{
          ...disabledFeatures,
          qnaEnabled: true,
          aiQnaEnabled: true,
          quizzesEnabled: true,
          reactionsEnabled: true,
        }}
        participant={participant}
        recentReactions={["wow"]}
        state={{
          sessionId: "session_1",
          slideId: "slide_1",
          slideIndex: 1,
          effectState: {
            slideSnapshotUrl: "https://cdn.example.test/audience-safe.png",
          },
          activeInteractionId:
            "interaction_00000000-0000-4000-8000-000000000101",
          updatedAt: "2026-07-05T00:00:00.000Z",
        }}
      />,
    );

    expect(html).toContain('aria-labelledby="audience-current-slide-title"');
    expect(html).toContain("현재 슬라이드 2");
    expect(html).toContain("질문");
    expect(html).toContain("질문 보내기");
    expect(html).toContain("청중은 로그인 없이 참여한다.");
    expect(html).toContain("퀴즈 제출");
    expect(html).toContain('aria-label="반응 보내기"');
    expect(html).toContain('aria-label="놀람 반응 보내기"');
    expect(html).not.toContain("speakerNotes");
    expect(html).not.toContain("rawTranscript");
    expect(html).not.toContain("rawAudio");
    expect(html).not.toContain("presenterScript");
    expect(html).not.toContain("fileBase64");
  });

  it("renders quiz answer reveal after the interaction closes", () => {
    const html = renderToStaticMarkup(
      <AudienceLiveShell
        activeInteraction={{
          interactionId: "interaction_00000000-0000-4000-8000-000000000301",
          sessionId: "session_1",
          kind: "quiz",
          title: "이해도 확인",
          questions: [
            {
              type: "quiz-true-false",
              questionId: "question_00000000-0000-4000-8000-000000000301",
              prompt: "청중은 로그인 없이 참여한다.",
              correctAnswer: true,
            },
          ],
          resultVisibility: "after-close",
          quizScoring: "correct-count",
          source: "ad-hoc",
          order: 0,
          exposedResultQuestionIds: [],
          activatedAt: "2026-07-05T00:00:00.000Z",
          closedAt: "2026-07-05T00:02:00.000Z",
        }}
        connectionStatus="connected"
        features={{
          ...disabledFeatures,
          quizzesEnabled: true,
        }}
        participant={participant}
        quizReveal={[
          {
            questionId: "question_00000000-0000-4000-8000-000000000301",
            correctAnswer: { type: "quiz-true-false", answer: true },
            submittedAnswer: { type: "quiz-true-false", answer: false },
            isCorrect: false,
            score: 0,
          },
        ]}
        state={null}
      />,
    );

    expect(html).toContain("퀴즈 결과가 공개되었습니다.");
    expect(html).toContain("청중은 로그인 없이 참여한다.");
    expect(html).toContain("내 답");
    expect(html).toContain("거짓");
    expect(html).toContain("정답");
    expect(html).toContain("참");
    expect(html).toContain("오답입니다.");
    expect(html).not.toContain("퀴즈 제출");
  });

  it("renders every question in a multi-question interaction", () => {
    const html = renderToStaticMarkup(
      <AudienceLiveShell
        activeInteraction={{
          interactionId: "interaction_00000000-0000-4000-8000-000000000201",
          sessionId: "session_1",
          kind: "poll",
          title: "복합 투표",
          questions: [
            {
              type: "choice",
              questionId: "question_00000000-0000-4000-8000-000000000201",
              prompt: "관심 주제를 모두 골라 주세요.",
              required: true,
              allowMultiple: true,
              options: [
                { optionId: "product", label: "제품" },
                { optionId: "market", label: "시장" },
              ],
            },
            {
              type: "open-text",
              questionId: "question_00000000-0000-4000-8000-000000000202",
              prompt: "추가 의견",
              required: false,
              maxLength: 500,
            },
          ],
          resultVisibility: "manual",
          quizScoring: "none",
          exposedResultQuestionIds: [],
          source: "ad-hoc",
          order: 0,
          activatedAt: "2026-07-05T00:00:00.000Z",
          closedAt: null,
        }}
        connectionStatus="connected"
        features={{
          ...disabledFeatures,
          pollsEnabled: true,
        }}
        participant={participant}
        state={null}
      />,
    );

    expect(html).toContain("관심 주제를 모두 골라 주세요.");
    expect(html).toContain("추가 의견");
    expect(html).toContain('type="checkbox"');
    expect(html).toContain("응답 제출");
  });
});
