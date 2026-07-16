import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { AudienceOutputControls } from "./AudienceOutputControls";

describe("AudienceOutputControls", () => {
  it("renders keyboard-accessible basic sharing and black controls", () => {
    const html = renderToStaticMarkup(
      <AudienceOutputControls
        connected={true}
        error=""
        onReturnToSlide={vi.fn()}
        onShowBlack={vi.fn()}
        onStartMonitor={async () => true}
        onStartTabOrWindow={async () => true}
        outputMode="slide"
        status="idle"
      />,
    );

    expect(html).toContain("웹·실습 보여주기");
    expect(html).toContain("청중 화면 가리기");
    expect(html).toContain("고급 옵션");
    expect(html).toContain('aria-live="polite"');
  });

  it("shows return-to-slide while sharing", () => {
    const html = renderToStaticMarkup(
      <AudienceOutputControls
        connected={true}
        error=""
        onReturnToSlide={vi.fn()}
        onShowBlack={vi.fn()}
        onStartMonitor={async () => true}
        onStartTabOrWindow={async () => true}
        outputMode="screen-share"
        status="sharing"
      />,
    );

    expect(html).toContain("슬라이드로 돌아가기");
    expect(html).toContain("웹·실습 화면 공유 중");
  });

  it("guides the presenter before connection without private data", () => {
    const html = renderToStaticMarkup(
      <AudienceOutputControls
        connected={false}
        error=""
        onReturnToSlide={vi.fn()}
        onShowBlack={vi.fn()}
        onStartMonitor={async () => true}
        onStartTabOrWindow={async () => true}
        outputMode="slide"
        status="idle"
      />,
    );

    expect(html).toContain("청중 화면을 먼저 연결해주세요");
    expect(html).not.toContain("speakerNotes");
    expect(html).not.toContain("transcript");
  });
});
