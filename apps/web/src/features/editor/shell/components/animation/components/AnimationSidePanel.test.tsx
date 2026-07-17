import { createDemoDeck, getElementAnimations } from "@orbit/editor-core";
import { renderToString } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { AnimationSidePanel } from "./AnimationSidePanel";

describe("AnimationSidePanel", () => {
  it("renders active fade transition and timing controls in the side-panel path", () => {
    const deck = createDemoDeck();
    const slide = {
      ...deck.slides[0]!,
      transition: { type: "fade" as const, durationMs: 700 }
    };
    const element = slide.elements[0]!;
    const html = renderToString(
      <AnimationSidePanel
        animations={getElementAnimations(slide, element.elementId)}
        canCreateAnimation
        canPlaySlideAnimations
        element={element}
        isPlayingSlideAnimations={false}
        keywordOptions={[]}
        preferredAnimationId={null}
        selectedKeywordId={null}
        selectedKeywordLabel={null}
        showIds={false}
        slideAnimations={slide.animations}
        slideElements={slide.elements}
        slideTransition={slide.transition}
        onAddAnimation={vi.fn()}
        onClose={vi.fn()}
        onDeleteAnimation={vi.fn()}
        onPlaySlideAnimations={vi.fn()}
        onResizeStart={vi.fn()}
        onSelectKeyword={vi.fn()}
        onSelectSlideAnimation={vi.fn()}
        onUpdateAnimation={vi.fn()}
        onUpdateSlideTransition={vi.fn()}
      />
    );

    expect(html).toContain("슬라이드 전환");
    expect(html).toContain("슬라이드 전환 효과");
    expect(html).toContain("전환 시간");
    expect(html).toContain("전환 제거");
    expect(html).toContain("애니메이션 패널");
    expect(html).toContain("PPTX 저장 지원 전까지 추가할 수 없습니다.");
  });

  it("disables transition authoring with the resolved preservation reason", () => {
    const deck = createDemoDeck();
    const slide = deck.slides[0]!;
    const html = renderToString(
      <AnimationSidePanel
        animations={[]}
        canCreateAnimation={false}
        canPlaySlideAnimations={false}
        element={null}
        isPlayingSlideAnimations={false}
        keywordOptions={[]}
        preferredAnimationId={null}
        selectedKeywordId={null}
        selectedKeywordLabel={null}
        showIds={false}
        slideAnimations={[]}
        slideElements={slide.elements}
        transitionMutationDisabledReason="전환을 안전하게 저장할 수 없습니다."
        onAddAnimation={vi.fn()}
        onClose={vi.fn()}
        onDeleteAnimation={vi.fn()}
        onPlaySlideAnimations={vi.fn()}
        onResizeStart={vi.fn()}
        onSelectKeyword={vi.fn()}
        onSelectSlideAnimation={vi.fn()}
        onUpdateAnimation={vi.fn()}
        onUpdateSlideTransition={vi.fn()}
      />
    );

    expect(html).toContain("전환을 안전하게 저장할 수 없습니다.");
    expect(html).toContain("disabled=\"\"");
  });
});
