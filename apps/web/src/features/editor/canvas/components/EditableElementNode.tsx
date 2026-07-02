import type {
  CustomShapeElementProps,
  Deck,
  DeckElement,
  GroupElementProps,
  Slide,
  TextElementProps
} from "@orbit/shared";
import { getGroupChildElements } from "@orbit/editor-core";
import type Konva from "konva";
import {
  Group as KonvaGroup,
  Rect as KonvaRect,
  Text as KonvaText
} from "react-konva";
import type { ComponentType } from "react";
import { useEffect, useState } from "react";

import { CustomShapeEditOverlay, getCustomShapeOverlayViewBox } from "./CustomShapeOverlays";
import { ElementNodeContent } from "./ElementNodeContent";
import { getTextElementLayout } from "../text/textLayout";
import {
  CANVAS_ID_BADGE_FONT_SIZE,
  CANVAS_ID_BADGE_HEIGHT,
  CANVAS_ID_BADGE_PADDING,
  getCanvasIdBadgeOffset,
  getCanvasIdBadgeWidth,
  getDisplayIdLabel,
  getGroupedChildPreviewFrame
} from "../utils/canvasElementUtils";

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
  selectedCount: number;
  showIds: boolean;
  slide: Slide;
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
  onSelect: (append: boolean) => void;
}) {
  const {
    accentColor,
    customShapeEditDraft,
    deck,
    disablePointerEvents,
    element,
    isSelected,
    selectedCount,
    showIds,
    slide,
    onChangeCustomShapeEditDraft,
    onDoubleClick,
    onCommitCustomShapeEditDraft,
    onCommitFrame,
    onMountNode,
    onOpenContextMenu,
    onSelect
  } = props;
  const [previewFrame, setPreviewFrame] = useState<{
    x: number;
    y: number;
    width: number;
    height: number;
    rotation: number;
  } | null>(null);
  const frame = previewFrame ?? {
    x: element.x,
    y: element.y,
    width: element.width,
    height: element.height,
    rotation: element.rotation
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
    frame
  });

  useEffect(() => {
    setPreviewFrame(null);
  }, [element.height, element.rotation, element.width, element.x, element.y]);

  function handlePointerSelect(append: boolean) {
    if (!append && element.type === "text" && isSelected && selectedCount === 1) {
      onDoubleClick();
      return;
    }

    onSelect(append);
  }

  return (
    <Group
      draggable={!disablePointerEvents && !element.locked && !customShapeEditDraft}
      listening={!disablePointerEvents}
      opacity={element.visible ? element.opacity : 0}
      ref={onMountNode}
      rotation={frame.rotation}
      x={frame.x}
      y={frame.y}
      onClick={(event: Konva.KonvaEventObject<MouseEvent>) =>
        handlePointerSelect(Boolean(event.evt.shiftKey))
      }
      onContextMenu={(event: Konva.KonvaEventObject<PointerEvent>) => {
        const shouldKeepSelection = isSelected && selectedCount > 1;

        if (element.type !== "image" && element.type !== "group" && !shouldKeepSelection) {
          return;
        }

        event.evt.preventDefault();
        if (!shouldKeepSelection) {
          onSelect(false);
        }
        onOpenContextMenu(event.evt.clientX, event.evt.clientY);
      }}
      onDblClick={() => {
        if (element.type === "text") {
          onDoubleClick();
        }
      }}
      onDragEnd={(event: Konva.KonvaEventObject<DragEvent>) => {
        setPreviewFrame(null);
        onCommitFrame({
          x: event.target.x(),
          y: event.target.y(),
          width: frame.width,
          height: frame.height,
          rotation: event.target.rotation()
        });
      }}
      onTap={() => handlePointerSelect(false)}
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
          rotation: node.rotation()
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
          rotation: node.rotation()
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
            frame
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
      {element.locked ? (
        <Text
          fill="#b91c1c"
          fontSize={12}
          fontStyle="bold"
          listening={false}
          text="LOCKED"
          x={frame.width - 54}
          y={8}
        />
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
    const childElements = getGroupChildElements(slide, groupProps.childElementIds);

    return (
      <>
        {childElements.map((childElement) => {
          const childFrame = getGroupedChildPreviewFrame({
            childElement,
            currentGroupFrame: element,
            previewGroupFrame: frame
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
      theme: deck.theme
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
