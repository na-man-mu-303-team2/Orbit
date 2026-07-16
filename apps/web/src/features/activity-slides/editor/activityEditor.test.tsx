import { createActivitySlide, createDemoDeck } from "@orbit/editor-core";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { ActivitySlideInspector } from "./ActivitySlideInspector";
import { ActivitySlidePreview } from "./ActivitySlidePreview";

describe("activity slide editor", () => {
  const slide = createActivitySlide(createDemoDeck(), "satisfaction");

  it("renders role-specific previews from the same activity definition", () => {
    const audience = renderToStaticMarkup(<ActivitySlidePreview role="audience" slide={slide} />);
    const presenter = renderToStaticMarkup(<ActivitySlidePreview role="presenter" slide={slide} />);

    expect(audience).toContain("청중 참여 장표 미리보기");
    expect(audience).toContain("응답 제출");
    expect(presenter).toContain("발표자 참여 장표 미리보기");
    expect(presenter).toContain("응답 0");
  });

  it("keeps generated response controls in a locked system layer", () => {
    const html = renderToStaticMarkup(
      <ActivitySlideInspector onChange={vi.fn()} slide={slide} />
    );

    expect(html).toContain("청중 화면");
    expect(html).toContain("발표자 화면");
    expect(html).toContain("잠긴 시스템 레이어");
    expect(html).toContain('data-activity-system-layer="locked"');
  });
});
