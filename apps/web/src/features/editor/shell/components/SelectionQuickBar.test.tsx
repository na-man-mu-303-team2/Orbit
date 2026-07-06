import { createDemoDeck, getElementAnimations, validateSlideAnimations } from "../../../../../../../packages/editor-core/src/index";
import { renderToString } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import {
  buildTextStylePropsPatch,
  getEffectiveTextQuickBarStyle,
  SelectionQuickBar
} from "./SelectionQuickBar";

describe("SelectionQuickBar", () => {
  it("renders animation summary and editor entry point", () => {
    const deck = createDemoDeck();
    const slide = {
      ...deck.slides[0]!,
      animations: [
        {
          animationId: "anim_inline_1",
          elementId: "el_1",
          type: "appear" as const,
          order: 1,
          durationMs: 400,
          delayMs: 0,
          easing: "ease-out" as const
        }
      ]
    };
    const element = slide.elements.find((candidate) => candidate.elementId === "el_1") ?? null;
    const html = renderToString(
      <SelectionQuickBar
        animations={getElementAnimations(slide, "el_1")}
        animationDiagnostics={validateSlideAnimations(slide, "el_1")}
        canCreateAnimation
        canvas={deck.canvas}
        customShapeEditActive={false}
        element={element}
        selectedKeywordLabel="ORBIT"
        slide={slide}
        theme={deck.theme}
        showIds
        onOpenAnimationEditor={vi.fn()}
        onChangeFrame={vi.fn()}
        onChangeProps={vi.fn()}
        onChangeSlideStyle={vi.fn()}
        onChangeTheme={vi.fn()}
        onDeleteAnimation={vi.fn()}
        onToggleCustomShapeClosed={vi.fn()}
        onToggleCustomShapeEdit={vi.fn()}
      />
    );

    expect(html).toContain("애니메이션 편집");
    expect(html).toContain("나타나기");
    expect(html).not.toContain("나타나기 1개가 연결되어 있습니다.");
    expect(html).not.toContain("선택 키워드: ORBIT");
    expect(html).not.toContain("재생");
    expect(html).not.toContain("지연");
  });

  it("renders add button label when no animation exists", () => {
    const deck = createDemoDeck();
    const slide = deck.slides[0]!;
    const element = slide.elements.find((candidate) => candidate.elementId === "el_1") ?? null;
    const html = renderToString(
      <SelectionQuickBar
        animations={[]}
        animationDiagnostics={validateSlideAnimations(slide, "el_1")}
        canCreateAnimation
        canvas={deck.canvas}
        customShapeEditActive={false}
        element={element}
        selectedKeywordLabel={null}
        slide={slide}
        theme={deck.theme}
        showIds={false}
        onOpenAnimationEditor={vi.fn()}
        onChangeFrame={vi.fn()}
        onChangeProps={vi.fn()}
        onChangeSlideStyle={vi.fn()}
        onChangeTheme={vi.fn()}
        onDeleteAnimation={vi.fn()}
        onToggleCustomShapeClosed={vi.fn()}
        onToggleCustomShapeEdit={vi.fn()}
      />
    );

    expect(html).toContain("애니메이션 편집");
    expect(html).toContain("애니메이션 없음");
  });

  it("renders dangling animation cleanup in slide quickbar", () => {
    const deck = createDemoDeck();
    const slide = {
      ...deck.slides[0]!,
      animations: [
        {
          animationId: "anim_dangling_1",
          elementId: "el_missing",
          type: "appear" as const,
          order: 3,
          durationMs: 400,
          delayMs: 0,
          easing: "ease-out" as const
        }
      ]
    };
    const html = renderToString(
      <SelectionQuickBar
        animations={[]}
        animationDiagnostics={validateSlideAnimations(slide)}
        canCreateAnimation={false}
        canvas={deck.canvas}
        customShapeEditActive={false}
        element={null}
        selectedKeywordLabel={null}
        slide={slide}
        theme={deck.theme}
        showIds
        onOpenAnimationEditor={vi.fn()}
        onChangeFrame={vi.fn()}
        onChangeProps={vi.fn()}
        onChangeSlideStyle={vi.fn()}
        onChangeTheme={vi.fn()}
        onDeleteAnimation={vi.fn()}
        onToggleCustomShapeClosed={vi.fn()}
        onToggleCustomShapeEdit={vi.fn()}
      />
    );

    expect(html).toContain("정리 필요한 애니메이션");
    expect(html).toContain("anim_dangling_1");
  });

  it("builds text style patches for paragraph and run based text", () => {
    const deck = createDemoDeck();
    const baseElement = deck.slides[0]!.elements.find(
      (candidate) => candidate.type === "text"
    );

    expect(baseElement?.type).toBe("text");
    if (!baseElement || baseElement.type !== "text") {
      return;
    }

    const patch = buildTextStylePropsPatch(
      {
        ...baseElement,
        props: {
          ...baseElement.props,
          fontSize: 24,
          color: "#111827",
          fontWeight: "normal",
          align: "left",
          paragraphs: [
            {
              text: "",
              align: "center",
              indent: 0,
              lineHeight: 1.4,
              spaceBefore: 0,
              spaceAfter: 0,
              runs: [
                {
                  text: "Hello",
                  color: "#ef4444",
                  fontSize: 32,
                  fontWeight: "bold",
                  baseline: "normal"
                }
              ]
            }
          ],
          runs: [
            {
              text: "World",
              color: "#22c55e",
              fontSize: 28,
              fontWeight: "medium",
              baseline: "normal"
            }
          ]
        }
      },
      {
        align: "right",
        color: "#2563eb",
        fontSize: 40,
        fontWeight: "semibold",
        lineHeight: 1.1
      }
    );

    expect(patch).toMatchObject({
      align: "right",
      color: "#2563eb",
      fontSize: 40,
      fontWeight: "semibold",
      lineHeight: 1.1,
      runs: [
        {
          text: "World",
          color: "#2563eb",
          fontSize: 40,
          fontWeight: "semibold"
        }
      ],
      paragraphs: [
        {
          align: "right",
          color: "#2563eb",
          fontSize: 40,
          fontWeight: "semibold",
          lineHeight: 1.1,
          runs: [
            {
              text: "Hello",
              color: "#2563eb",
              fontSize: 40,
              fontWeight: "semibold"
            }
          ]
        }
      ]
    });
  });

  it("prefers paragraph and run styles when deriving quickbar values", () => {
    const style = getEffectiveTextQuickBarStyle({
      text: "Fallback",
      fontSize: 24,
      fontWeight: "normal",
      align: "left",
      verticalAlign: "top",
      lineHeight: 1.2,
      color: "#111827",
      paragraphs: [
        {
          text: "",
          align: "center",
          indent: 0,
          runs: [
            {
              text: "Imported",
              color: "#7c3aed",
              fontSize: 36,
              fontWeight: "bold",
              baseline: "normal"
            }
          ],
          lineHeight: 1.2,
          spaceBefore: 0,
          spaceAfter: 0
        }
      ]
    });

    expect(style).toEqual({
      align: "center",
      color: "#7c3aed",
      fontSize: 36,
      fontWeight: "bold"
    });
  });
});
