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
    expect(html).toContain("대본 톤");
    expect(html).toContain("전문적인");
    expect(html).toContain('type="file"');
    expect(html).toContain("multiple");
    expect(html).toContain("여기에 놓아 미리보기");
    expect(html).toContain("ai-ppt-drop-preview");
    expect(html).toContain("참고 자료를 여기에 놓으세요");
    expect(html).not.toContain(
      "선택 사항 · PDF, PPTX, DOCX 또는 이미지 파일을 여러 개 첨부할 수 있습니다.",
    );
    expect(html).toContain('aria-label="참고 자료 파일 업로드"');
    expect(html).toContain("내용 구성");
    expect(html).toContain("사용자 입력만");
    expect(html).toContain("이미지 구성");
    expect(html).toContain("이미지 최소화");
    expect(html).toContain('aria-haspopup="menu"');
    expect(html).toContain("첨부 파일 분석과 웹 검색은 실행하지 않습니다");
    expect(html).toContain("도형과 타이포 중심으로 구성합니다");
    expect(html).not.toContain(
      "선택한 어조는 슬라이드 디자인이 아닌 발표 대본에만 반영됩니다.",
    );
    expect(html).toContain("redesign-icon-label");
    expect(html).not.toContain('name="duration"');
    expect(html).not.toContain('name="slides"');
    expect(html).not.toContain(">References<");
  });

  it("shows the two-step content and Style & Color indicator", () => {
    const html = renderToStaticMarkup(createElement(AiPptMockupPage));

    expect(html).toContain(">내용 입력<");
    expect(html).toContain(">Style &amp; Color<");
    expect(html).not.toContain(">슬라이드 구성 미리보기<");
    expect(html).toContain('aria-current="step"');
    expect(html).not.toContain("핵심 컨텍스트");
    expect(html).toContain("상세 내용 및 컨텍스트");
    expect(html).toContain("대본 톤");
    expect(html).toContain("다음 단계");
    expect(html).not.toContain("AI 없이 직접 시작");
    expect(html).not.toContain("빈 슬라이드");
    expect(html).not.toContain("PPTX 가져오기");
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
    expect(html).toContain(">Aa<");
    expect(html).toContain("가나다라 · 핵심을 선명하게");
    expect(html).toContain("임원 브리프");
    expect(html).toContain("다음 액션");
    expect(html).toContain('aria-pressed="true"');
    expect(html).toContain("AI 팔레트");
  });
});
