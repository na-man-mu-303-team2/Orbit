import { renderToString } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  editorShellUiInitialState,
  useEditorShellUiStore
} from "../editorShellUiStore";
import { EditorToolbar } from "./EditorToolbar";

function renderToolbar() {
  return renderToString(
    <EditorToolbar
      canMutate
      canUseCurrentSlide
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
      shapeMenuButtonRef={{ current: null }}
      undoDisabled
      zoomControl={null}
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
});
