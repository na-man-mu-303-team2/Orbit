import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { AiChatPanel } from "./AiChatPanel";

describe("AiChatPanel", () => {
  it("renders the history and message composer", () => {
    const html = renderToString(<AiChatPanel />);

    expect(html).toContain('aria-label="AI 채팅"');
    expect(html).toContain("현재 프레젠테이션을 함께 다듬어 드릴게요.");
    expect(html).toContain('placeholder="AI에게 무엇이든 물어보세요"');
    expect(html).toContain('aria-label="메시지 보내기"');
  });
});
