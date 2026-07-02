import type {
  Chart,
  CustomShapeElementProps,
  Deck,
  DeckElement,
  GroupElementProps,
  ShapeElementProps,
  Slide,
  TextElementProps
} from "@orbit/shared";
import { getGroupChildElements } from "@orbit/editor-core";
import type Konva from "konva";
import {
  Arrow as KonvaArrowComponent,
  Circle as KonvaCircle,
  Group as KonvaGroup,
  Line as KonvaLine,
  Rect as KonvaRect,
  RegularPolygon as KonvaRegularPolygon,
  Shape as KonvaShape,
  Star as KonvaStarComponent,
  Text as KonvaText
} from "react-konva";
import type { ComponentType } from "react";
import type { ElementPresentationState } from "./ReadOnlySlideCanvas";
import { HighlightOverlay } from "./highlightOverlay";

import { ImageElementContent } from "./ImageElementContent";
import {
  buildCustomShapePathDataFromNodes,
  getCustomShapeDimension,
  getCustomShapePaint,
  getCustomShapePathData,
  getCustomShapeStrokeWidth
} from "../../editor/canvas/custom-shape/geometry";
import {
  drawCustomShapeScene,
  getCustomShapeDataArray
} from "../../editor/canvas/custom-shape/render";
import { getTextElementLayout } from "../../editor/canvas/text/textLayout";
import { getGroupedChildPreviewFrame } from "../../editor/canvas/utils/canvasElementUtils";

type KonvaComponent = ComponentType<any>;

const Circle = KonvaCircle as unknown as KonvaComponent;
const Group = KonvaGroup as unknown as KonvaComponent;
const KonvaArrow = KonvaArrowComponent as unknown as KonvaComponent;
const KonvaStar = KonvaStarComponent as unknown as KonvaComponent;
const Line = KonvaLine as unknown as KonvaComponent;
const Rect = KonvaRect as unknown as KonvaComponent;
const RegularPolygon = KonvaRegularPolygon as unknown as KonvaComponent;
const Shape = KonvaShape as unknown as KonvaComponent;
const Text = KonvaText as unknown as KonvaComponent;

export type SlideElementFrame = {
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
};

export type CustomShapeRenderPreview = {
  closed: boolean;
  elementId: string;
  nodes: CustomShapeElementProps["nodes"];
  selectedNodeIndex: number | null;
};

export function ElementNodeContent(props: {
  accentColor: string;
  activeHighlightElementIds?: Set<string>;
  customShapePreview?: CustomShapeRenderPreview | null;
  deck: Deck;
  element: DeckElement;
  elementStates?: Record<string, ElementPresentationState>;
  frame: SlideElementFrame;
  slide: Slide;
}) {
  const {
    accentColor,
    activeHighlightElementIds,
    customShapePreview,
    deck,
    element,
    elementStates,
    frame,
    slide
  } = props;

  if (element.type === "text") {
    const textLayout = getTextElementLayout({
      frame,
      props: element.props as TextElementProps,
      slide,
      theme: deck.theme
    });

    return (
      <Text
        align={element.props.align}
        fill={textLayout.color}
        fontFamily={textLayout.fontFamily}
        fontSize={element.props.fontSize}
        fontStyle={textLayout.fontStyle}
        lineHeight={element.props.lineHeight}
        listening={false}
        padding={0}
        text={element.props.text}
        width={textLayout.width}
        wrap="word"
        x={textLayout.x}
        y={textLayout.y}
      />
    );
  }

  if (element.type === "image") {
    return <ImageElementContent frame={frame} imageProps={element.props} />;
  }

  if (element.type === "chart") {
    const chart = element.props as Chart;
    const values = chart.data.map((datum) =>
      "value" in datum ? Math.abs(datum.value) : Math.abs(datum.y)
    );
    const maxValue = Math.max(1, ...values);
    const barWidth = frame.width / Math.max(chart.data.length, 1);

    return (
      <Group listening={false}>
        <Rect
          cornerRadius={18}
          fill="#fff"
          stroke={accentColor}
          strokeWidth={2}
          width={frame.width}
          height={frame.height}
        />
        <Text
          fill="#0f172a"
          fontSize={18}
          fontStyle="bold"
          text={chart.title || `${chart.type} chart`}
          x={14}
          y={12}
        />
        {chart.data.slice(0, 6).map((datum, index) => {
          const value = "value" in datum ? Math.abs(datum.value) : Math.abs(datum.y);
          const height = Math.max(18, ((frame.height - 84) * value) / maxValue);

          return (
            <Group key={`${datum.label ?? "item"}-${index}`}>
              <Rect
                fill={chart.style.colors[index] ?? accentColor}
                x={14 + index * barWidth}
                y={frame.height - height - 24}
                width={Math.max(18, barWidth - 16)}
                height={height}
                cornerRadius={8}
              />
            </Group>
          );
        })}
      </Group>
    );
  }

  if (element.type === "group") {
    const groupProps = element.props as GroupElementProps;
    const childElements = getGroupChildElements(slide, groupProps.childElementIds);

    if (childElements.length === 0) {
      return (
        <Group listening={false}>
          <Rect
            dash={[10, 6]}
            cornerRadius={18}
            fill="rgba(241, 245, 249, 0.7)"
            stroke="#64748b"
            strokeWidth={2}
            width={frame.width}
            height={frame.height}
          />
          <Text
            align="center"
            fill="#334155"
            fontSize={15}
            height={frame.height}
            padding={12}
            text="빈 그룹"
            verticalAlign="middle"
            width={frame.width}
          />
        </Group>
      );
    }

    return (
      <Group listening={false}>
        {childElements.map((childElement) => {
          const childPresentationState = elementStates?.[childElement.elementId];
          const presentedChildElement = applyPresentationStateToElement(
            childElement,
            childPresentationState
          );
          const childFrame = getGroupedChildPreviewFrame({
            childElement: presentedChildElement,
            currentGroupFrame: element,
            previewGroupFrame: frame
          });
          const childVisible = childPresentationState?.visible ?? childElement.visible;
          const childOpacity = childVisible
            ? (childPresentationState?.opacity ?? childElement.opacity)
            : 0;

          return (
            <Group
              data-element-id={childElement.elementId}
              key={childElement.elementId}
              listening={false}
              opacity={childOpacity}
              rotation={childFrame.rotation}
              scaleX={childPresentationState?.scaleX ?? 1}
              scaleY={childPresentationState?.scaleY ?? 1}
              x={childFrame.x}
              y={childFrame.y}
            >
              <ElementNodeContent
                activeHighlightElementIds={activeHighlightElementIds}
                accentColor={accentColor}
                deck={deck}
                element={presentedChildElement}
                elementStates={elementStates}
                frame={{
                  x: 0,
                  y: 0,
                  width: childFrame.width,
                  height: childFrame.height,
                  rotation: childFrame.rotation
                }}
                slide={slide}
              />
              {activeHighlightElementIds?.has(childElement.elementId) ? (
                <HighlightOverlay
                  element={{
                    ...presentedChildElement,
                    height: childFrame.height,
                    opacity: childOpacity,
                    rotation: 0,
                    visible: childVisible,
                    width: childFrame.width,
                    x: 0,
                    y: 0
                  }}
                />
              ) : null}
            </Group>
          );
        })}
      </Group>
    );
  }

  if (element.type === "customShape") {
    const customShapeProps = element.props as CustomShapeElementProps;
    const isClosed = customShapePreview?.closed ?? customShapeProps.closed;
    const pathData =
      customShapePreview?.nodes.length
        ? buildCustomShapePathDataFromNodes(customShapePreview.nodes, isClosed)
        : getCustomShapePathData(customShapeProps);
    const dataArray = getCustomShapeDataArray(pathData);
    const fill = getCustomShapePaint(customShapeProps, "fill", "#f5edff");
    const stroke = getCustomShapePaint(customShapeProps, "stroke", "#9333ea");
    const strokeWidth = getCustomShapeStrokeWidth(customShapeProps);
    const viewBoxWidth = getCustomShapeDimension(
      customShapeProps,
      "viewBoxWidth",
      frame.width
    );
    const viewBoxHeight = getCustomShapeDimension(
      customShapeProps,
      "viewBoxHeight",
      frame.height
    );

    if (dataArray.length > 0) {
      return (
        <Group listening={false}>
          <Rect fill="transparent" width={frame.width} height={frame.height} />
          <Shape
            fill={isClosed ? fill : "transparent"}
            fillEnabled={isClosed}
            lineJoin="round"
            scaleX={frame.width / viewBoxWidth}
            scaleY={frame.height / viewBoxHeight}
            sceneFunc={(context: Konva.Context, shape: Konva.Shape) =>
              drawCustomShapeScene(context, shape, dataArray)
            }
            stroke={stroke}
            strokeWidth={strokeWidth}
          />
        </Group>
      );
    }

    return (
      <Group listening={false}>
        <Rect
          cornerRadius={18}
          dash={[10, 6]}
          fill={fill}
          stroke={stroke}
          strokeWidth={2}
          width={frame.width}
          height={frame.height}
        />
        <Text
          fill="#6b21a8"
          fontSize={16}
          fontStyle="bold"
          text="SVG PATH"
          width={frame.width}
          height={frame.height}
          padding={14}
        />
      </Group>
    );
  }

  if (element.type === "ellipse") {
    const strokeWidth = Math.max(1, element.props.strokeWidth);
    const radius = Math.max(1, Math.min(frame.width, frame.height) / 2 - strokeWidth / 2);

    return (
      <Group listening={false}>
        <Circle
          fill={element.props.fill === "transparent" ? "#eff6ff" : element.props.fill}
          stroke={
            element.props.stroke === "transparent"
              ? "rgba(15, 23, 42, 0.18)"
              : element.props.stroke
          }
          strokeWidth={strokeWidth}
          x={frame.width / 2}
          y={frame.height / 2}
          radius={radius}
        />
      </Group>
    );
  }

  if (element.type === "polygon") {
    const polygonProps = element.props as ShapeElementProps & { sides?: number };
    const strokeWidth = Math.max(1, element.props.strokeWidth);
    const radius = Math.max(1, Math.min(frame.width, frame.height) / 2 - strokeWidth / 2);
    const sides = polygonProps.sides ?? 3;

    return (
      <Group listening={false}>
        <RegularPolygon
          sides={sides}
          fill={element.props.fill === "transparent" ? "#eff6ff" : element.props.fill}
          stroke={
            element.props.stroke === "transparent"
              ? "rgba(15, 23, 42, 0.18)"
              : element.props.stroke
          }
          strokeWidth={strokeWidth}
          x={frame.width / 2}
          y={frame.height / 2}
          radius={radius}
        />
      </Group>
    );
  }

  if (element.type === "star") {
    const strokeWidth = Math.max(1, element.props.strokeWidth);
    const outerRadius = Math.max(
      1,
      Math.min(frame.width, frame.height) / 2 - strokeWidth / 2
    );

    return (
      <Group listening={false}>
        <KonvaStar
          fill={element.props.fill === "transparent" ? "#eff6ff" : element.props.fill}
          innerRadius={outerRadius * 0.48}
          numPoints={5}
          outerRadius={outerRadius}
          stroke={
            element.props.stroke === "transparent"
              ? "rgba(15, 23, 42, 0.18)"
              : element.props.stroke
          }
          strokeWidth={strokeWidth}
          x={frame.width / 2}
          y={frame.height / 2}
        />
      </Group>
    );
  }

  if (element.type === "ring") {
    const strokeWidth = Math.max(6, element.props.strokeWidth * 4 || 12);
    const radius = Math.max(1, Math.min(frame.width, frame.height) / 2 - strokeWidth / 2);

    return (
      <Group listening={false}>
        <Circle
          fill="transparent"
          radius={radius}
          stroke={
            element.props.stroke === "transparent"
              ? element.props.fill === "transparent"
                ? "#2563eb"
                : element.props.fill
              : element.props.stroke
          }
          strokeWidth={strokeWidth}
          x={frame.width / 2}
          y={frame.height / 2}
        />
      </Group>
    );
  }

  if (element.type === "arrow") {
    const stroke = element.props.stroke === "transparent" ? "#2563eb" : element.props.stroke;
    const strokeWidth = Math.max(2, element.props.strokeWidth);
    const pointerLength = Math.max(18, Math.min(42, frame.width * 0.1));
    const pointerWidth = Math.max(14, Math.min(30, frame.height * 1.2));

    return (
      <Group listening={false}>
        <Rect fill="transparent" width={frame.width} height={Math.max(20, frame.height)} />
        <KonvaArrow
          fill={stroke}
          pointerLength={pointerLength}
          pointerWidth={pointerWidth}
          points={[0, frame.height / 2, frame.width, frame.height / 2]}
          stroke={stroke}
          strokeWidth={strokeWidth}
          tension={0}
        />
      </Group>
    );
  }

  if (element.type === "line") {
    return (
      <Group listening={false}>
        <Rect fill="transparent" width={frame.width} height={Math.max(16, frame.height)} />
        <Line
          points={[0, frame.height / 2, frame.width, frame.height / 2]}
          stroke={element.props.stroke === "transparent" ? "#2563eb" : element.props.stroke}
          strokeWidth={Math.max(2, element.props.strokeWidth)}
          tension={0}
        />
      </Group>
    );
  }

  return (
    <Group listening={false}>
      <Rect
        cornerRadius={element.props.borderRadius}
        fill={
          element.props.fill === "transparent"
            ? "rgba(49, 87, 245, 0.08)"
            : element.props.fill
        }
        stroke={
          element.props.stroke === "transparent"
            ? "rgba(16, 24, 40, 0.18)"
            : element.props.stroke
        }
        strokeWidth={Math.max(1, element.props.strokeWidth)}
        width={frame.width}
        height={frame.height}
      />
    </Group>
  );
}

function applyPresentationStateToElement(
  element: DeckElement,
  state: ElementPresentationState | undefined
): DeckElement {
  if (!state) {
    return element;
  }

  return {
    ...element,
    height: state.height ?? element.height,
    opacity: state.opacity ?? element.opacity,
    rotation: state.rotation ?? element.rotation,
    visible: state.visible ?? element.visible,
    width: state.width ?? element.width,
    x: state.x ?? element.x,
    y: state.y ?? element.y
  };
}
