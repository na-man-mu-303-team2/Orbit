import { renderToString } from "react-dom/server";
import type { ComponentProps } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  editorShellUiInitialState,
  useEditorShellUiStore
} from "../editorShellUiStore";
import { EditorToolbar } from "./EditorToolbar";

function renderToolbar(
  overrides: Partial<ComponentProps<typeof EditorToolbar>> = {}
) {
  return renderToString(
    <EditorToolbar
      canMutate
      canUseCurrentSlide
      compactSelectionTrigger={null}
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
      shapeMenuButtonRef={{ current: null }}
      undoDisabled
      zoomControl={null}
      {...overrides}
    />
  );
}

describe("EditorToolbar smart guides", () => {
  beforeEach(() => {
    useEditorShellUiStore.setState(editorShellUiInitialState);
  });

  afterEach(() => {
    useEditorShellUiStore.setState(editorShellUiInitialState);
  });

  it("renders the snapping preference as a pressed toolbar toggle", () => {
    expect(renderToolbar()).toMatch(
      /aria-label="스마트 가이드 끄기" aria-pressed="true"/
    );
  });

  it("disables unsupported add controls before mutation and exposes each reason", () => {
    const chartReason = "차트 serializer가 준비되지 않았습니다.";
    const animationReason = "애니메이션 serializer가 준비되지 않았습니다.";
    const html = renderToolbar({
      actionDisabledReasons: {
        animation: animationReason,
        chart: chartReason
      }
    });

    expect(html).toMatch(
      new RegExp(`aria-label="차트"[^>]*disabled=""[^>]*title="${chartReason}"`)
    );
    expect(html).toMatch(
      new RegExp(
        `aria-label="애니메이션"[^>]*disabled=""[^>]*title="${animationReason}"`
      )
    );
    expect(html).not.toMatch(/aria-label="텍스트"[^>]*disabled=""/);
  });

  it("disables slide-bound controls with a visible tooltip reason when no slide exists", () => {
    const html = renderToolbar({ canUseCurrentSlide: false });

    for (const label of ["텍스트", "도형", "차트", "이미지", "애니메이션"]) {
      expect(html).toMatch(
        new RegExp(
          `aria-label="${label}"[^>]*disabled=""[^>]*title="편집할 슬라이드가 필요합니다\\."`
        )
      );
    }
  });

  it("shows the compact selection trigger only to editors", () => {
    const compactSelectionTrigger = (
      <button data-testid="compact-selection-trigger" type="button">
        선택 속성
      </button>
    );

    expect(renderToolbar({ compactSelectionTrigger })).toContain(
      'data-testid="compact-selection-trigger"'
    );
    expect(
      renderToolbar({ canMutate: false, compactSelectionTrigger })
    ).not.toContain('data-testid="compact-selection-trigger"');
  });
});
