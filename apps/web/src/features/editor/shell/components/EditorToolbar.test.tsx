import { createRef } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { EditorToolbar } from "./EditorToolbar";

describe("EditorToolbar", () => {
  it("disables every canvas editing control for a special slide", () => {
    const html = renderToStaticMarkup(
      <EditorToolbar
        canUseCurrentSlide={false}
        insertTool="select"
        isAnimationPanelOpen={false}
        isImageUploadPending={false}
        isShapeMenuOpen={false}
        onAddChart={vi.fn()}
        onAddText={vi.fn()}
        onOpenAnimation={vi.fn()}
        onOpenImagePicker={vi.fn()}
        onRedo={vi.fn()}
        onSelectTool={vi.fn()}
        onToggleShapeMenu={vi.fn()}
        onUndo={vi.fn()}
        redoDisabled
        selectedElementAnimationCount={0}
        selectionProperties={null}
        shapeMenuButtonRef={createRef<HTMLButtonElement>()}
        undoDisabled
      />
    );

    for (const label of [
      "선택 도구",
      "텍스트",
      "도형",
      "차트",
      "이미지",
      "애니메이션",
      "템플릿"
    ]) {
      const button = html.match(new RegExp(`<button[^>]*aria-label="${label}"[^>]*>`))?.[0];
      expect(button, label).toContain("disabled");
    }
  });
});
