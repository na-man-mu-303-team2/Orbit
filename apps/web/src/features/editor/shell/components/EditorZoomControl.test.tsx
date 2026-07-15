import fs from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { EditorZoomControl } from "./EditorZoomControl";

const editorZoomControlCssPath = new URL(
  "./editor-zoom-control.css",
  import.meta.url,
);

function renderZoomControl(
  overrides: Partial<Parameters<typeof EditorZoomControl>[0]> = {},
) {
  return renderToStaticMarkup(
    <EditorZoomControl
      canZoomIn
      canZoomOut
      isFit={false}
      onFit={vi.fn()}
      onReset={vi.fn()}
      onZoomIn={vi.fn()}
      onZoomOut={vi.fn()}
      zoomPercent={100}
      {...overrides}
    />,
  );
}

describe("EditorZoomControl", () => {
  it("renders the complete accessible zoom contract", () => {
    const html = renderZoomControl({ zoomPercent: 125 });

    expect(html).toContain('role="group"');
    expect(html).toContain('aria-label="캔버스 확대/축소"');
    expect(html).toContain('aria-label="캔버스 축소"');
    expect(html).toContain('aria-label="캔버스 확대"');
    expect(html).toContain('aria-label="캔버스에 맞추기"');
    expect(html).toContain('aria-label="100%로 보기"');
    expect(html).toContain('aria-label="현재 확대/축소"');
    expect(html).toContain('aria-live="polite"');
    expect(html).toContain(">125%</output>");
    expect(html.match(/aria-hidden="true"/g)).toHaveLength(2);
  });

  it("disables boundary controls from the controlled props", () => {
    const html = renderZoomControl({ canZoomIn: false, canZoomOut: false });

    expect(html).toMatch(/aria-label="캔버스 축소"[^>]*disabled/);
    expect(html).toMatch(/aria-label="캔버스 확대"[^>]*disabled/);
  });

  it("exposes Fit and 100% active states without conflating them", () => {
    const fitHtml = renderZoomControl({ isFit: true, zoomPercent: 66 });
    const resetHtml = renderZoomControl({ isFit: false, zoomPercent: 100 });

    expect(fitHtml).toMatch(/aria-label="캔버스에 맞추기" aria-pressed="true"/);
    expect(fitHtml).toMatch(/aria-label="100%로 보기" aria-pressed="false"/);
    expect(resetHtml).toMatch(/aria-label="캔버스에 맞추기" aria-pressed="false"/);
    expect(resetHtml).toMatch(/aria-label="100%로 보기" aria-pressed="true"/);
  });

  it("keeps every coarse-pointer button at least 44 by 44 pixels", () => {
    const css = fs.readFileSync(editorZoomControlCssPath, "utf8");

    expect(css).toMatch(
      /@media \(any-pointer: coarse\)[\s\S]*?\.editor-zoom-control button \{[\s\S]*?height: 44px;[\s\S]*?min-width: 44px;/,
    );
    expect(css).toContain("flex: 0 0 auto;");
    expect(css).toContain("min-width: max-content;");
  });
});
