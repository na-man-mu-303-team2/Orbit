import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { PresenterStageSection } from "./PresenterScaffold";

describe("PresenterStageSection", () => {
  it("keeps the stage background sized to the rendered slide", () => {
    const html = renderToStaticMarkup(
      <PresenterStageSection
        currentIndex={0}
        emptyStageLabel="비어 있음"
        nextHint="다음 설명"
        nextSlideTitle="다음 슬라이드"
        onNext={() => undefined}
        onPrevious={() => undefined}
        previousDisabled
        renderStage={<div data-testid="rendered-slide">슬라이드</div>}
        stageIndexLabel="01 / 08"
        totalSlides={8}
      />
    );

    expect(html).toContain(
      '<div class="rehearsal-stage-surface"><div data-testid="rendered-slide">'
    );
  });
});
