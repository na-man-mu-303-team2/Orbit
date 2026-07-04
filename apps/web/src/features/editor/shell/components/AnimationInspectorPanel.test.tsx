import { createDemoDeck, getElementAnimations } from "@orbit/editor-core";
import { renderToString } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { AnimationInspectorPanel } from "./AnimationInspectorPanel";

describe("AnimationInspectorPanel", () => {
  it("renders animation summary cards for the selected element", () => {
    const deck = createDemoDeck();
    const slide = {
      ...deck.slides[0]!,
      animations: [
        {
          animationId: "anim_inline_1",
          elementId: "el_1",
          type: "fade-in" as const,
          order: 1,
          durationMs: 400,
          delayMs: 0,
          easing: "ease-out" as const
        }
      ]
    };
    const element = slide.elements.find((candidate) => candidate.elementId === "el_1") ?? null;
    const html = renderToString(
      <AnimationInspectorPanel
        animations={getElementAnimations(slide, "el_1")}
        canCreateAnimation
        element={element}
        preferredAnimationId={null}
        slideAnimations={slide.animations}
        slideElements={slide.elements}
        onAddAnimation={vi.fn()}
        onDeleteAnimation={vi.fn()}
        onSelectSlideAnimation={vi.fn()}
        showIds
        onUpdateAnimation={vi.fn()}
      />
    );

    expect(html).toContain("연결된 애니메이션");
    expect(html).toContain("새 효과 추가");
    expect(html).toContain("애니메이션 수정");
    expect(html).toContain("재생 시간");
    expect(html).toContain("애니메이션 제거");
  });

  it("renders slide animation overview when no element is selected", () => {
    const deck = createDemoDeck();
    const slide = {
      ...deck.slides[0]!,
      animations: [
        {
          animationId: "anim_inline_1",
          elementId: "el_1",
          type: "fade-in" as const,
          order: 1,
          durationMs: 400,
          delayMs: 0,
          easing: "ease-out" as const
        }
      ]
    };
    const html = renderToString(
      <AnimationInspectorPanel
        animations={[]}
        canCreateAnimation={false}
        element={null}
        preferredAnimationId={"anim_inline_1"}
        slideAnimations={slide.animations}
        slideElements={slide.elements}
        onAddAnimation={vi.fn()}
        onDeleteAnimation={vi.fn()}
        onSelectSlideAnimation={vi.fn()}
        showIds={false}
        onUpdateAnimation={vi.fn()}
      />
    );

    expect(html).toContain("이 슬라이드의 애니메이션");
    expect(html).toContain("페이드 인");
    expect(html).toContain("텍스트");
  });

  it("renders an empty property state when the slide has no animations", () => {
    const deck = createDemoDeck();
    const slide = deck.slides[0]!;
    const html = renderToString(
      <AnimationInspectorPanel
        animations={[]}
        canCreateAnimation={false}
        element={null}
        preferredAnimationId={null}
        slideAnimations={[]}
        slideElements={slide.elements}
        onAddAnimation={vi.fn()}
        onDeleteAnimation={vi.fn()}
        onSelectSlideAnimation={vi.fn()}
        showIds={false}
        onUpdateAnimation={vi.fn()}
      />
    );

    expect(html).toContain("애니메이션을 편집할 요소를 선택하세요.");
  });
});
