import type { CustomShapeElementProps, DeckElement } from "@orbit/shared";
import type Konva from "konva";
import { useCallback, useMemo, useRef, useState } from "react";

import {
  createCustomShapeNode,
  type CanvasPoint,
  updateCustomShapeNodeHandle
} from "../custom-shape/geometry";
import {
  applyCanvasSelection,
  type CanvasRect,
  type CanvasSelectionModifiers,
  getMarqueeSelectionElementIds,
  hasReachedCanvasMarqueeThreshold,
  normalizeCanvasSelectionRect
} from "../utils/canvasSelection";
import type { CustomShapeEditDraft, CustomShapeInsertDraft } from "./types";

type MarqueeSession = {
  currentSelection: string[];
  end: CanvasPoint;
  endScreen: CanvasPoint;
  modifiers: CanvasSelectionModifiers;
  start: CanvasPoint;
  startScreen: CanvasPoint;
  surfaceElementId: string | null;
};

type MarqueeSurface = {
  elementId: string | null;
};

export function resolveCanvasMarqueeSelection(args: {
  currentSelection: readonly string[];
  elements: readonly DeckElement[];
  end: CanvasPoint;
  endScreen: CanvasPoint;
  modifiers: CanvasSelectionModifiers;
  start: CanvasPoint;
  startScreen: CanvasPoint;
  surfaceElementId: string | null;
}): string[] {
  const isMarquee = hasReachedCanvasMarqueeThreshold({
    start: args.startScreen,
    end: args.endScreen
  });
  const hitElementIds = isMarquee
    ? getMarqueeSelectionElementIds({
        elements: args.elements,
        rect: normalizeCanvasSelectionRect(args.start, args.end)
      })
    : args.surfaceElementId
      ? [args.surfaceElementId]
      : [];

  return applyCanvasSelection({
    currentSelection: args.currentSelection,
    elements: args.elements,
    hitElementIds,
    modifiers: args.modifiers
  });
}

function getMarqueeSurface(target: Konva.Node, stage: Konva.Stage): MarqueeSurface | null {
  if (target === stage) {
    return { elementId: null };
  }

  let current: Konva.Node | null = target;

  while (current && current !== stage) {
    if (current.getAttr("orbitElementRole") === "background") {
      const elementId = current.getAttr("orbitElementId");

      return {
        elementId: typeof elementId === "string" ? elementId : null
      };
    }

    current = current.getParent();
  }

  return null;
}

function getSelectionModifiers(event: PointerEvent): CanvasSelectionModifiers {
  return {
    ctrlKey: event.ctrlKey,
    metaKey: event.metaKey,
    shiftKey: event.shiftKey
  };
}

export function useCanvasStageInteractions(args: {
  customShapeEditDraft: CustomShapeEditDraft | null;
  draftElement: {
    end: CanvasPoint;
    start: CanvasPoint;
    type: "text" | "rect" | "ellipse" | "line";
  } | null;
  editingElementId: string | null;
  insertTool: "select" | "text" | "rect" | "ellipse" | "line" | "customShape";
  isMarqueeInteractionBlocked?: boolean;
  marqueeElements: readonly DeckElement[];
  selectedElementIds: readonly string[];
  onCommitSelection: (elementIds: string[]) => void;
  onCreateElement: (
    draft:
      | { type: "text"; x: number; y: number; width: number; height: number }
      | {
          type: "rect" | "ellipse" | "line";
          x: number;
          y: number;
          width: number;
          height: number;
        }
  ) => void;
  onCreateCustomShape: (nodes: CustomShapeElementProps["nodes"], closed: boolean) => void;
  onMarkTextBlurForClear: () => void;
  normalizeDraftRect: (
    start: { x: number; y: number },
    end: { x: number; y: number }
  ) => { x: number; y: number; width: number; height: number } | null;
  setCustomShapeEditDraft: (
    updater:
      | CustomShapeEditDraft
      | null
      | ((current: CustomShapeEditDraft | null) => CustomShapeEditDraft | null)
  ) => void;
  setCustomShapeInsertDraft: (
    updater:
      | CustomShapeInsertDraft
      | null
      | ((current: CustomShapeInsertDraft | null) => CustomShapeInsertDraft | null)
  ) => void;
  setDraftElement: (
    updater:
      | {
          end: CanvasPoint;
          start: CanvasPoint;
          type: "text" | "rect" | "ellipse" | "line";
        }
      | null
      | ((
          current: {
            end: CanvasPoint;
            start: CanvasPoint;
            type: "text" | "rect" | "ellipse" | "line";
          } | null
        ) =>
          | {
              end: CanvasPoint;
              start: CanvasPoint;
              type: "text" | "rect" | "ellipse" | "line";
            }
          | null)
  ) => void;
  stageScale: number;
}) {
  const {
    customShapeEditDraft,
    draftElement,
    editingElementId,
    insertTool,
    isMarqueeInteractionBlocked = false,
    marqueeElements,
    selectedElementIds,
    onCommitSelection,
    onCreateElement,
    onCreateCustomShape,
    onMarkTextBlurForClear,
    normalizeDraftRect,
    setCustomShapeEditDraft,
    setCustomShapeInsertDraft,
    setDraftElement,
    stageScale
  } = args;
  const marqueeSessionRef = useRef<MarqueeSession | null>(null);
  const [marqueeSession, setMarqueeSession] = useState<MarqueeSession | null>(null);

  function getCanvasPointerPosition(event: Konva.KonvaEventObject<PointerEvent>) {
    const pointer = event.target.getStage()?.getPointerPosition();

    if (!pointer) {
      return null;
    }

    return {
      canvas: {
        x: pointer.x / stageScale,
        y: pointer.y / stageScale
      },
      screen: pointer
    };
  }

  function updateMarqueeSession(nextSession: MarqueeSession | null) {
    marqueeSessionRef.current = nextSession;
    setMarqueeSession(nextSession);
  }

  const cancelMarquee = useCallback(() => {
    if (!marqueeSessionRef.current) {
      return false;
    }

    marqueeSessionRef.current = null;
    setMarqueeSession(null);
    return true;
  }, []);

  const handlers = useMemo(
    () => ({
      onPointerDown(event: Konva.KonvaEventObject<PointerEvent>) {
        const stage = event.target.getStage();

        if (!stage) {
          return;
        }

        if (event.evt.button !== 0) {
          return;
        }

        if (insertTool !== "select" && event.target !== stage) {
          return;
        }

        const pointer = getCanvasPointerPosition(event);

        if (!pointer) {
          return;
        }

        if (editingElementId) {
          onMarkTextBlurForClear();
          return;
        }

        if (insertTool === "customShape") {
          setCustomShapeInsertDraft((current) => {
            const nextNodes = [
              ...(current?.nodes ?? []),
              createCustomShapeNode(pointer.canvas)
            ];

            return {
              activeNodeIndex: nextNodes.length - 1,
              nodes: nextNodes,
              pointer: pointer.canvas
            };
          });
          return;
        }

        if (insertTool !== "select") {
          setDraftElement({
            type: insertTool as "text" | "rect" | "ellipse" | "line",
            start: pointer.canvas,
            end: pointer.canvas
          });
          return;
        }

        const marqueeSurface = getMarqueeSurface(event.target, stage);

        if (!marqueeSurface) {
          return;
        }

        if (
          customShapeEditDraft &&
          customShapeEditDraft.selectedNodeIndex !== null
        ) {
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

        if (customShapeEditDraft || isMarqueeInteractionBlocked) {
          return;
        }

        updateMarqueeSession({
          currentSelection: [...selectedElementIds],
          end: pointer.canvas,
          endScreen: pointer.screen,
          modifiers: getSelectionModifiers(event.evt),
          start: pointer.canvas,
          startScreen: pointer.screen,
          surfaceElementId: marqueeSurface.elementId
        });
      },
      onPointerMove(event: Konva.KonvaEventObject<PointerEvent>) {
        const pointer = getCanvasPointerPosition(event);

        if (insertTool === "select" && marqueeSessionRef.current) {
          if (!pointer) {
            return;
          }

          updateMarqueeSession({
            ...marqueeSessionRef.current,
            end: pointer.canvas,
            endScreen: pointer.screen
          });
          return;
        }

        if (insertTool === "customShape") {
          if (!pointer) {
            return;
          }

          setCustomShapeInsertDraft((current) => {
            if (!current) {
              return current;
            }

            if (current.activeNodeIndex === null) {
              return {
                ...current,
                pointer: pointer.canvas
              };
            }

            return {
              ...current,
              nodes: current.nodes.map((node, index) =>
                index === current.activeNodeIndex
                  ? updateCustomShapeNodeHandle(node, "out", pointer.canvas)
                  : node
              ),
              pointer: pointer.canvas
            };
          });
          return;
        }

        if (!draftElement || !pointer) {
          return;
        }

        setDraftElement((current) =>
          current
            ? {
                ...current,
                end: pointer.canvas
              }
            : current
        );
      },
      onPointerUp(event: Konva.KonvaEventObject<PointerEvent>) {
        if (insertTool === "select" && marqueeSessionRef.current) {
          const currentSession = marqueeSessionRef.current;
          const pointer = getCanvasPointerPosition(event);
          const completedSession = pointer
            ? {
                ...currentSession,
                end: pointer.canvas,
                endScreen: pointer.screen
              }
            : currentSession;

          updateMarqueeSession(null);
          onCommitSelection(
            resolveCanvasMarqueeSelection({
              currentSelection: completedSession.currentSelection,
              elements: marqueeElements,
              end: completedSession.end,
              endScreen: completedSession.endScreen,
              modifiers: getSelectionModifiers(event.evt),
              start: completedSession.start,
              startScreen: completedSession.startScreen,
              surfaceElementId: completedSession.surfaceElementId
            })
          );
          return;
        }

        if (insertTool === "customShape") {
          setCustomShapeInsertDraft((current) =>
            current
              ? {
                  ...current,
                  activeNodeIndex: null
                }
              : current
          );
          return;
        }

        if (!draftElement) {
          return;
        }

        const rect = normalizeDraftRect(draftElement.start, draftElement.end);
        setDraftElement(null);

        if (!rect) {
          return;
        }

        onCreateElement({
          type: draftElement.type,
          ...rect
        } as
          | { type: "text"; x: number; y: number; width: number; height: number }
          | {
              type: "rect" | "ellipse" | "line";
              x: number;
              y: number;
              width: number;
              height: number;
            });
      }
    }),
    [
      customShapeEditDraft,
      draftElement,
      editingElementId,
      insertTool,
      isMarqueeInteractionBlocked,
      marqueeElements,
      onCommitSelection,
      onCreateElement,
      onCreateCustomShape,
      onMarkTextBlurForClear,
      normalizeDraftRect,
      selectedElementIds,
      setCustomShapeEditDraft,
      setCustomShapeInsertDraft,
      setDraftElement,
      stageScale
    ]
  );
  const marqueeRect: CanvasRect | null =
    marqueeSession &&
    hasReachedCanvasMarqueeThreshold({
      start: marqueeSession.startScreen,
      end: marqueeSession.endScreen
    })
      ? normalizeCanvasSelectionRect(marqueeSession.start, marqueeSession.end)
      : null;

  return {
    ...handlers,
    cancelMarquee,
    marqueeRect
  };
}
