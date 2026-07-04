import type {
  Chart,
  CustomShapeElementProps,
  Deck,
  DeckElementPaint,
  DeckElement,
  GroupElementProps,
  ShapeElementProps,
  TableElementProps,
  TextElementParagraph,
  TextElementRun,
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
import { normalizeRenderableElement } from "./elementNormalization";
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
import {
  getKonvaFontStyle,
  getTextElementLayout
} from "../../editor/canvas/text/textLayout";
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

const officeChartColors = ["#4F81BD", "#C0504D", "#9BBB59", "#8064A2"];

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
    const textProps = element.props as TextElementProps;

    if (textProps.writingMode === "vertical-270") {
      return (
        <Text
          align={textProps.align}
          fill={textLayout.color}
          fontFamily={textLayout.fontFamily}
          fontSize={textLayout.fontSize}
          fontStyle={textLayout.fontStyle}
          lineHeight={textProps.lineHeight}
          listening={false}
          padding={0}
          rotation={-90}
          text={textLayout.text}
          width={frame.height}
          wrap="word"
          x={0}
          y={frame.height}
        />
      );
    }

    if (shouldRenderTextParagraphs(textProps)) {
      return (
        <Group listening={false}>
          {layoutTextParagraphs(textProps, textLayout).map((paragraph, index) => (
            <Text
              align={paragraph.align}
              fill={paragraph.color}
              fontFamily={paragraph.fontFamily}
              fontSize={paragraph.fontSize}
              fontStyle={paragraph.fontStyle}
              key={`${paragraph.text}-${index}`}
              lineHeight={paragraph.lineHeight}
              listening={false}
              padding={0}
              text={paragraph.text}
              width={Math.max(1, paragraph.width)}
              wrap="word"
              x={paragraph.x}
              y={paragraph.y}
            />
          ))}
        </Group>
      );
    }

    if (shouldRenderTextRuns(textProps)) {
      return (
        <Group listening={false}>
          {layoutTextRuns(textProps, textLayout).map((segment, index) => (
            <Text
              fill={segment.color}
              fontFamily={segment.fontFamily}
              fontSize={segment.fontSize}
              fontStyle={segment.fontStyle}
              key={`${segment.text}-${index}`}
              lineHeight={textProps.lineHeight}
              listening={false}
              padding={0}
              text={segment.text}
              width={Math.max(1, segment.width)}
              x={segment.x}
              y={segment.y}
            />
          ))}
        </Group>
      );
    }

    return (
      <Text
        align={textProps.align}
        fill={textLayout.color}
        fontFamily={textLayout.fontFamily}
        fontSize={textLayout.fontSize}
        fontStyle={textLayout.fontStyle}
        lineHeight={textProps.lineHeight}
        listening={false}
        padding={0}
        text={textLayout.text}
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

  if (element.type === "svg") {
    return <ImageElementContent frame={frame} imageProps={element.props} />;
  }

  if (element.type === "table") {
    return (
      <TableElementContent
        frame={frame}
        table={element.props as TableElementProps}
      />
    );
  }

  if (element.type === "chart") {
    return (
      <ChartElementContent
        accentColor={accentColor}
        chart={element.props as Chart}
        frame={frame}
      />
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
          const renderableChildElement = normalizeRenderableElement(deck.canvas, childElement);
          const childPresentationState = elementStates?.[childElement.elementId];
          const presentedChildElement = applyPresentationStateToElement(
            renderableChildElement,
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
    const strokeProps = getStrokeRenderProps(customShapeProps);
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
            {...getFillRenderProps(isClosed ? customShapeProps.fill : "transparent", {
              fallback: fill,
              height: viewBoxHeight,
              width: viewBoxWidth
            })}
            {...getShadowRenderProps(customShapeProps)}
            fillEnabled={isClosed}
            lineCap={strokeProps.lineCap}
            lineJoin={strokeProps.lineJoin ?? "round"}
            scaleX={frame.width / viewBoxWidth}
            scaleY={frame.height / viewBoxHeight}
            sceneFunc={(context: Konva.Context, shape: Konva.Shape) =>
              drawCustomShapeScene(context, shape, dataArray)
            }
            stroke={stroke}
            strokeWidth={strokeWidth}
            dash={strokeProps.dash}
          />
        </Group>
      );
    }

    return (
      <Group listening={false}>
        <Rect
          cornerRadius={18}
          dash={strokeProps.dash ?? [10, 6]}
          {...getFillRenderProps(customShapeProps.fill, {
            fallback: fill,
            height: frame.height,
            width: frame.width
          })}
          {...getShadowRenderProps(customShapeProps)}
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
    const strokeProps = getStrokeRenderProps(element.props);

    return (
      <Group listening={false}>
        <Circle
          {...getFillRenderProps(element.props.fill, {
            fallback: "transparent",
            height: frame.height,
            width: frame.width
          })}
          {...getShadowRenderProps(element.props)}
          dash={strokeProps.dash}
          lineCap={strokeProps.lineCap}
          lineJoin={strokeProps.lineJoin}
          stroke={getSolidPaint(element.props.stroke, "transparent")}
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
    const strokeProps = getStrokeRenderProps(element.props);

    return (
      <Group listening={false}>
        <RegularPolygon
          sides={sides}
          {...getFillRenderProps(element.props.fill, {
            fallback: "transparent",
            height: frame.height,
            width: frame.width
          })}
          {...getShadowRenderProps(element.props)}
          dash={strokeProps.dash}
          lineCap={strokeProps.lineCap}
          lineJoin={strokeProps.lineJoin}
          stroke={getSolidPaint(element.props.stroke, "transparent")}
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
    const strokeProps = getStrokeRenderProps(element.props);
    const outerRadius = Math.max(
      1,
      Math.min(frame.width, frame.height) / 2 - strokeWidth / 2
    );

    return (
      <Group listening={false}>
        <KonvaStar
          {...getFillRenderProps(element.props.fill, {
            fallback: "transparent",
            height: frame.height,
            width: frame.width
          })}
          {...getShadowRenderProps(element.props)}
          dash={strokeProps.dash}
          innerRadius={outerRadius * 0.48}
          lineCap={strokeProps.lineCap}
          lineJoin={strokeProps.lineJoin}
          numPoints={5}
          outerRadius={outerRadius}
          stroke={getSolidPaint(element.props.stroke, "transparent")}
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
    const strokeProps = getStrokeRenderProps(element.props);

    return (
      <Group listening={false}>
        <Circle
          fill="transparent"
          dash={strokeProps.dash}
          lineCap={strokeProps.lineCap}
          lineJoin={strokeProps.lineJoin}
          radius={radius}
          stroke={getSolidPaint(
            element.props.stroke,
            getSolidPaint(element.props.fill, "#2563eb")
          )}
          strokeWidth={strokeWidth}
          x={frame.width / 2}
          y={frame.height / 2}
        />
      </Group>
    );
  }

  if (element.type === "arrow") {
    const stroke = getSolidPaint(element.props.stroke, "#2563eb");
    const strokeProps = getStrokeRenderProps(element.props);
    const strokeWidth = Math.max(2, element.props.strokeWidth);
    const pointerLength = Math.max(18, Math.min(42, frame.width * 0.1));
    const pointerWidth = Math.max(14, Math.min(30, frame.height * 1.2));

    return (
      <Group listening={false}>
        <Rect fill="transparent" width={frame.width} height={Math.max(20, frame.height)} />
        <KonvaArrow
          fill={stroke}
          dash={strokeProps.dash}
          lineCap={strokeProps.lineCap}
          lineJoin={strokeProps.lineJoin}
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
    const strokeProps = getStrokeRenderProps(element.props);

    return (
      <Group listening={false}>
        <Rect fill="transparent" width={frame.width} height={Math.max(16, frame.height)} />
        <Line
          dash={strokeProps.dash}
          lineCap={strokeProps.lineCap}
          lineJoin={strokeProps.lineJoin}
          points={[0, frame.height / 2, frame.width, frame.height / 2]}
          stroke={getSolidPaint(element.props.stroke, "#2563eb")}
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
        {...getFillRenderProps(element.props.fill, {
          fallback: "transparent",
          height: frame.height,
          width: frame.width
        })}
        {...getShadowRenderProps(element.props)}
        {...getStrokeRenderProps(element.props)}
        stroke={getSolidPaint(element.props.stroke, "transparent")}
        strokeWidth={element.props.stroke === "transparent" ? 0 : Math.max(1, element.props.strokeWidth)}
        width={frame.width}
        height={frame.height}
      />
    </Group>
  );
}

type TextLayout = ReturnType<typeof getTextElementLayout>;

function ChartElementContent(props: {
  accentColor: string;
  chart: Chart;
  frame: SlideElementFrame;
}) {
  const { accentColor, chart, frame } = props;
  if (chart.type === "pie" || chart.type === "doughnut") {
    return <PieChartContent chart={chart} frame={frame} />;
  }

  return <CartesianChartContent accentColor={accentColor} chart={chart} frame={frame} />;
}

function CartesianChartContent(props: {
  accentColor: string;
  chart: Chart;
  frame: SlideElementFrame;
}) {
  const { accentColor, chart, frame } = props;
  const data = chart.data.filter((datum): datum is { label: string; value: number } =>
    "value" in datum
  );
  const values = data.map((datum) => datum.value);
  const maxValue = niceChartMax(Math.max(1, ...values));
  const isLineChart = chart.type === "line";
  const plot = {
    height: frame.height * 0.716,
    width: frame.width * (isLineChart ? 0.73 : 0.91),
    x: frame.width * 0.0715,
    y: frame.height * 0.185
  };
  const tickCount = 10;
  const slotWidth = plot.width / Math.max(1, data.length);
  const seriesColor = chart.style.colors[0] ?? officeChartColors[0] ?? accentColor;

  return (
    <Group listening={false}>
      <Text
        align="center"
        fill={chart.style.textColor ?? "#000000"}
        fontFamily={chart.style.fontFamily}
        fontSize={chart.style.titleFontSize ?? 34}
        fontStyle="bold"
        listening={false}
        text={chart.title || `${chart.type} chart`}
        width={frame.width}
        x={0}
        y={frame.height * 0.04}
      />
      {Array.from({ length: tickCount + 1 }, (_, index) => {
        const value = (maxValue * index) / tickCount;
        const y = plot.y + plot.height - (plot.height * value) / maxValue;
        return (
          <Group key={`tick-${index}`} listening={false}>
            <Line
              points={[plot.x, y, plot.x + plot.width, y]}
              stroke="#8A8A8A"
              strokeWidth={1}
            />
            <Text
              align="right"
              fill="#000000"
              fontSize={28}
              listening={false}
              text={formatChartTick(value)}
              width={plot.x - 12}
              x={0}
              y={y - 16}
            />
          </Group>
        );
      })}
      <Line
        points={[plot.x, plot.y, plot.x, plot.y + plot.height, plot.x + plot.width, plot.y + plot.height]}
        stroke="#8A8A8A"
        strokeWidth={1}
      />
      {isLineChart ? (
        <LineChartSeries
          data={data}
          maxValue={maxValue}
          plot={plot}
          seriesColor={seriesColor}
        />
      ) : (
        data.map((datum, index) => {
          const barHeight = (plot.height * datum.value) / maxValue;
          const barWidth = slotWidth * 0.4;
          return (
            <Rect
              fill={seriesColor || accentColor}
              height={barHeight}
              key={`${datum.label}-${index}`}
              listening={false}
              width={barWidth}
              x={plot.x + slotWidth * index + (slotWidth - barWidth) / 2}
              y={plot.y + plot.height - barHeight}
            />
          );
        })
      )}
      {data.map((datum, index) => (
        <Text
          align="center"
          fill="#000000"
          fontSize={30}
          key={`${datum.label}-label-${index}`}
          listening={false}
          text={datum.label}
          width={slotWidth}
          x={plot.x + slotWidth * index}
          y={plot.y + plot.height + 20}
        />
      ))}
      {isLineChart && chart.style.showLegend !== false ? (
        <ChartLegend
          color={seriesColor}
          frame={frame}
          label="Series 1"
          plot={plot}
        />
      ) : null}
    </Group>
  );
}

function LineChartSeries(props: {
  data: Array<{ label: string; value: number }>;
  maxValue: number;
  plot: { height: number; width: number; x: number; y: number };
  seriesColor: string;
}) {
  const { data, maxValue, plot, seriesColor } = props;
  const slotWidth = plot.width / Math.max(1, data.length);
  const points = data.flatMap((datum, index) => [
    plot.x + slotWidth * (index + 0.5),
    plot.y + plot.height - (plot.height * datum.value) / maxValue
  ]);

  return (
    <Group listening={false}>
      <Line points={points} stroke={seriesColor} strokeWidth={4} tension={0} />
      {data.map((datum, index) => (
        <Rect
          fill={seriesColor}
          key={`${datum.label}-marker-${index}`}
          stroke={seriesColor}
          strokeWidth={1}
          width={10}
          height={10}
          x={plot.x + slotWidth * (index + 0.5) - 5}
          y={plot.y + plot.height - (plot.height * datum.value) / maxValue - 5}
        />
      ))}
    </Group>
  );
}

function ChartLegend(props: {
  color: string;
  frame: SlideElementFrame;
  label: string;
  plot: { height: number; width: number; x: number; y: number };
}) {
  const { color, frame, label, plot } = props;
  const x = Math.min(frame.width - 170, plot.x + plot.width + frame.width * 0.04);
  const y = plot.y + plot.height * 0.44;

  return (
    <Group listening={false} x={x} y={y}>
      <Line points={[0, 12, 42, 12]} stroke={color} strokeWidth={4} />
      <Rect fill={color} height={18} width={18} x={12} y={3} />
      <Text fill="#000000" fontSize={32} listening={false} text={label} x={56} y={-5} />
    </Group>
  );
}

function PieChartContent(props: { chart: Chart; frame: SlideElementFrame }) {
  const { chart, frame } = props;
  const data = chart.data.filter((datum): datum is { label: string; value: number } =>
    "value" in datum
  );
  const total = data.reduce((sum, datum) => sum + Math.max(0, datum.value), 0) || 1;
  const radius = Math.min(frame.width, frame.height) * 0.4;
  const center = { x: frame.width / 2, y: frame.height * 0.57 };
  const colors = chart.style.colors.length ? chart.style.colors : officeChartColors;
  let startAngle = -90;

  return (
    <Group listening={false}>
      <Text
        align="center"
        fill={chart.style.textColor ?? "#000000"}
        fontSize={chart.style.titleFontSize ?? 34}
        fontStyle="bold"
        listening={false}
        text={chart.title || "Pie Chart"}
        width={frame.width}
        x={0}
        y={frame.height * 0.04}
      />
      {data.map((datum, index) => {
        const angle = (Math.max(0, datum.value) / total) * 360;
        const sliceStartAngle = startAngle;
        const sliceEndAngle = startAngle + angle;
        startAngle = sliceEndAngle;
        const slice = (
          <Shape
            fill={colors[index % colors.length]}
            key={`${datum.label}-${index}`}
            listening={false}
            sceneFunc={(context: Konva.Context, shape: Konva.Shape) => {
              const start = (sliceStartAngle * Math.PI) / 180;
              const end = (sliceEndAngle * Math.PI) / 180;
              context.beginPath();
              context.moveTo(center.x, center.y);
              context.arc(center.x, center.y, radius, start, end, false);
              context.closePath();
              context.fillStrokeShape(shape);
            }}
          />
        );
        return slice;
      })}
    </Group>
  );
}

function niceChartMax(value: number) {
  if (value <= 0) {
    return 1;
  }
  const magnitude = 10 ** Math.floor(Math.log10(value));
  const normalized = value / magnitude;
  const nice = normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10;
  return nice * magnitude;
}

function formatChartTick(value: number) {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

function TableElementContent(props: {
  frame: SlideElementFrame;
  table: TableElementProps;
}) {
  const { frame, table } = props;
  const rows = table.rows ?? [];
  const rowCount = Math.max(1, rows.length);
  const columnCount = Math.max(1, ...rows.map((row) => row.length));
  const columnWidths = distributeTableSizes(
    table.columnWidths,
    columnCount,
    frame.width
  );
  const rowHeights = distributeTableSizes(table.rowHeights, rowCount, frame.height);
  const rowOffsets = cumulativeOffsets(rowHeights);
  const columnOffsets = cumulativeOffsets(columnWidths);

  return (
    <Group listening={false}>
      {rows.flatMap((row, rowIndex) =>
        row.map((cell, columnIndex) => {
          const colSpan = Math.max(1, cell.colSpan ?? 1);
          const rowSpan = Math.max(1, cell.rowSpan ?? 1);
          const width = sumRange(columnWidths, columnIndex, colSpan);
          const height = sumRange(rowHeights, rowIndex, rowSpan);
          const x = columnOffsets[columnIndex] ?? 0;
          const y = rowOffsets[rowIndex] ?? 0;

          return (
            <Group key={`${rowIndex}-${columnIndex}`} listening={false} x={x} y={y}>
              <Rect
                {...getFillRenderProps(cell.fill ?? "transparent", {
                  fallback: "transparent",
                  height,
                  width
                })}
                stroke={cell.borderColor ?? table.borderColor}
                strokeWidth={cell.borderWidth ?? table.borderWidth}
                width={width}
                height={height}
              />
              <Text
                align={cell.align ?? "left"}
                fill={cell.textColor ?? "#111827"}
                fontFamily={cell.fontFamily}
                fontSize={cell.fontSize ?? 18}
                fontStyle={getKonvaFontStyle(cell.fontWeight ?? "normal")}
                height={Math.max(1, height - 12)}
                listening={false}
                padding={6}
                text={cell.text ?? ""}
                verticalAlign={cell.verticalAlign ?? "middle"}
                width={Math.max(1, width - 12)}
              />
            </Group>
          );
        })
      )}
    </Group>
  );
}

function distributeTableSizes(
  explicitSizes: number[] | undefined,
  count: number,
  total: number
) {
  if (explicitSizes?.length === count) {
    const explicitTotal = explicitSizes.reduce((sum, size) => sum + size, 0);
    if (explicitTotal > 0) {
      return explicitSizes.map((size) => (size / explicitTotal) * total);
    }
  }

  return Array.from({ length: count }, () => total / count);
}

function cumulativeOffsets(sizes: number[]) {
  let offset = 0;
  return sizes.map((size) => {
    const current = offset;
    offset += size;
    return current;
  });
}

function sumRange(values: number[], start: number, count: number) {
  return values
    .slice(start, Math.min(values.length, start + count))
    .reduce((sum, value) => sum + value, 0);
}

function shouldRenderTextRuns(props: TextElementProps) {
  return (props.runs?.filter((run) => run.text.length > 0).length ?? 0) > 1;
}

function shouldRenderTextParagraphs(props: TextElementProps) {
  return (
    (props.paragraphs?.filter((paragraph) => paragraphText(paragraph)).length ?? 0) >
    0
  );
}

function layoutTextParagraphs(props: TextElementProps, layout: TextLayout) {
  const paragraphs = props.paragraphs ?? [];
  const result: Array<{
    align: TextElementProps["align"];
    color: string;
    fontFamily: string;
    fontSize: number;
    fontStyle: "normal" | "bold";
    lineHeight: number;
    text: string;
    width: number;
    x: number;
    y: number;
  }> = [];
  let y = layout.y;

  for (const paragraph of paragraphs) {
    const text = paragraphText(paragraph);
    if (!text) {
      continue;
    }
    y += paragraph.spaceBefore ?? 0;
    const style = paragraphStyle(paragraph, props, layout);
    const indent = paragraph.indent ?? 0;
    const prefix = paragraph.bullet?.enabled ? `${paragraph.bullet.character} ` : "";
    const width = Math.max(1, layout.width - indent);
    result.push({
      ...style,
      text: `${prefix}${text}`,
      width,
      x: layout.contentX + indent,
      y
    });
    const measured = measureRunText(text, style);
    const lineCount = Math.max(1, Math.ceil(measured / width));
    y += lineCount * style.fontSize * style.lineHeight + (paragraph.spaceAfter ?? 0);
  }

  return result;
}

function paragraphText(paragraph: TextElementParagraph) {
  if (paragraph.runs?.length) {
    return paragraph.runs.map((run) => run.text).join("");
  }

  return paragraph.text;
}

function paragraphStyle(
  paragraph: TextElementParagraph,
  props: TextElementProps,
  layout: TextLayout
) {
  const run = paragraph.runs?.find((item) => item.text.trim()) ?? paragraph.runs?.[0];
  const fontWeight = run?.fontWeight ?? paragraph.fontWeight ?? props.fontWeight;

  return {
    align: paragraph.align ?? props.align,
    color: run?.color ?? paragraph.color ?? layout.color,
    fontFamily: run?.fontFamily ?? paragraph.fontFamily ?? layout.fontFamily,
    fontSize: run?.fontSize ?? paragraph.fontSize ?? layout.fontSize,
    fontStyle: getKonvaFontStyle(fontWeight),
    lineHeight: paragraph.lineHeight ?? props.lineHeight
  };
}

function layoutTextRuns(props: TextElementProps, layout: TextLayout) {
  const runs = props.runs ?? [];
  const lineHeight = layout.fontSize * props.lineHeight;
  let x = layout.contentX;
  let y = layout.y;

  return runs.flatMap((run) => {
    const segments = run.text.split(/(\n)/);
    const result: Array<{
      color: string;
      fontFamily: string;
      fontSize: number;
      fontStyle: "normal" | "bold";
      text: string;
      width: number;
      x: number;
      y: number;
    }> = [];

    for (const text of segments) {
      if (text === "\n") {
        x = layout.contentX;
        y += lineHeight;
        continue;
      }
      if (!text) {
        continue;
      }
      const style = textRunStyle(run, props, layout);
      const width = measureRunText(text, style);
      result.push({ ...style, text, width, x, y });
      x += width;
    }

    return result;
  });
}

function textRunStyle(
  run: TextElementRun,
  props: TextElementProps,
  layout: TextLayout
): {
  color: string;
  fontFamily: string;
  fontSize: number;
  fontStyle: "normal" | "bold";
} {
  const fontWeight = run.fontWeight ?? props.fontWeight;

  return {
    color: run.color ?? layout.color,
    fontFamily: run.fontFamily ?? layout.fontFamily,
    fontSize: run.fontSize ?? layout.fontSize,
    fontStyle: getKonvaFontStyle(fontWeight)
  };
}

function measureRunText(
  text: string,
  style: {
    fontFamily: string;
    fontSize: number;
    fontStyle: "normal" | "bold";
  }
) {
  if (typeof document === "undefined") {
    return text.length * style.fontSize * 0.55;
  }

  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d");
  if (!context) {
    return text.length * style.fontSize * 0.55;
  }
  const weight = style.fontStyle === "bold" ? 700 : 400;
  context.font = `${weight} ${style.fontSize}px ${style.fontFamily}`;
  return context.measureText(text).width;
}

function getSolidPaint(paint: DeckElementPaint | undefined, fallback: string) {
  if (!paint || paint === "transparent") {
    return paint === "transparent" ? "transparent" : fallback;
  }

  if (typeof paint === "string") {
    return paint;
  }

  if (paint.type === "pattern") {
    return paint.foreground;
  }

  return paint.stops[0]?.color ?? fallback;
}

function getFillRenderProps(
  paint: DeckElementPaint | undefined,
  frame: { fallback: string; height: number; width: number }
) {
  if (!paint || typeof paint === "string") {
    return { fill: getSolidPaint(paint, frame.fallback) };
  }

  if (paint.type === "pattern") {
    return getPatternFillRenderProps(paint);
  }

  const radians = (paint.angle * Math.PI) / 180;
  const length = Math.max(frame.width, frame.height);
  const dx = Math.cos(radians) * length * 0.5;
  const dy = Math.sin(radians) * length * 0.5;

  return {
    fillLinearGradientColorStops: paint.stops.flatMap((stop) => [
      stop.offset,
      stop.opacity < 1 ? withOpacity(stop.color, stop.opacity) : stop.color
    ]),
    fillLinearGradientEndPoint: {
      x: frame.width / 2 + dx,
      y: frame.height / 2 + dy
    },
    fillLinearGradientStartPoint: {
      x: frame.width / 2 - dx,
      y: frame.height / 2 - dy
    }
  };
}

function getPatternFillRenderProps(
  paint: Extract<DeckElementPaint, { type: "pattern" }>
) {
  const pattern = createPatternCanvas(paint);
  if (!pattern) {
    return { fill: paint.background };
  }

  return {
    fill: paint.background,
    fillPatternImage: pattern,
    fillPatternRepeat: "repeat"
  };
}

function createPatternCanvas(
  paint: Extract<DeckElementPaint, { type: "pattern" }>
) {
  if (typeof document === "undefined") {
    return null;
  }

  const canvas = document.createElement("canvas");
  canvas.width = 12;
  canvas.height = 12;
  const context = canvas.getContext("2d");
  if (!context) {
    return null;
  }

  context.fillStyle = paint.background;
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.strokeStyle = paint.foreground;
  context.fillStyle = paint.foreground;
  context.lineWidth = 2;

  const preset = paint.preset.toLowerCase();
  const isDiagonalPattern = preset.includes("diag") || preset === "pct20";
  if (isDiagonalPattern) {
    context.lineWidth = preset === "pct20" ? 1 : 2;
    context.globalAlpha = preset === "pct20" ? 0.42 : 1;
    context.beginPath();
    for (let offset = -12; offset <= 24; offset += 6) {
      context.moveTo(offset, 12);
      context.lineTo(offset + 12, 0);
    }
    context.stroke();
    context.globalAlpha = 1;
    return canvas;
  }

  context.globalAlpha = preset.includes("pct") ? 0.55 : 1;
  context.fillRect(2, 2, 3, 3);
  context.fillRect(8, 8, 3, 3);
  context.globalAlpha = 1;
  return canvas;
}

function getStrokeRenderProps(props: ShapeElementProps | CustomShapeElementProps) {
  return {
    dash: props.dash,
    lineCap: props.lineCap,
    lineJoin: props.lineJoin
  };
}

function getShadowRenderProps(props: ShapeElementProps | CustomShapeElementProps) {
  if (!props.shadow) {
    return {};
  }

  return {
    shadowBlur: props.shadow.blur,
    shadowColor: props.shadow.color,
    shadowOffsetX: props.shadow.offsetX,
    shadowOffsetY: props.shadow.offsetY,
    shadowOpacity: props.shadow.opacity
  };
}

function withOpacity(color: string, opacity: number) {
  const red = Number.parseInt(color.slice(1, 3), 16);
  const green = Number.parseInt(color.slice(3, 5), 16);
  const blue = Number.parseInt(color.slice(5, 7), 16);

  return `rgba(${red}, ${green}, ${blue}, ${opacity})`;
}

function applyPresentationStateToElement<T extends DeckElement>(
  element: T,
  state: ElementPresentationState | undefined
): T {
  if (!state) {
    return element;
  }

  const presentedElement: T = {
    ...element,
    height: state.height ?? element.height,
    opacity: state.opacity ?? element.opacity,
    rotation: state.rotation ?? element.rotation,
    visible: state.visible ?? element.visible,
    width: state.width ?? element.width,
    x: state.x ?? element.x,
    y: state.y ?? element.y
  };

  return presentedElement;
}
