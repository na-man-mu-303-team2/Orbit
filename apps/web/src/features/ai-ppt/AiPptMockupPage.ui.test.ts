import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { AiPptMockupPage } from "./AiPptMockupPage";

describe("AI PPT wizard UI", () => {
  it("starts with one content screen and multiple attachments", () => {
    const html = renderToStaticMarkup(createElement(AiPptMockupPage));

    expect(html).toContain('aria-label="발표 내용 입력"');
    expect(html).toContain('name="topic"');
    expect(html).toContain('name="content"');
    expect(html).toContain('name="audience"');
    expect(html).toContain('type="file"');
    expect(html).toContain("multiple");
    expect(html).not.toContain('name="duration"');
    expect(html).not.toContain('name="slides"');
    expect(html).not.toContain(">References<");
  });

  it("shows exactly two wizard steps", () => {
    const html = renderToStaticMarkup(createElement(AiPptMockupPage));

    expect(html).toContain(">내용 입력<");
    expect(html).toContain(">Style &amp; Color<");
    expect(html).not.toContain(">Brief<");
    expect(html).not.toContain(">Color<");
  });
});
