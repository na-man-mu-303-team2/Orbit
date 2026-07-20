import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  DesignAssistantHome,
  designAssistantQuickActions,
} from "./DesignAssistantHome";

describe("DesignAssistantHome", () => {
  it("maps the primary and secondary labels to the exact intent presets", () => {
    expect(designAssistantQuickActions.map(({ intentPreset, label }) => ({
      intentPreset,
      label,
    }))).toEqual([
      { intentPreset: "redesign-slide", label: "슬라이드 다시 디자인" },
      { intentPreset: "tidy-layout", label: "레이아웃 정리" },
      { intentPreset: "emphasize-message", label: "핵심 메시지 강조" },
      { intentPreset: "recommend-animation", label: "애니메이션 추천" },
    ]);
  });

  it("renders disabled loading and retry states without relying on color", () => {
    const loadingHtml = renderToStaticMarkup(
      <DesignAssistantHome
        disabled={false}
        isGenerating
        onAction={() => undefined}
      />,
    );
    const failedHtml = renderToStaticMarkup(
      <DesignAssistantHome
        disabled={false}
        errorMessage="디자인 제안을 만들지 못했습니다."
        isGenerating={false}
        onAction={() => undefined}
        onRetry={() => undefined}
      />,
    );

    expect(loadingHtml).toContain("디자인 제안 생성 중...");
    expect(loadingHtml).toContain("aria-busy=\"true\"");
    expect(loadingHtml).toContain("disabled");
    expect(failedHtml).toContain('role="alert"');
    expect(failedHtml).toContain("디자인 제안을 만들지 못했습니다.");
    expect(failedHtml).toContain("다시 시도");
  });
});
