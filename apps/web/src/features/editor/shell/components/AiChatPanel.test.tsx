import { createDemoDeck } from "@orbit/editor-core";
import { renderToString } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import {
  AiChatPanel,
  createInitialAiChatState,
  resolveDesignAgentProposalApplyCapability,
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

  it("preflights an unsupported imported-deck proposal before apply", () => {
    const deck = createDemoDeck();
    deck.metadata.sourceType = "import";
    deck.slides[0]!.ooxmlOrigin = "imported";
    deck.slides[0]!.ooxmlMotionCapabilities = {
      importedMainSequenceCoverage: "absent",
      transitionWritable: false
    };

    expect(
      resolveDesignAgentProposalApplyCapability(deck, {
        proposalId: "proposal_1",
        projectId: deck.projectId,
        deckId: deck.deckId,
        slideId: deck.slides[0]!.slideId,
        requestMessageId: "message_1",
        baseVersion: deck.version,
        title: "배경 변경",
        operations: [
          {
            type: "update_slide_style",
            slideId: deck.slides[0]!.slideId,
            style: { backgroundColor: "#000000" }
          }
        ],
        affectedElementIds: [],
        warnings: [],
        status: "pending",
        createdAt: "2026-07-17T00:00:00.000Z",
        updatedAt: "2026-07-17T00:00:00.000Z"
      })
    ).toMatchObject({ enabled: false });
  });
});
