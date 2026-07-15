import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { AiPptMockupPage } from "./AiPptMockupPage";

describe("AI PPT wizard UI", () => {
  it("does not expose the payload review step", () => {
    const html = renderToStaticMarkup(createElement(AiPptMockupPage));

    expect(html).toContain(">References<");
    expect(html).not.toContain(">Review<");
    expect(html).not.toContain("고급 설정 JSON 보기");
  });

  it("lets users submit restored Brief values for validation", () => {
    const html = renderToStaticMarkup(createElement(AiPptMockupPage));

    expect(html).toContain('aria-label="발표 Brief 입력"');
    expect(html).toContain('name="topic"');
    expect(html).toContain('name="duration"');
    expect(html).not.toContain('<button class="ai-ppt-primary" disabled=""');
  });
});
