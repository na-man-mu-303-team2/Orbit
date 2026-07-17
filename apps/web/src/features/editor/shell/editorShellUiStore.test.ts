import { afterEach, beforeEach, describe, expect, it } from "vitest";

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

  afterEach(() => {
    useEditorShellUiStore.setState(editorShellUiInitialState);
  });

  it("starts with the editor shell UI defaults", () => {
    const state = useEditorShellUiStore.getState();

    expect(state.isDataViewOpen).toBe(false);
    expect(state.isAnimationPanelOpen).toBe(false);
    expect(state.isCanvasSnappingEnabled).toBe(true);
    expect(state.isRightPanelOpen).toBe(true);
    expect(state.isSlidesPaneCollapsed).toBe(false);
    expect(state.slidesPaneWidth).toBe(defaultSlidesPaneWidth);
    expect(state.animationPaneWidth).toBe(defaultAnimationPaneWidth);
    expect(state.rightPaneWidth).toBe(defaultRightPaneWidth);
    expect(state.slidePanelView).toBe("thumbnail");
    expect(state.showIds).toBe(false);
    expect(state.activeTopMenu).toBeNull();
    expect(state.shapeMenuPosition).toBeNull();
    expect(state.animationPanelFocusedAnimationId).toBeNull();
    expect(state.customShapeEditElementId).toBeNull();
    expect(state.editingElementId).toBeNull();
    expect(state.elementContextMenu).toBeNull();
    expect(state.insertTool).toBe("select");
    expect(state.selectedElementIds).toEqual([]);
    expect(state.selectedKeywordId).toBeNull();
    expect(state.selectedKeywordOccurrenceKey).toBeNull();
  });

  it("accepts direct values and functional updaters", () => {
    const state = useEditorShellUiStore.getState();

    state.setIsDataViewOpen(true);
    state.setIsCanvasSnappingEnabled((current) => !current);
    state.setShowIds((current) => !current);
    state.setSlidesPaneWidth((current) => current + 24);
    state.setActiveTopMenu("file");

    expect(useEditorShellUiStore.getState().isDataViewOpen).toBe(true);
    expect(useEditorShellUiStore.getState().isCanvasSnappingEnabled).toBe(false);
    expect(useEditorShellUiStore.getState().showIds).toBe(true);
    expect(useEditorShellUiStore.getState().slidesPaneWidth).toBe(
      defaultSlidesPaneWidth + 24
    );
    expect(useEditorShellUiStore.getState().activeTopMenu).toBe("file");
  });

  it("updates selection, edit target, tool, and context menu state", () => {
    const state = useEditorShellUiStore.getState();

    state.setSelectedElementIds(["el_1"]);
    state.setSelectedElementIds((current) => [...current, "el_2"]);
    state.setSelectedKeywordId("kw_1");
    state.setSelectedKeywordOccurrenceKey("kwo_1");
    state.setInsertTool("customShape");
    state.setEditingElementId("el_1");
    state.setCustomShapeEditElementId((current) => current ?? "el_2");
    state.setAnimationPanelFocusedAnimationId("anim_1");
    state.setElementContextMenu({
      elementIds: ["el_1", "el_2"],
      left: 30,
      slideId: "slide_1",
      top: 40,
      type: "selection"
    });

    expect(useEditorShellUiStore.getState().selectedElementIds).toEqual([
      "el_1",
      "el_2"
    ]);
    expect(useEditorShellUiStore.getState().selectedKeywordId).toBe("kw_1");
    expect(useEditorShellUiStore.getState().selectedKeywordOccurrenceKey).toBe(
      "kwo_1"
    );
    expect(useEditorShellUiStore.getState().insertTool).toBe("customShape");
    expect(useEditorShellUiStore.getState().editingElementId).toBe("el_1");
    expect(useEditorShellUiStore.getState().customShapeEditElementId).toBe("el_2");
    expect(useEditorShellUiStore.getState().animationPanelFocusedAnimationId).toBe(
      "anim_1"
    );
    expect(useEditorShellUiStore.getState().elementContextMenu).toEqual({
      elementIds: ["el_1", "el_2"],
      left: 30,
      slideId: "slide_1",
      top: 40,
      type: "selection"
    });
  });

  it("resets project-scoped chrome without resetting layout preferences", () => {
    const state = useEditorShellUiStore.getState();

    state.setActiveTopMenu("presentation");
    state.setIsAudienceLinkModalOpen(true);
    state.setIsExitConfirmOpen(true);
    state.setIsRightPanelOpen(false);
    state.setIsShapeMenuOpen(true);
    state.setIsCanvasSnappingEnabled(false);
    state.setAnimationPanelFocusedAnimationId("anim_1");
    state.setCustomShapeEditElementId("el_2");
    state.setEditingElementId("el_1");
    state.setElementContextMenu({
      elementId: "el_1",
      left: 30,
      slideId: "slide_1",
      top: 40,
      type: "image"
    });
    state.setInsertTool("customShape");
    state.setSelectedElementIds(["el_1"]);
    state.setSelectedKeywordId("kw_1");
    state.setSelectedKeywordOccurrenceKey("kwo_1");
    state.setShapeMenuPosition({ left: 10, top: 20 });
    state.setShowIds(true);
    state.setSlidesPaneWidth(240);

    useEditorShellUiStore.getState().resetProjectUiState();

    expect(useEditorShellUiStore.getState().activeTopMenu).toBeNull();
    expect(useEditorShellUiStore.getState().isAudienceLinkModalOpen).toBe(false);
    expect(useEditorShellUiStore.getState().isExitConfirmOpen).toBe(false);
    expect(useEditorShellUiStore.getState().isShapeMenuOpen).toBe(false);
    expect(useEditorShellUiStore.getState().isCanvasSnappingEnabled).toBe(false);
    expect(useEditorShellUiStore.getState().animationPanelFocusedAnimationId).toBeNull();
    expect(useEditorShellUiStore.getState().customShapeEditElementId).toBeNull();
    expect(useEditorShellUiStore.getState().editingElementId).toBeNull();
    expect(useEditorShellUiStore.getState().elementContextMenu).toBeNull();
    expect(useEditorShellUiStore.getState().insertTool).toBe("select");
    expect(useEditorShellUiStore.getState().selectedElementIds).toEqual([]);
    expect(useEditorShellUiStore.getState().selectedKeywordId).toBeNull();
    expect(useEditorShellUiStore.getState().selectedKeywordOccurrenceKey).toBeNull();
    expect(useEditorShellUiStore.getState().shapeMenuPosition).toBeNull();
    expect(useEditorShellUiStore.getState().isRightPanelOpen).toBe(false);
    expect(useEditorShellUiStore.getState().showIds).toBe(true);
    expect(useEditorShellUiStore.getState().slidesPaneWidth).toBe(240);
  });
});
