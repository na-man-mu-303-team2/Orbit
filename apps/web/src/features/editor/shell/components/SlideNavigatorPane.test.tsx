import { createDemoDeck } from "@orbit/editor-core";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { SlideNavigatorPane } from "./SlideNavigatorPane";
import { buildSlideRailItems } from "../slideRailModel";

function renderNavigator(view: "list" | "thumbnail", isCollapsed = false) {
  const deck = createDemoDeck();
  return renderToStaticMarkup(
    <SlideNavigatorPane
      canMutate
      deck={deck}
      isCollapsed={isCollapsed}
      items={buildSlideRailItems(deck.slides, deck.slides[0]?.slideId ?? null)}
      onAddActivityResultsSlide={vi.fn()}
      onAddActivitySlide={vi.fn()}
      onAddSlide={vi.fn()}
      onDeleteSlide={vi.fn()}
      onDuplicateSlide={vi.fn()}
      onMoveSlide={vi.fn()}
      onReorderSlides={vi.fn()}
      onResizeStart={vi.fn()}
      onSelectSlide={vi.fn()}
      onSetView={vi.fn()}
      onToggleCollapsed={vi.fn()}
      showIds={false}
      slideThumbnailUrls={{}}
      view={view}
    />,
  );
}

describe("SlideNavigatorPane", () => {
  it("목록 보기에서는 썸네일 없이 전체 제목을 행으로 렌더링한다", () => {
    const html = renderNavigator("list");
    const deck = createDemoDeck();

    expect(html).toContain("slides-list list-view");
    expect(html).not.toContain("slide-thumb");
    for (const slide of deck.slides) {
      expect(html).toContain(slide.title);
    }
  });

  it("썸네일 보기에서는 각 슬라이드의 렌더 영역을 한 번만 만든다", () => {
    const html = renderNavigator("thumbnail");
    const thumbnailCount = html.match(/slide-thumb orbit-thumb/g)?.length ?? 0;

    expect(thumbnailCount).toBe(createDemoDeck().slides.length);
    expect(html).toContain("slide-title-text");
    expect(html.indexOf("slide-number")).toBeLessThan(html.indexOf("slide-thumb"));
  });

  it("접힌 상태에서는 목록을 의미하는 열기 버튼만 제공한다", () => {
    const html = renderNavigator("thumbnail", true);

    expect(html).toContain('aria-label="슬라이드 목록 열기"');
    expect(html).toContain("tabler-icon-list");
    expect(html).not.toContain("tabler-icon-list-details");
    expect(html).not.toContain("collapsed-slide-rail");
    expect(html).not.toContain("slides-list");
  });
});
