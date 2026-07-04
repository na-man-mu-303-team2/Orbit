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
});
