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
        onAddAnimation={vi.fn()}
        onDeleteAnimation={vi.fn()}
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

  it("renders an empty property state when no element is selected", () => {
    const html = renderToString(
      <AnimationInspectorPanel
        animations={[]}
        canCreateAnimation={false}
        element={null}
        onAddAnimation={vi.fn()}
        onDeleteAnimation={vi.fn()}
        showIds={false}
        onUpdateAnimation={vi.fn()}
      />
    );

    expect(html).toContain("애니메이션을 편집할 요소를 선택하세요.");
  });
});
