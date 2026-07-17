import type { Deck, DeckElement, Slide } from "@orbit/shared";
import type Konva from "konva";
import { useEffect, useRef } from "react";

import { isCanvasPointInsideElementSelectionArea } from "../utils/canvasInteractionUtils";
import type { CustomShapeEditDraft } from "./types";

export function useCanvasBackgroundPointerCapture(args: {
  deck: Deck;
  editingElementId: string | null;
  customShapeEditDraft: CustomShapeEditDraft | null;
  insertTool: "select" | "text" | "rect" | "ellipse" | "line" | "customShape";
  selectedElementIds: string[];
  slide: Slide;
  stageRef: React.MutableRefObject<Konva.Stage | null>;
  stageScale: number;
  visibleElements: DeckElement[];
  onClearSelection: () => void;
  onSelectionDragStart: (point: { x: number; y: number }) => void;
  onSelectionDragMove: (point: { x: number; y: number }) => void;
  onSelectionDragEnd: () => void;
  onMarkTextBlurForClear: () => void;
  setCustomShapeEditDraft: (
    updater:
      | CustomShapeEditDraft
      | null
      | ((current: CustomShapeEditDraft | null) => CustomShapeEditDraft | null)
  ) => void;
  isKeyboardEditableTarget: (target: EventTarget | null) => boolean;
}) {
  const activeSelectionPointerIdRef = useRef<number | null>(null);
  const {
    deck,
    editingElementId,
    customShapeEditDraft,
    insertTool,
    selectedElementIds,
    slide,
    stageRef,
    stageScale,
    visibleElements,
    onClearSelection,
    onSelectionDragStart,
    onSelectionDragMove,
    onSelectionDragEnd,
    onMarkTextBlurForClear,
    setCustomShapeEditDraft,
    isKeyboardEditableTarget
  } = args;

  useEffect(() => {
    const stageContainer = stageRef.current?.container();

    if (!stageContainer) {
      return;
    }

    const activeStageContainer = stageContainer;

    function getCanvasPointFromClientPosition(clientX: number, clientY: number) {
      const containerRect = activeStageContainer.getBoundingClientRect();

      return {
        x: (clientX - containerRect.left) / stageScale,
        y: (clientY - containerRect.top) / stageScale
      };
    }

    function handleCanvasBackgroundSelection() {
      if (editingElementId) {
        onMarkTextBlurForClear();
        return false;
      }

      const customShapeDraftElementId = customShapeEditDraft?.elementId ?? null;
      const shouldClearCustomShapeNode =
        customShapeEditDraft?.selectedNodeIndex !== null &&
        customShapeDraftElementId !== null &&
        (selectedElementIds.length === 0 ||
          selectedElementIds.includes(customShapeDraftElementId));

      if (shouldClearCustomShapeNode) {
        setCustomShapeEditDraft((current) =>
          current
            ? {
                ...current,
                selectedNodeIndex: null
              }
            : current
        );
        return false;
      }

      onClearSelection();
      return true;
    }

    function handleNativeBackgroundCapture(event: PointerEvent) {
      if (event.button !== 0 || insertTool !== "select") {
        return;
      }

      if (isKeyboardEditableTarget(event.target)) {
        return;
      }

      const point = getCanvasPointFromClientPosition(event.clientX, event.clientY);
      const isElementHit = visibleElements.some(
        (element) =>
          element.role !== "background" &&
          isCanvasPointInsideElementSelectionArea({ deck, element, point, slide })
      );

      if (!isElementHit && handleCanvasBackgroundSelection()) {
        activeSelectionPointerIdRef.current = event.pointerId;
        activeStageContainer.setPointerCapture?.(event.pointerId);
        onSelectionDragStart(point);
      }
    }

    function handleNativeSelectionMove(event: PointerEvent) {
      if (event.pointerId !== activeSelectionPointerIdRef.current) return;
      onSelectionDragMove(getCanvasPointFromClientPosition(event.clientX, event.clientY));
    }

    function finishNativeSelection(event: PointerEvent) {
      if (event.pointerId !== activeSelectionPointerIdRef.current) return;
      activeSelectionPointerIdRef.current = null;
      if (activeStageContainer.hasPointerCapture?.(event.pointerId)) {
        activeStageContainer.releasePointerCapture(event.pointerId);
      }
      onSelectionDragEnd();
    }

    activeStageContainer.addEventListener(
      "pointerdown",
      handleNativeBackgroundCapture,
      true
    );
    activeStageContainer.addEventListener("pointermove", handleNativeSelectionMove, true);
    activeStageContainer.addEventListener("pointerup", finishNativeSelection, true);
    activeStageContainer.addEventListener("pointercancel", finishNativeSelection, true);

    return () => {
      activeStageContainer.removeEventListener(
        "pointerdown",
        handleNativeBackgroundCapture,
        true
      );
      activeStageContainer.removeEventListener("pointermove", handleNativeSelectionMove, true);
      activeStageContainer.removeEventListener("pointerup", finishNativeSelection, true);
      activeStageContainer.removeEventListener("pointercancel", finishNativeSelection, true);
    };
  }, [
    customShapeEditDraft,
    deck,
    editingElementId,
    insertTool,
    isKeyboardEditableTarget,
    onClearSelection,
    onMarkTextBlurForClear,
    onSelectionDragEnd,
    onSelectionDragMove,
    onSelectionDragStart,
    selectedElementIds,
    setCustomShapeEditDraft,
    slide,
    stageRef,
    stageScale,
    visibleElements
  ]);
}
