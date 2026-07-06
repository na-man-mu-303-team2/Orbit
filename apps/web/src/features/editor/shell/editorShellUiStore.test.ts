import { beforeEach, describe, expect, it } from "vitest";

import {
  defaultRightPaneWidth,
  defaultSlidesPaneWidth,
  editorShellUiInitialState,
  useEditorShellUiStore
} from "./editorShellUiStore";
import { defaultAnimationPaneWidth } from "./components/animation/utils/layout";

describe("editorShellUiStore", () => {
  beforeEach(() => {
    useEditorShellUiStore.setState(editorShellUiInitialState);
  });

  it("starts with the editor shell UI defaults", () => {
    const state = useEditorShellUiStore.getState();

    expect(state.isDataViewOpen).toBe(false);
    expect(state.isAnimationPanelOpen).toBe(false);
    expect(state.isRightPanelOpen).toBe(true);
    expect(state.isSlidesPaneCollapsed).toBe(false);
    expect(state.slidesPaneWidth).toBe(defaultSlidesPaneWidth);
    expect(state.animationPaneWidth).toBe(defaultAnimationPaneWidth);
    expect(state.rightPaneWidth).toBe(defaultRightPaneWidth);
    expect(state.slidePanelView).toBe("thumbnail");
    expect(state.showIds).toBe(false);
    expect(state.activeTopMenu).toBeNull();
    expect(state.shapeMenuPosition).toBeNull();
  });

  it("accepts direct values and functional updaters", () => {
    const state = useEditorShellUiStore.getState();

    state.setIsDataViewOpen(true);
    state.setShowIds((current) => !current);
    state.setSlidesPaneWidth((current) => current + 24);
    state.setActiveTopMenu("file");

    expect(useEditorShellUiStore.getState().isDataViewOpen).toBe(true);
    expect(useEditorShellUiStore.getState().showIds).toBe(true);
    expect(useEditorShellUiStore.getState().slidesPaneWidth).toBe(
      defaultSlidesPaneWidth + 24
    );
    expect(useEditorShellUiStore.getState().activeTopMenu).toBe("file");
  });

  it("resets project-scoped chrome without resetting layout preferences", () => {
    const state = useEditorShellUiStore.getState();

    state.setActiveTopMenu("presentation");
    state.setIsAudienceLinkModalOpen(true);
    state.setIsExitConfirmOpen(true);
    state.setIsRightPanelOpen(false);
    state.setIsShapeMenuOpen(true);
    state.setShapeMenuPosition({ left: 10, top: 20 });
    state.setShowIds(true);
    state.setSlidesPaneWidth(240);

    useEditorShellUiStore.getState().resetProjectUiState();

    expect(useEditorShellUiStore.getState().activeTopMenu).toBeNull();
    expect(useEditorShellUiStore.getState().isAudienceLinkModalOpen).toBe(false);
    expect(useEditorShellUiStore.getState().isExitConfirmOpen).toBe(false);
    expect(useEditorShellUiStore.getState().isShapeMenuOpen).toBe(false);
    expect(useEditorShellUiStore.getState().shapeMenuPosition).toBeNull();
    expect(useEditorShellUiStore.getState().isRightPanelOpen).toBe(false);
    expect(useEditorShellUiStore.getState().showIds).toBe(true);
    expect(useEditorShellUiStore.getState().slidesPaneWidth).toBe(240);
  });
});
