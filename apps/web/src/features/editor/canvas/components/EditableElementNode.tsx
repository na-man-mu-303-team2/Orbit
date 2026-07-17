import type {
  CustomShapeElementProps,
  Deck,
  DeckElement,
  GroupElementProps,
  Slide,
  TextElementProps,
} from "@orbit/shared";
import { getGroupChildElements } from "../../../../../../../packages/editor-core/src/index";
import type Konva from "konva";
import {
  Group as KonvaGroup,
  Rect as KonvaRect,
  Text as KonvaText,
} from "react-konva";
import type { ComponentType } from "react";
import { useEffect, useState } from "react";
import type { ElementPresentationState } from "../../../slides/rendering";

import {
  CustomShapeEditOverlay,
  getCustomShapeOverlayViewBox,
} from "./CustomShapeOverlays";
import { ElementNodeContent } from "./ElementNodeContent";
import { getTextElementLayout } from "../text/textLayout";
import {
  CANVAS_ID_BADGE_FONT_SIZE,
  CANVAS_ID_BADGE_HEIGHT,
  CANVAS_ID_BADGE_PADDING,
  getCanvasIdBadgeOffset,
  getCanvasIdBadgeWidth,
  getDisplayIdLabel,
  getGroupedChildPreviewFrame,
} from "../utils/canvasElementUtils";
import type { CanvasSelectionModifiers } from "../utils/canvasSelection";
import {
  resolveCanvasDragInteraction,
  type CanvasSnapGuide
} from "../utils/canvasSnapping";

type KonvaComponent = ComponentType<any>;

const Group = KonvaGroup as unknown as KonvaComponent;
const Rect = KonvaRect as unknown as KonvaComponent;
const Text = KonvaText as unknown as KonvaComponent;

type CustomShapeEditDraft = {
  closed: boolean;
  elementId: string;
  nodes: CustomShapeElementProps["nodes"];
  selectedNodeIndex: number | null;
};

export function EditableElementNode(props: {
  accentColor: string;
  customShapeEditDraft: CustomShapeEditDraft | null;
  deck: Deck;
  disablePointerEvents: boolean;
  element: DeckElement;
  isSelected: boolean;
  presentationState?: ElementPresentationState;
  selectedElementIds: readonly string[];
  selectedCount: number;
  showIds: boolean;
  slide: Slide;
  snapElements: readonly DeckElement[];
  snappingEnabled: boolean;
  stageScale: number;
  onChangeDragGuides: (guides: CanvasSnapGuide[]) => void;
  onChangeCustomShapeEditDraft: (draft: CustomShapeEditDraft | null) => void;
  onDoubleClick: () => void;
  onCommitCustomShapeEditDraft: (draft: CustomShapeEditDraft) => void;
  onCommitFrame: (frame: {
    x: number;
    y: number;
    width: number;
    height: number;
    rotation: number;
  }) => void;
  onMountNode: (node: Konva.Group | null) => void;
  onOpenContextMenu: (clientX: number, clientY: number) => void;
  onSelect: (modifiers: CanvasSelectionModifiers) => void;
}) {
  const {
    accentColor,
    customShapeEditDraft,
    deck,
    disablePointerEvents,
    element,
    isSelected,
    presentationState,
    selectedElementIds,
    selectedCount,
    showIds,
    slide,
    snapElements,
    snappingEnabled,
    stageScale,
    onChangeDragGuides,
    onChangeCustomShapeEditDraft,
    onDoubleClick,
    onCommitCustomShapeEditDraft,
    onCommitFrame,
    onMountNode,
    onOpenContextMenu,
    onSelect,
  } = props;
  const [previewFrame, setPreviewFrame] = useState<{
    x: number;
    y: number;
    width: number;
    height: number;
    rotation: number;
  } | null>(null);
  const frame = previewFrame ?? {
    x: presentationState?.x ?? element.x,
    y: presentationState?.y ?? element.y,
    width: presentationState?.width ?? element.width,
    height: presentationState?.height ?? element.height,
    rotation: presentationState?.rotation ?? element.rotation
  };
  const isMultiSelected = isSelected && selectedCount > 1;
  const selectionHitFill = isSelected
    ? isMultiSelected
      ? "rgba(37, 99, 235, 0.16)"
      : "rgba(37, 99, 235, 0.08)"
    : "rgba(15, 23, 42, 0.001)";
  const selectionStroke = isSelected ? "#2563eb" : "transparent";
  const selectionStrokeWidth = isSelected ? (isMultiSelected ? 3 : 2) : 0;
  const selectionDash = isMultiSelected ? [12, 6] : undefined;
  const elementIdLabel = getDisplayIdLabel(element.elementId);
  const canvasIdBadgeWidth = getCanvasIdBadgeWidth(elementIdLabel);
  const canvasIdBadgeOffset = getCanvasIdBadgeOffset({
    badgeHeight: CANVAS_ID_BADGE_HEIGHT,
    badgeWidth: canvasIdBadgeWidth,
    canvas: deck.canvas,
    frame,
  });

  useEffect(() => {
    setPreviewFrame(null);
  }, [element.height, element.rotation, element.width, element.x, element.y]);

  function handlePointerSelect(modifiers: CanvasSelectionModifiers) {
    const hasSelectionModifier = Boolean(
      modifiers.shiftKey || modifiers.metaKey || modifiers.ctrlKey
    );

    if (
      !hasSelectionModifier &&
      element.type === "text" &&
      isSelected &&
      selectedCount === 1
    ) {
      onDoubleClick();
      return;
    }

    onSelect(modifiers);
  }

  function resolveDragInteraction(
    phase: "cancel" | "end" | "move",
    node: Konva.Node,
    bypassSnapping = false
  ) {
    return resolveCanvasDragInteraction({
      bypassSnapping,
      canvas: deck.canvas,
      elements: snapElements,
      frame: {
        x: node.x(),
        y: node.y(),
        width: frame.width,
        height: frame.height,
        rotation: node.rotation()
      },
      movingElementId: element.elementId,
      phase,
      selectedElementIds,
      snappingEnabled,
      stageScale
    });
  }

  return (
    <Group
      draggable={
        !disablePointerEvents &&
        !customShapeEditDraft &&
        element.role !== "background"
      }
      listening={
        !disablePointerEvents &&
        (presentationState?.visible ?? element.visible)
      }
      orbitElementId={element.elementId}
      orbitElementRole={element.role}
      opacity={
        (presentationState?.visible ?? element.visible)
          ? (presentationState?.opacity ?? element.opacity)
          : 0
      }
      ref={onMountNode}
      rotation={frame.rotation}
      scaleX={presentationState?.scaleX ?? 1}
      scaleY={presentationState?.scaleY ?? 1}
      x={frame.x}
      y={frame.y}
      onClick={(event: Konva.KonvaEventObject<MouseEvent>) => {
        if (element.role === "background") {
          return;
        }

        handlePointerSelect({
          ctrlKey: event.evt.ctrlKey,
          metaKey: event.evt.metaKey,
          shiftKey: event.evt.shiftKey
        });
      }}
      onContextMenu={(event: Konva.KonvaEventObject<PointerEvent>) => {
        const shouldKeepSelection = isSelected && selectedCount > 1;

        if (
          element.type !== "image" &&
          element.type !== "group" &&
          !shouldKeepSelection
        ) {
          return;
        }

        event.evt.preventDefault();
        if (!shouldKeepSelection) {
          onSelect({});
        }
        onOpenContextMenu(event.evt.clientX, event.evt.clientY);
      }}
      onDblClick={() => {
        if (element.type === "text") {
          onDoubleClick();
        }
      }}
      onDragStart={() => {
        onChangeDragGuides([]);
      }}
      onDragMove={(event: Konva.KonvaEventObject<DragEvent>) => {
        const result = resolveDragInteraction(
          "move",
          event.currentTarget,
          event.evt.altKey
        );

        if (!result.previewFrame) {
          return;
        }

        event.currentTarget.position({
          x: result.previewFrame.x,
          y: result.previewFrame.y
        });
        setPreviewFrame(result.previewFrame);
        onChangeDragGuides(result.guides);
      }}
      onDragEnd={(event: Konva.KonvaEventObject<DragEvent>) => {
        const result = resolveDragInteraction(
          "end",
          event.currentTarget,
          event.evt.altKey
        );

        setPreviewFrame(null);
        onChangeDragGuides([]);

        if (result.commitFrame) {
          onCommitFrame(result.commitFrame);
        }
      }}
      onPointerCancel={(event: Konva.KonvaEventObject<PointerEvent>) => {
        const result = resolveDragInteraction("cancel", event.currentTarget);

        event.currentTarget.position({
          x: presentationState?.x ?? element.x,
          y: presentationState?.y ?? element.y
        });
        setPreviewFrame(result.previewFrame);
        onChangeDragGuides(result.guides);
      }}
      onTap={() => {
        if (element.role !== "background") {
          handlePointerSelect({});
        }
      }}
      onTransform={(event: Konva.KonvaEventObject<Event>) => {
        if (element.type !== "text") {
          return;
        }

        const node = event.target;
        const nextFrame = {
          x: node.x(),
          y: node.y(),
          width: Math.max(1, frame.width * node.scaleX()),
          height: Math.max(1, frame.height * node.scaleY()),
          rotation: node.rotation(),
        };

        node.scaleX(1);
        node.scaleY(1);
        setPreviewFrame(nextFrame);
      }}
      onTransformEnd={(event: Konva.KonvaEventObject<Event>) => {
        const node = event.target;
        const nextWidth = Math.max(1, frame.width * node.scaleX());
        const nextHeight = Math.max(1, frame.height * node.scaleY());

        node.scaleX(1);
        node.scaleY(1);

        setPreviewFrame(null);
        onCommitFrame({
          x: node.x(),
          y: node.y(),
          width: nextWidth,
          height: nextHeight,
          rotation: node.rotation(),
        });
      }}
    >
      <ElementInteractionHitTargets
        deck={deck}
        element={element}
        frame={frame}
        slide={slide}
      />
      <Rect
        cornerRadius={10}
        dash={selectionDash}
        fill={selectionHitFill}
        listening={false}
        stroke={selectionStroke}
        strokeWidth={selectionStrokeWidth}
        width={frame.width}
        height={frame.height}
      />
      <ElementNodeContent
        accentColor={accentColor}
        customShapePreview={customShapeEditDraft}
        deck={deck}
        element={element}
        frame={frame}
        slide={slide}
      />
      {customShapeEditDraft && element.type === "customShape" ? (
        <CustomShapeEditOverlay
          draft={customShapeEditDraft}
          frame={frame}
          onChangeDraft={onChangeCustomShapeEditDraft}
          onCommitDraft={onCommitCustomShapeEditDraft}
          {...getCustomShapeOverlayViewBox({
            elementProps: element.props as CustomShapeElementProps,
            frame,
          })}
        />
      ) : null}
      {showIds ? (
        <Group
          listening={false}
          rotation={-frame.rotation}
          x={canvasIdBadgeOffset.x}
          y={canvasIdBadgeOffset.y}
        >
          <Rect
            cornerRadius={18}
            fill="rgba(255, 255, 255, 0.98)"
            height={CANVAS_ID_BADGE_HEIGHT}
            shadowBlur={14}
            shadowColor="rgba(15, 23, 42, 0.18)"
            shadowOpacity={0.28}
            stroke="#2563eb"
            strokeWidth={1.5}
            width={canvasIdBadgeWidth}
          />
          <Text
            fill="#0f172a"
            fontSize={CANVAS_ID_BADGE_FONT_SIZE}
            fontStyle="bold"
            padding={CANVAS_ID_BADGE_PADDING}
            text={elementIdLabel}
            width={canvasIdBadgeWidth}
          />
        </Group>
      ) : null}
    </Group>
  );
}

function ElementInteractionHitTargets(props: {
  deck: Deck;
  element: DeckElement;
  frame: {
    x: number;
    y: number;
    width: number;
    height: number;
    rotation: number;
  };
  slide: Slide;
}) {
  const { deck, element, frame, slide } = props;
  const hitFill = "rgba(15, 23, 42, 0.001)";

  if (element.type === "group") {
    const groupProps = element.props as GroupElementProps;
    const childElements = getGroupChildElements(
      slide,
      groupProps.childElementIds,
    );

    return (
      <>
        {childElements.map((childElement) => {
          const childFrame = getGroupedChildPreviewFrame({
            childElement,
            currentGroupFrame: element,
            previewGroupFrame: frame,
          });

          return (
            <Group
              key={`group-hit-${childElement.elementId}`}
              rotation={childFrame.rotation}
              x={childFrame.x}
              y={childFrame.y}
            >
              <Rect
                fill={hitFill}
                width={Math.max(1, childFrame.width)}
                height={Math.max(1, childFrame.height)}
              />
            </Group>
          );
        })}
      </>
    );
  }

  if (element.type === "text") {
    const textLayout = getTextElementLayout({
      frame,
      props: element.props as TextElementProps,
      slide,
      theme: deck.theme,
    });

    return (
      <Rect
        fill={hitFill}
        x={textLayout.contentX}
        y={textLayout.y}
        width={Math.max(24, textLayout.contentWidth)}
        height={Math.max(1, textLayout.contentHeight)}
      />
    );
  }

  return (
    <Rect
      fill={hitFill}
      width={Math.max(1, frame.width)}
      height={Math.max(1, frame.height)}
    />
  );
}
