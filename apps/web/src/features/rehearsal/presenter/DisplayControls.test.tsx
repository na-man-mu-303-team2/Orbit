import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  DisplayControls,
  getDisplayControlMessage,
  getDisplayStatusLabel,
  shouldShowRecoverAction
} from "./DisplayControls";

describe("DisplayControls", () => {
  it("renders Korean controls without presenter-only content", () => {
    const html = renderToStaticMarkup(
      <DisplayControls
        channelStatus="idle"
        deckId="deck_p0_animation"
        onPublishSnapshot={() => {}}
        sessionId="session-presenter-1"
      />
    );

    expect(html).toContain("슬라이드 창 열기");
    expect(html).toContain("대기");
    expect(html).not.toContain("speakerNotes");
    expect(html).not.toContain("Partial transcript");
  });

  it("uses a recover action for stale, closed, or failed channel states", () => {
    expect(shouldShowRecoverAction("stale")).toBe(true);
    expect(shouldShowRecoverAction("closed")).toBe(true);
    expect(shouldShowRecoverAction("failed")).toBe(true);
    expect(shouldShowRecoverAction("connected")).toBe(false);
  });

  it("maps display manager error codes to Korean guidance", () => {
    expect(getDisplayControlMessage("popup-blocked")).toContain("팝업");
    expect(getDisplayControlMessage("permission-denied")).toContain("권한");
    expect(getDisplayControlMessage("window-management-unsupported")).toContain(
      "자동 화면 배치"
    );
    expect(getDisplayControlMessage("fullscreen-blocked")).toContain("전체화면");
    expect(getDisplayControlMessage("placement-failed")).toContain("자동 배치");
  });

  it("prioritizes actionable status labels", () => {
    expect(getDisplayStatusLabel("connected", "idle")).toBe("슬라이드 창 연결됨");
    expect(getDisplayStatusLabel("stale", "idle")).toBe("슬라이드 창 응답 없음");
    expect(getDisplayStatusLabel("idle", "screen-picker")).toBe("화면 선택 필요");
    expect(getDisplayStatusLabel("idle", "manual-guide")).toBe("수동 배치 안내");
    expect(getDisplayStatusLabel("idle", "failed")).toBe("확인 필요");
  });
});
