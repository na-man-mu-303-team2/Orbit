import type { Deck, DeckElement, Slide } from "@orbit/shared";
import type Konva from "konva";
import { useEffect } from "react";

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
  onMarkTextBlurForClear: () => void;
  setCustomShapeEditDraft: (
    updater:
      | CustomShapeEditDraft
      | null
      | ((current: CustomShapeEditDraft | null) => CustomShapeEditDraft | null)
  ) => void;
  isKeyboardEditableTarget: (target: EventTarget | null) => boolean;
}) {
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
        return;
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
        return;
      }

      onClearSelection();
    }

    function handleNativeBackgroundCapture(event: MouseEvent | PointerEvent) {
      if (event.button !== 0 || insertTool !== "select") {
        return;
      }

      if (isKeyboardEditableTarget(event.target)) {
        return;
      }

      const point = getCanvasPointFromClientPosition(event.clientX, event.clientY);
      const isElementHit = visibleElements.some((element) =>
        isCanvasPointInsideElementSelectionArea({
          deck,
          element,
          point,
          slide
        })
      );

      if (!isElementHit) {
        handleCanvasBackgroundSelection();
      }
    }

    activeStageContainer.addEventListener(
      "pointerdown",
      handleNativeBackgroundCapture,
      true
    );
    activeStageContainer.addEventListener(
      "mousedown",
      handleNativeBackgroundCapture,
      true
    );

    return () => {
      activeStageContainer.removeEventListener(
        "pointerdown",
        handleNativeBackgroundCapture,
        true
      );
      activeStageContainer.removeEventListener(
        "mousedown",
        handleNativeBackgroundCapture,
        true
      );
    };
  }, [
    customShapeEditDraft,
    deck,
    editingElementId,
    insertTool,
    isKeyboardEditableTarget,
    onClearSelection,
    onMarkTextBlurForClear,
    selectedElementIds,
    setCustomShapeEditDraft,
    slide,
    stageRef,
    stageScale,
    visibleElements
  ]);
}
