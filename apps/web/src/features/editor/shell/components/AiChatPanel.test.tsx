import { createDemoDeck } from "@orbit/editor-core";
import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { AiChatPanel } from "./AiChatPanel";

describe("AiChatPanel", () => {
  it("renders the history and message composer", () => {
    const deck = createDemoDeck();
    const html = renderToString(
      <AiChatPanel
        projectId={deck.projectId}
        deck={deck}
        currentSlide={deck.slides[0] ?? null}
        selectedElementIds={[]}
      />
    );

    expect(html).toContain('aria-label="AI 채팅"');
    expect(html).toContain("현재 슬라이드에서 바꾸고 싶은 디자인");
    expect(html).toContain('placeholder="바꾸고 싶은 디자인을 말씀해 주세요"');
    expect(html).toContain('aria-label="메시지 보내기"');
  });
});
