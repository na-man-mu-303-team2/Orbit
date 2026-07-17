import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  AiPptMockupPage,
  AiPptStyleColorPage,
} from "./AiPptMockupPage";

describe("AI PPT wizard UI", () => {
  it("starts with one content screen and multiple attachments", () => {
    const html = renderToStaticMarkup(createElement(AiPptMockupPage));

    expect(html).toContain('aria-label="발표 내용 입력"');
    expect(html).toContain('name="topic"');
    expect(html).toContain('name="content"');
    expect(html).toContain('name="audience"');
    expect(html).toContain("발표 톤");
    expect(html).toContain("전문적인");
    expect(html).toContain('type="file"');
    expect(html).toContain("multiple");
    expect(html).not.toContain('name="duration"');
    expect(html).not.toContain('name="slides"');
    expect(html).not.toContain(">References<");
  });

  it("shows content, Story Review, and Style & Color in order", () => {
    const html = renderToStaticMarkup(createElement(AiPptMockupPage));

    expect(html).toContain(">내용 입력<");
    expect(html).toContain(">Story Review<");
    expect(html).toContain(">Style &amp; Color<");
    expect(html).not.toContain(">Brief<");
    expect(html).not.toContain(">Color<");
  });

  it("restores font selection and live preview on Style & Color", () => {
    const html = renderToStaticMarkup(
      createElement(AiPptStyleColorPage, {
        jobId: "job-1",
        projectId: "project-1",
      }),
    );

    expect(html).toContain("폰트");
    expect(html).toContain("Pretendard");
    expect(html).toContain("컬러 팔레트");
    expect(html).toContain("Live Preview");
    expect(html).toContain("AI 팔레트");
  });
});
