import {
  createDemoDeck,
  getElementAnimations,
  validateSlideAnimations,
} from "../../../../../../../packages/editor-core/src/index";
import type { DeckElement } from "@orbit/shared";
import { renderToString } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import {
  getImageCropActionState,
  SelectionQuickBar,
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
          easing: "ease-out" as const,
        },
      ],
    };
    const element =
      slide.elements.find((candidate) => candidate.elementId === "el_1") ??
      null;
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
      />,
    );

    expect(html).toContain("애니메이션 편집");
    expect(html).toContain("나타나기");
    expect(html).not.toContain("나타나기 1개가 연결되어 있습니다.");
    expect(html).not.toContain("선택 키워드: ORBIT");
    expect(html).not.toContain("재생");
    expect(html).not.toContain("지연");
    expect(html).not.toContain("잠금");
  });

  it("renders add button label when no animation exists", () => {
    const deck = createDemoDeck();
    const slide = deck.slides[0]!;
    const element =
      slide.elements.find((candidate) => candidate.elementId === "el_1") ??
      null;
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
      />,
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
          easing: "ease-out" as const,
        },
      ],
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
      />,
    );

    expect(html).toContain("정리 필요한 애니메이션");
    expect(html).toContain("anim_dangling_1");
  });

  it("keeps crop hidden until A7 while honoring the supplied capability", () => {
    const deck = createDemoDeck();
    const slide = deck.slides[0]!;
    const element: DeckElement = {
      ...slide.elements[0]!,
      type: "image",
      role: "media",
      props: {
        alt: "Crop fixture",
        fit: "cover",
        focusX: 0.5,
        focusY: 0.5,
        src: "data:image/png;base64,AA==",
      },
    };
    const capability = {
      enabled: true,
      reason: null,
      reasonCode: "SUPPORTED" as const,
    };

    expect(
      getImageCropActionState({ capability, element, persistenceReady: true }),
    ).toEqual({ enabled: true, reason: null, visible: true });
    expect(
      getImageCropActionState({
        capability: {
          enabled: false,
          reason: "원본 crop을 안전하게 저장할 수 없습니다.",
          reasonCode: "IMPORTED_FEATURE_UNSUPPORTED",
        },
        element,
        persistenceReady: true,
      }),
    ).toEqual({
      enabled: false,
      reason: "원본 crop을 안전하게 저장할 수 없습니다.",
      visible: true,
    });

    const html = renderToString(
      <SelectionQuickBar
        animations={[]}
        animationDiagnostics={validateSlideAnimations(slide, element.elementId)}
        canCreateAnimation
        canvas={deck.canvas}
        customShapeEditActive={false}
        element={element}
        imageCropCapability={capability}
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
        onStartImageCrop={vi.fn()}
        onToggleCustomShapeClosed={vi.fn()}
        onToggleCustomShapeEdit={vi.fn()}
      />,
    );

    expect(html).not.toContain("자르기");
  });

  it("shows disabled OOXML reasons on destructive element controls", () => {
    const deck = createDemoDeck();
    const slide = deck.slides[0]!;
    const element = slide.elements[0]!;
    const denied = {
      enabled: false,
      reason: "원본 OOXML 구조에서 이 편집을 안전하게 보존할 수 없습니다.",
      reasonCode: "IMPORTED_FEATURE_UNSUPPORTED" as const,
    };
    const html = renderToString(
      <SelectionQuickBar
        animations={[]}
        animationCapability={denied}
        animationDiagnostics={validateSlideAnimations(slide, element.elementId)}
        canCreateAnimation={false}
        canvas={deck.canvas}
        customShapeEditActive={false}
        element={element}
        elementAppearanceCapability={denied}
        elementFrameCapability={denied}
        elementPropertiesCapability={denied}
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
      />,
    );

    expect(html.match(/<fieldset[^>]*disabled=""/g)).toHaveLength(4);
    expect(html).toContain(`<span class="quickbar-inline-hint quickbar-inline-hint-warning" role="status">${denied.reason}</span>`);
  });
});
