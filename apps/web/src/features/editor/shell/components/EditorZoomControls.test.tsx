import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { EditorZoomControls } from "./EditorZoomControls";

function renderZoomControls(
  overrides: Partial<Parameters<typeof EditorZoomControls>[0]> = {}
) {
  return renderToStaticMarkup(
    <EditorZoomControls
      canZoomIn
      canZoomOut
      isFitToViewport={false}
      onFitToViewport={vi.fn()}
      onZoomIn={vi.fn()}
      onZoomOut={vi.fn()}
      onZoomToActualSize={vi.fn()}
      scale={1}
      {...overrides}
    />
  );
}

describe("EditorZoomControls", () => {
  it("exposes Fit, 100%, percentage and boundary controls accessibly", () => {
    const html = renderZoomControls({ scale: 1.25 });

    expect(html).toContain('aria-label="캔버스 확대/축소"');
    expect(html).toContain('aria-label="캔버스 축소"');
    expect(html).toContain('aria-label="캔버스 확대"');
    expect(html).toContain('aria-label="캔버스에 맞추기"');
    expect(html).toContain('aria-label="100%로 보기"');
    expect(html).toContain('aria-label="현재 확대/축소"');
    expect(html).toContain(">125%</output>");
  });

  it("keeps Fit and 100% active states separate", () => {
    const fitHtml = renderZoomControls({ isFitToViewport: true, scale: 0.66 });
    const actualSizeHtml = renderZoomControls({ scale: 1 });

    expect(fitHtml).toMatch(/aria-label="캔버스에 맞추기" aria-pressed="true"/);
    expect(fitHtml).toMatch(/aria-label="100%로 보기" aria-pressed="false"/);
    expect(actualSizeHtml).toMatch(
      /aria-label="100%로 보기" aria-pressed="true"/
    );
  });

  it("disables zoom buttons at the configured boundaries", () => {
    const html = renderZoomControls({ canZoomIn: false, canZoomOut: false });

    expect(html).toMatch(/aria-label="캔버스 축소"[^>]*disabled/);
    expect(html).toMatch(/aria-label="캔버스 확대"[^>]*disabled/);
  });
});
