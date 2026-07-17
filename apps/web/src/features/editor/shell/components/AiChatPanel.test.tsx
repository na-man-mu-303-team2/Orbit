import { createActivitySlide, createDemoDeck } from "@orbit/editor-core";
import { renderToString } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import {
  AiChatPanel,
  createInitialAiChatState,
  type AiChatState
} from "./AiChatPanel";

vi.mock("./DesignProposalPreviewModal", () => ({
  DesignProposalPreviewModal: () => null
}));

describe("AiChatPanel", () => {
  it("renders the history and message composer", () => {
    const deck = createDemoDeck();
    const html = renderToString(
      <AiChatPanel
        onSpeakerNotesAssistantRequest={() => undefined}
        projectId={deck.projectId}
        deck={deck}
        currentSlide={deck.slides[0] ?? null}
        selectedElementIds={[]}
        chatState={createInitialAiChatState(deck.projectId)}
        onChatStateChange={() => undefined}
        onProposalApplied={() => undefined}
      />
    );

    expect(html).toContain('aria-label="AI 채팅"');
    expect(html).toContain("현재 슬라이드에서 바꾸고 싶은 디자인");
    expect(html).toContain('placeholder="바꾸고 싶은 디자인을 말씀해 주세요"');
    expect(html).toContain('aria-label="메시지 보내기"');
    expect(html).toContain("<textarea");
  });

  it("renders editor-owned history again after the panel remounts", () => {
    const deck = createDemoDeck();
    const chatState: AiChatState = {
      messages: [
        ...createInitialAiChatState(deck.projectId).messages,
        {
          id: "user-persisted",
          role: "user",
          content: "이 채팅 기록은 패널을 다시 열어도 유지됩니다."
        }
      ],
      projectId: deck.projectId,
      sessionId: "session-persisted"
    };
    const renderPanel = () =>
      renderToString(
        <AiChatPanel
          onSpeakerNotesAssistantRequest={() => undefined}
          projectId={deck.projectId}
          deck={deck}
          currentSlide={deck.slides[0] ?? null}
          selectedElementIds={[]}
          chatState={chatState}
          onChatStateChange={() => undefined}
          onProposalApplied={() => undefined}
        />
      );

    expect(renderPanel()).toContain("이 채팅 기록은 패널을 다시 열어도 유지됩니다.");
    expect(renderPanel()).toContain("이 채팅 기록은 패널을 다시 열어도 유지됩니다.");
  });

  it("disables design requests for a special slide", () => {
    const deck = createDemoDeck();
    const slide = createActivitySlide(deck, "poll");
    const html = renderToString(
      <AiChatPanel
        onSpeakerNotesAssistantRequest={() => undefined}
        projectId={deck.projectId}
        deck={{ ...deck, slides: [...deck.slides, slide] }}
        currentSlide={slide}
        designEditingEnabled={false}
        selectedElementIds={[]}
        chatState={createInitialAiChatState(deck.projectId)}
        onChatStateChange={() => undefined}
        onProposalApplied={() => undefined}
      />
    );

    expect(html).toContain("특수 장표는 AI 디자인 대신 장표 설정에서 관리합니다");
    expect(html).toContain('placeholder="장표 설정에서 내용을 관리해 주세요"');
    expect(html).toContain('aria-label="AI에게 메시지 보내기"');
    expect(html).toContain("disabled");
  });
});
