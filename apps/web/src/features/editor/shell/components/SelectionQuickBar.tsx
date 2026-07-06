import type {
  Chart,
  ChartType,
  CustomShapeElementProps,
  Deck,
  DeckAnimation,
  DeckElement,
  DeckElementPaint,
  ImageElementProps,
  ShapeElementProps,
  Slide,
  TableCellProps,
  TableElementProps,
  TextElementParagraph,
  TextElementProps
} from "@orbit/shared";
import { AlignCenter, ArrowDown, ArrowUp, Eye, EyeOff, Lock, LockOpen, PenLine } from "lucide-react";
import { useEffect, useState } from "react";

import {
  getCustomShapeNodes,
  getCustomShapePaint,
  getCustomShapeStrokeWidth
} from "../../canvas/custom-shape/geometry";
import type { SlideAnimationDiagnostics } from "../../../../../../../packages/editor-core/src/index";
import { buildAnimationSummary } from "./animation";
import { IdBadge } from "./EditorIdBadge";

export function SelectionQuickBar(props: {
  animations: DeckAnimation[];
  animationDiagnostics: SlideAnimationDiagnostics;
  canCreateAnimation: boolean;
  canvas: Deck["canvas"] | null;
  customShapeEditActive: boolean;
  element: DeckElement | null;
  selectedKeywordLabel: string | null;
  slide: Slide | null;
  theme: Deck["theme"] | null;
  onOpenAnimationEditor: () => void;
  onChangeFrame: (frame: {
    role?: DeckElement["role"] | null;
    x?: number;
    y?: number;
    width?: number;
    height?: number;
    rotation?: number;
    opacity?: number;
    zIndex?: number;
    locked?: boolean;
    visible?: boolean;
  }) => void;
  onChangeProps: (props: Record<string, unknown>) => void;
  onChangeSlideStyle: (style: {
    backgroundColor?: string | null;
    textColor?: string | null;
    accentColor?: string | null;
  }) => void;
  onChangeTheme: (theme: Record<string, unknown>) => void;
  onDeleteAnimation: (animationId: string) => void;
  onToggleCustomShapeClosed: () => void;
  onToggleCustomShapeEdit: () => void;
  showIds: boolean;
}) {
  const {
    animations,
    animationDiagnostics,
    customShapeEditActive,
    canvas,
    element,
    onOpenAnimationEditor,
    onChangeFrame,
    onChangeProps,
    onChangeSlideStyle,
    onChangeTheme,
    onDeleteAnimation,
    onToggleCustomShapeClosed,
    onToggleCustomShapeEdit,
    showIds,
    slide,
    theme
  } = props;

  if (!element && !slide) {
    return null;
  }

  if (!element && slide) {
    const danglingAnimations = animationDiagnostics.danglingAnimations
      .map((diagnostic) =>
        slide.animations.find(
          (animation) => animation.animationId === diagnostic.animationId
        )
      )
      .filter(Boolean) as DeckAnimation[];

    return (
      <section className="selection-quickbar" data-testid="editor-slide-quickbar">
        {showIds ? (
          <div className="selection-quickbar-meta">
            <IdBadge id={slide.slideId} />
          </div>
        ) : null}
        <div className="selection-quickbar-fields">
          <PropertyColorField
            className="compact-property-field compact-property-field-color"
            label="배경색"
            value={slide.style.backgroundColor ?? "#ffffff"}
            onCommit={(value) => onChangeSlideStyle({ backgroundColor: value })}
          />
          <PropertyColorField
            className="compact-property-field compact-property-field-color"
            label="글자색"
            value={slide.style.textColor ?? "#111827"}
            onCommit={(value) => onChangeSlideStyle({ textColor: value })}
          />
          <PropertyColorField
            className="compact-property-field compact-property-field-color"
            label="강조색"
            value={slide.style.accentColor ?? "#2563eb"}
            onCommit={(value) => onChangeSlideStyle({ accentColor: value })}
          />
          <div className="quickbar-divider" />
          <PropertyColorField
            className="compact-property-field compact-property-field-color"
            label="테마 배경"
            value={theme?.backgroundColor ?? "#ffffff"}
            onCommit={(value) => onChangeTheme({ backgroundColor: value })}
          />
          <PropertyColorField
            className="compact-property-field compact-property-field-color"
            label="테마 강조"
            value={theme?.accentColor ?? "#2563eb"}
            onCommit={(value) =>
              onChangeTheme({ accentColor: value, palette: { primary: value } })
            }
          />
          <PropertyNumberField
            className="compact-property-field compact-property-field-sm"
            label="본문 크기"
            min={8}
            onCommit={(value) => onChangeTheme({ typography: { bodySize: value } })}
            value={theme?.typography.bodySize ?? 26}
          />
          <PropertyNumberField
            className="compact-property-field compact-property-field-sm"
            label="둥글기"
            min={0}
            onCommit={(value) => onChangeTheme({ effects: { borderRadius: value } })}
            value={theme?.effects.borderRadius ?? 8}
          />
          {danglingAnimations.length > 0 ? (
            <>
              <div className="quickbar-divider" />
              <span className="quickbar-inline-hint quickbar-inline-hint-warning">
                정리 필요한 애니메이션 {danglingAnimations.length}개
              </span>
              {danglingAnimations.map((animation) => (
                <button
                  className="quickbar-action-chip"
                  key={animation.animationId}
                  type="button"
                  onClick={() => onDeleteAnimation(animation.animationId)}
                >
                  {showIds ? <IdBadge id={animation.animationId} /> : null}
                  삭제
                </button>
              ))}
            </>
          ) : null}
        </div>
      </section>
    );
  }

  if (!element) {
    return null;
  }

  const showOpacityControl = element.type !== "text";
  const showMeta = showIds;
  const animationSummary = buildAnimationSummary(animations, {
    emptyLabel: "애니메이션 없음"
  });

  return (
    <section className="selection-quickbar" data-testid="editor-element-quickbar">
      {showMeta ? (
        <div className="selection-quickbar-meta">
          {showIds ? <IdBadge id={element.elementId} /> : null}
        </div>
      ) : null}
      <div className="selection-quickbar-fields">
        <ElementQuickBarFields
          customShapeEditActive={customShapeEditActive}
          element={element}
          onChangeProps={onChangeProps}
          onToggleCustomShapeClosed={onToggleCustomShapeClosed}
          onToggleCustomShapeEdit={onToggleCustomShapeEdit}
        />
        <div className="quickbar-divider" />
        <button
          className="quickbar-toggle"
          aria-label="앞으로 보내기"
          title="앞으로 보내기"
          type="button"
          onClick={() => onChangeFrame({ zIndex: element.zIndex + 1 })}
        >
          <ArrowUp size={16} />
        </button>
        <button
          className="quickbar-toggle"
          aria-label="뒤로 보내기"
          title="뒤로 보내기"
          type="button"
          onClick={() => onChangeFrame({ zIndex: Math.max(0, element.zIndex - 1) })}
        >
          <ArrowDown size={16} />
        </button>
        {canvas ? (
          <>
            <button
              className="quickbar-toggle"
              aria-label="가로 가운데 정렬"
              title="가로 가운데 정렬"
              type="button"
              onClick={() =>
                onChangeFrame({ x: Math.round((canvas.width - element.width) / 2) })
              }
            >
              <AlignCenter size={16} />
            </button>
            <button
              className="quickbar-action-chip"
              type="button"
              onClick={() =>
                onChangeFrame({ y: Math.round((canvas.height - element.height) / 2) })
              }
            >
              세로 가운데
            </button>
          </>
        ) : null}
        <PropertyNumberField
          className="compact-property-field compact-property-field-sm"
          label="회전"
          onCommit={(value) => onChangeFrame({ rotation: value })}
          value={element.rotation}
        />
        {showOpacityControl ? (
          <PropertyNumberField
            className="compact-property-field compact-property-field-sm"
            label="투명도"
            max={1}
            min={0}
            step="0.05"
            onCommit={(value) => onChangeFrame({ opacity: value })}
            value={element.opacity}
          />
        ) : null}
        <button
          className={`quickbar-toggle ${element.locked ? "active" : ""}`}
          aria-label={element.locked ? "잠금 해제" : "잠금"}
          title={element.locked ? "잠금 해제" : "잠금"}
          type="button"
          onClick={() => onChangeFrame({ locked: !element.locked })}
        >
          {element.locked ? <Lock size={16} /> : <LockOpen size={16} />}
        </button>
        <button
          className={`quickbar-toggle ${element.visible ? "active" : ""}`}
          aria-label={element.visible ? "숨기기" : "표시"}
          title={element.visible ? "숨기기" : "표시"}
          type="button"
          onClick={() => onChangeFrame({ visible: !element.visible })}
        >
          {element.visible ? <Eye size={16} /> : <EyeOff size={16} />}
        </button>
        {element.type === "image" || element.type === "svg" ? (
          <span className="quickbar-inline-hint">
            우클릭해 이미지를 바꿀 수 있습니다
          </span>
        ) : null}
        <div className="quickbar-divider" />
        <span className={`quickbar-status-pill ${animationSummary.tone}`}>
          {animationSummary.label}
        </span>
        <button
          className="quickbar-action-chip"
          type="button"
          onClick={onOpenAnimationEditor}
        >
          <span>애니메이션 편집</span>
          <PenLine aria-hidden="true" size={14} />
        </button>
      </div>
    </section>
  );
}

function ElementQuickBarFields(props: {
  customShapeEditActive: boolean;
  element: DeckElement;
  onChangeProps: (props: Record<string, unknown>) => void;
  onToggleCustomShapeClosed: () => void;
  onToggleCustomShapeEdit: () => void;
}) {
  const {
    customShapeEditActive,
    element,
    onChangeProps,
    onToggleCustomShapeClosed,
    onToggleCustomShapeEdit
  } = props;

  if (element.type === "text") {
    const textProps = element.props as TextElementProps;
    const textStyleValues = getEffectiveTextQuickBarStyle(textProps);

    return (
      <>
        <PropertyNumberField
          className="compact-property-field compact-property-field-sm"
          label="크기"
          min={1}
          onCommit={(value) =>
            onChangeProps(buildTextStylePropsPatch(element, { fontSize: value }))
          }
          value={textStyleValues.fontSize}
        />
        <PropertyColorField
          className="compact-property-field compact-property-field-color"
          label="글자색"
          value={textStyleValues.color}
          onCommit={(value) =>
            onChangeProps(buildTextStylePropsPatch(element, { color: value }))
          }
        />
        <QuickBarSelectField
          className="compact-property-field compact-property-field-sm"
          label="굵기"
          options={[
            { label: "보통", value: "normal" },
            { label: "중간", value: "medium" },
            { label: "세미", value: "semibold" },
            { label: "굵게", value: "bold" }
          ]}
          value={String(textStyleValues.fontWeight)}
          onChange={(value) =>
            onChangeProps(
              buildTextStylePropsPatch(element, {
                fontWeight: value as TextElementProps["fontWeight"]
              })
            )
          }
        />
        <QuickBarSelectField
          className="compact-property-field compact-property-field-sm"
          label="정렬(가로)"
          options={[
            { label: "왼쪽", value: "left" },
            { label: "가운데", value: "center" },
            { label: "오른쪽", value: "right" },
            { label: "양쪽", value: "justify" }
          ]}
          value={textStyleValues.align}
          onChange={(value) =>
            onChangeProps(
              buildTextStylePropsPatch(element, {
                align: value as TextElementProps["align"]
              })
            )
          }
        />
        <QuickBarSelectField
          className="compact-property-field compact-property-field-sm"
          label="정렬(세로)"
          options={[
            { label: "위", value: "top" },
            { label: "가운데", value: "middle" },
            { label: "아래", value: "bottom" }
          ]}
          value={textProps.verticalAlign}
          onChange={(value) => onChangeProps({ verticalAlign: value })}
        />
        <button
          className="quickbar-action-chip"
          type="button"
          onClick={() =>
            onChangeProps(
              buildTextStylePropsPatch(element, createShrinkToFitTextProps(element))
            )
          }
        >
          맞춤 축소
        </button>
      </>
    );
  }

  if (
    element.type === "rect" ||
    element.type === "ellipse" ||
    element.type === "line" ||
    element.type === "arrow" ||
    element.type === "polygon" ||
    element.type === "star" ||
    element.type === "ring"
  ) {
    const shapeProps = element.props as ShapeElementProps & { sides?: number };

    return (
      <>
        <PropertyColorField
          className="compact-property-field compact-property-field-color"
          label="채우기"
          value={solidPaintForControl(shapeProps.fill, "#dbeafe")}
          onCommit={(value) => onChangeProps({ fill: value })}
        />
        <PropertyColorField
          className="compact-property-field compact-property-field-color"
          label="선 색"
          value={
            solidPaintForControl(shapeProps.stroke, "#2563eb")
          }
          onCommit={(value) => onChangeProps({ stroke: value })}
        />
        <PropertyNumberField
          className="compact-property-field compact-property-field-sm"
          label="두께"
          min={0}
          onCommit={(value) => onChangeProps({ strokeWidth: value })}
          value={shapeProps.strokeWidth}
        />
        {element.type === "rect" ? (
          <PropertyNumberField
            className="compact-property-field compact-property-field-sm"
            label="둥글기"
            min={0}
            onCommit={(value) => onChangeProps({ borderRadius: value })}
            value={shapeProps.borderRadius}
          />
        ) : null}
        {element.type === "polygon" ? (
          <PropertyNumberField
            className="compact-property-field compact-property-field-sm"
            label="꼭짓점"
            max={12}
            min={3}
            onCommit={(value) =>
              onChangeProps({ sides: Math.max(3, Math.min(12, Math.round(value))) })
            }
            value={shapeProps.sides ?? 3}
          />
        ) : null}
      </>
    );
  }

  if (element.type === "group") {
    return null;
  }

  if (element.type === "customShape") {
    const customShapeProps = element.props as CustomShapeElementProps;
    const customShapeNodes = getCustomShapeNodes(customShapeProps);

    return (
      <>
        <button
          className={`quickbar-action-chip ${customShapeEditActive ? "active" : ""}`}
          type="button"
          onClick={onToggleCustomShapeEdit}
        >
          <PenLine size={14} />
          노드 편집
        </button>
        <button
          className={`quickbar-action-chip ${customShapeProps.closed ? "active" : ""}`}
          type="button"
          onClick={onToggleCustomShapeClosed}
        >
          경로 닫기
        </button>
        <PropertyColorField
          className="compact-property-field compact-property-field-color"
          label="채우기"
          value={getCustomShapePaint(customShapeProps, "fill", "#f5edff")}
          onCommit={(value) => onChangeProps({ fill: value })}
        />
        <PropertyColorField
          className="compact-property-field compact-property-field-color"
          label="선 색"
          value={getCustomShapePaint(customShapeProps, "stroke", "#9333ea")}
          onCommit={(value) => onChangeProps({ stroke: value })}
        />
        <PropertyNumberField
          className="compact-property-field compact-property-field-sm"
          label="두께"
          min={0}
          onCommit={(value) => onChangeProps({ strokeWidth: value })}
          value={getCustomShapeStrokeWidth(customShapeProps)}
        />
        <span className="quickbar-inline-hint">
          {customShapeNodes.length > 0
            ? "점 선택 후 드래그, 더블클릭으로 코너/곡선 전환"
            : "노드 정보가 없는 도형입니다"}
        </span>
      </>
    );
  }

  if (element.type === "image" || element.type === "svg") {
    const imageProps = element.props as ImageElementProps;

    return (
      <>
        <QuickBarSelectField
          className="compact-property-field compact-property-field-sm"
          label="채우기"
          options={[
            { label: "맞춤", value: "contain" },
            { label: "채우기", value: "cover" },
            { label: "늘리기", value: "stretch" }
          ]}
          value={imageProps.fit}
          onChange={(value) => onChangeProps({ fit: value })}
        />
        <PropertyTextField
          className="compact-property-field compact-property-field-lg"
          label="대체 텍스트"
          value={imageProps.alt}
          onCommit={(value) => onChangeProps({ alt: value })}
        />
        <PropertyNumberField
          className="compact-property-field compact-property-field-sm"
          label="초점 X"
          max={1}
          min={0}
          step="0.05"
          value={imageProps.focusX ?? 0.5}
          onCommit={(value) => onChangeProps({ focusX: clampUnit(value) })}
        />
        <PropertyNumberField
          className="compact-property-field compact-property-field-sm"
          label="초점 Y"
          max={1}
          min={0}
          step="0.05"
          value={imageProps.focusY ?? 0.5}
          onCommit={(value) => onChangeProps({ focusY: clampUnit(value) })}
        />
      </>
    );
  }

  if (element.type === "table") {
    const tableProps = element.props as TableElementProps;

    return (
      <>
        <PropertyTextAreaField
          className="compact-property-field compact-property-field-table"
          label="표 내용"
          value={tableDataDraft(tableProps)}
          onCommit={(value) =>
            onChangeProps(parseTableDataDraft(value, tableProps, element.width, element.height))
          }
        />
        <PropertyColorField
          className="compact-property-field compact-property-field-color"
          label="선"
          value={tableProps.borderColor ?? "#CBD5E1"}
          onCommit={(value) => onChangeProps({ borderColor: value })}
        />
        <PropertyNumberField
          className="compact-property-field compact-property-field-sm"
          label="선두께"
          min={0}
          onCommit={(value) => onChangeProps({ borderWidth: value })}
          value={tableProps.borderWidth ?? 1}
        />
        <span className="quickbar-inline-hint">
          행은 줄바꿈, 셀은 탭으로 구분합니다.
        </span>
      </>
    );
  }

  if (element.type === "chart") {
    const chart = element.props as Chart;

    return (
      <>
        <PropertyTextField
          className="compact-property-field compact-property-field-lg"
          label="제목"
          value={chart.title}
          onCommit={(value) => onChangeProps({ title: value })}
        />
        <QuickBarSelectField
          className="compact-property-field compact-property-field-sm"
          label="종류"
          options={[
            { label: "막대", value: "bar" },
            { label: "선", value: "line" },
            { label: "원형", value: "pie" },
            { label: "도넛", value: "doughnut" },
            { label: "산점도", value: "scatter" }
          ]}
          value={chart.type}
          onChange={(value) =>
            onChangeProps(chartTypePatch(chart, value as ChartType))
          }
        />
        <PropertyTextField
          className="compact-property-field compact-property-field-lg"
          label="데이터"
          value={chartDataDraft(chart)}
          onCommit={(value) => onChangeProps({ data: parseChartDataDraft(value, chart.type) })}
        />
        <PropertyColorField
          className="compact-property-field compact-property-field-color"
          label="색상"
          value={chart.style.colors[0] ?? "#2563eb"}
          onCommit={(value) =>
            onChangeProps({
              style: {
                ...chart.style,
                colors: [value, ...chart.style.colors.slice(1)]
              }
            })
          }
        />
      </>
    );
  }

  return null;
}

export function createShrinkToFitTextProps(
  element: Extract<DeckElement, { type: "text" }>
) {
  const lineHeight = Math.min(element.props.lineHeight, 1.15);
  const minFontSize = 8;

  for (
    let fontSize = Math.floor(element.props.fontSize);
    fontSize >= minFontSize;
    fontSize -= 1
  ) {
    if (estimateTextHeight(element.props.text, element.width, fontSize, lineHeight) <= element.height) {
      return { fontSize, lineHeight };
    }
  }

  return { fontSize: minFontSize, lineHeight: 1.05 };
}

type TextStylePatch = Pick<
  TextElementProps,
  "align" | "color" | "fontSize" | "fontWeight" | "lineHeight"
>;

type TextQuickBarStyle = {
  align: TextElementProps["align"];
  color: string;
  fontSize: number;
  fontWeight: TextElementProps["fontWeight"];
};

export function getEffectiveTextQuickBarStyle(props: TextElementProps): TextQuickBarStyle {
  const paragraph = props.paragraphs?.find((item) => getParagraphText(item).trim().length > 0);
  const paragraphRun =
    paragraph?.runs?.find((run) => run.text.trim().length > 0) ?? paragraph?.runs?.[0];
  const run = props.runs?.find((item) => item.text.trim().length > 0) ?? props.runs?.[0];

  return {
    align: paragraph?.align ?? props.align,
    color: paragraphRun?.color ?? paragraph?.color ?? run?.color ?? props.color ?? "#111827",
    fontSize:
      paragraphRun?.fontSize ?? paragraph?.fontSize ?? run?.fontSize ?? props.fontSize,
    fontWeight:
      paragraphRun?.fontWeight ??
      paragraph?.fontWeight ??
      run?.fontWeight ??
      props.fontWeight
  };
}

export function buildTextStylePropsPatch(
  element: Extract<DeckElement, { type: "text" }>,
  patch: Partial<TextStylePatch>
) {
  const nextPatch: Record<string, unknown> = { ...patch };

  if (element.props.runs?.length) {
    nextPatch.runs = element.props.runs.map((run) => ({
      ...run,
      ...(patch.color !== undefined ? { color: patch.color } : {}),
      ...(patch.fontSize !== undefined ? { fontSize: patch.fontSize } : {}),
      ...(patch.fontWeight !== undefined ? { fontWeight: patch.fontWeight } : {})
    }));
  }

  if (element.props.paragraphs?.length) {
    nextPatch.paragraphs = element.props.paragraphs.map((paragraph) =>
      patchParagraphTextStyle(paragraph, patch)
    );
  }

  return nextPatch;
}

function patchParagraphTextStyle(
  paragraph: TextElementParagraph,
  patch: Partial<TextStylePatch>
) {
  return {
    ...paragraph,
    ...(patch.align !== undefined ? { align: patch.align } : {}),
    ...(patch.color !== undefined ? { color: patch.color } : {}),
    ...(patch.fontSize !== undefined ? { fontSize: patch.fontSize } : {}),
    ...(patch.fontWeight !== undefined ? { fontWeight: patch.fontWeight } : {}),
    ...(patch.lineHeight !== undefined ? { lineHeight: patch.lineHeight } : {}),
    ...(paragraph.runs?.length
      ? {
          runs: paragraph.runs.map((run) => ({
            ...run,
            ...(patch.color !== undefined ? { color: patch.color } : {}),
            ...(patch.fontSize !== undefined ? { fontSize: patch.fontSize } : {}),
            ...(patch.fontWeight !== undefined ? { fontWeight: patch.fontWeight } : {})
          }))
        }
      : {})
  };
}

function getParagraphText(paragraph: TextElementParagraph) {
  if (paragraph.runs?.length) {
    return paragraph.runs.map((run) => run.text).join("");
  }

  return paragraph.text;
}

function estimateTextHeight(
  text: string,
  width: number,
  fontSize: number,
  lineHeight: number
) {
  const characterWidth = Math.max(1, fontSize * 0.56);
  const charactersPerLine = Math.max(1, Math.floor(width / characterWidth));
  const lineCount = text
    .split("\n")
    .reduce(
      (sum, line) => sum + Math.max(1, Math.ceil(line.length / charactersPerLine)),
      0
    );

  return lineCount * fontSize * lineHeight;
}

function clampUnit(value: number) {
  return Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0.5));
}

function chartTypePatch(chart: Chart, type: ChartType) {
  return {
    type,
    data: convertChartData(chart, type)
  };
}

function convertChartData(chart: Chart, type: ChartType): Array<Record<string, number | string>> {
  if (type === "scatter") {
    return chart.data.map((datum, index) => ({
      label: datum.label ?? `P${index + 1}`,
      x: "x" in datum ? datum.x : index + 1,
      y: "y" in datum ? datum.y : "value" in datum ? datum.value : 0
    }));
  }

  return chart.data.map((datum, index) => ({
    label: datum.label ?? `항목 ${index + 1}`,
    value: "value" in datum ? datum.value : datum.y
  }));
}

function chartDataDraft(chart: Chart) {
  if (chart.type === "scatter") {
    return chart.data
      .map((datum, index) => `${datum.label ?? `P${index + 1}`}:${datum.x}:${datum.y}`)
      .join(", ");
  }

  return chart.data
    .map((datum) => `${datum.label}:${datum.value}`)
    .join(", ");
}

function parseChartDataDraft(value: string, type: ChartType): Array<Record<string, number | string>> {
  const entries = value
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);

  if (type === "scatter") {
    return entries.map((entry, index) => {
      const [label = `항목 ${index + 1}`, first = "0", second = "0"] = entry
        .split(":")
        .map((part) => part.trim());
      return {
        label,
        x: Number(first) || 0,
        y: Number(second) || 0
      };
    });
  }

  return entries.map((entry, index) => {
    const [label = `항목 ${index + 1}`, first = "0"] = entry
      .split(":")
      .map((part) => part.trim());
    return {
      label,
      value:
        type === "pie" || type === "doughnut"
          ? Math.max(0, Number(first) || 0)
          : Number(first) || 0
    };
  });
}

export function tableDataDraft(table: TableElementProps) {
  return table.rows
    .map((row) => row.map((cell) => cell.text).join("\t"))
    .join("\n");
}

export function parseTableDataDraft(
  value: string,
  table: TableElementProps,
  width: number,
  height: number
): Record<string, unknown> {
  const rowTexts = value
    .replace(/\r\n/g, "\n")
    .split("\n")
    .map((row) => row.split("\t"));
  const rowCount = Math.max(1, rowTexts.length);
  const columnCount = Math.max(
    1,
    rowTexts.reduce((maxColumns, row) => Math.max(maxColumns, row.length), 0)
  );
  const rows = rowTexts.map((row, rowIndex) =>
    Array.from({ length: columnCount }, (_, columnIndex) => ({
      ...getTableCellTemplate(table, rowIndex, columnIndex),
      text: row[columnIndex] ?? ""
    }))
  );

  return {
    columnWidths: normalizeTableTrackSizes(
      table.columnWidths,
      columnCount,
      width
    ),
    rowHeights: normalizeTableTrackSizes(table.rowHeights, rowCount, height),
    rows
  };
}

function getTableCellTemplate(
  table: TableElementProps,
  rowIndex: number,
  columnIndex: number
): TableCellProps {
  return {
    ...(table.rows[rowIndex]?.[columnIndex] ??
      table.rows[rowIndex]?.[0] ??
      table.rows[0]?.[columnIndex] ??
      table.rows[0]?.[0] ??
      createQuickBarTableCell())
  };
}

function normalizeTableTrackSizes(
  sizes: number[] | undefined,
  count: number,
  total: number
) {
  const fallbackSize = Math.max(1, total / Math.max(1, count));

  return Array.from({ length: count }, (_, index) =>
    Number.isFinite(sizes?.[index]) && Number(sizes?.[index]) > 0
      ? Number(sizes?.[index])
      : fallbackSize
  );
}

function createQuickBarTableCell(): TableCellProps {
  return {
    align: "left",
    borderColor: "#CBD5E1",
    borderWidth: 1,
    colSpan: 1,
    fill: "#FFFFFF",
    fontSize: 18,
    fontWeight: "normal",
    rowSpan: 1,
    text: "",
    textColor: "#111827",
    verticalAlign: "middle"
  };
}

function solidPaintForControl(paint: DeckElementPaint, fallback: string) {
  if (paint === "transparent") {
    return fallback;
  }

  if (typeof paint === "string") {
    return paint;
  }

  if (paint.type === "pattern") {
    return paint.foreground;
  }

  return paint.stops[0]?.color ?? fallback;
}

export function QuickBarSelectField(props: {
  className?: string;
  disabled?: boolean;
  label: string;
  value: string;
  options: Array<{ value: string; label: string }>;
  onChange: (value: string) => void;
}) {
  const { className, disabled = false, label, onChange, options, value } = props;

  return (
    <label className={["property-field", className].filter(Boolean).join(" ")}>
      <span>{label}</span>
      <select
        disabled={disabled}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}

export function PropertyNumberField(props: {
  className?: string;
  disabled?: boolean;
  label: string;
  min?: number;
  max?: number;
  step?: string;
  onCommit: (value: number) => boolean | void;
  value: number;
}) {
  const { className, disabled = false, label, max, min, onCommit, step = "1", value } = props;
  const [draftValue, setDraftValue] = useState(String(value));

  useEffect(() => {
    setDraftValue(String(value));
  }, [value]);

  function commitValue(nextRawValue: string) {
    const nextValue = Number(nextRawValue);

    if (Number.isFinite(nextValue)) {
      const committed = onCommit(nextValue);
      setDraftValue(String(committed === false ? value : nextValue));
      return;
    }

    setDraftValue(String(value));
  }

  return (
    <label className={["property-field", className].filter(Boolean).join(" ")}>
      <span>{label}</span>
      <input
        disabled={disabled}
        max={max}
        min={min}
        step={step}
        type="number"
        value={draftValue}
        onBlur={(event) => commitValue(event.target.value)}
        onChange={(event) => setDraftValue(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            commitValue(event.currentTarget.value);
            event.currentTarget.blur();
          }
        }}
      />
    </label>
  );
}

function PropertyTextField(props: {
  className?: string;
  label: string;
  value: string;
  onCommit: (value: string) => void;
}) {
  const { className, label, onCommit, value } = props;
  const [draftValue, setDraftValue] = useState(value);

  useEffect(() => {
    setDraftValue(value);
  }, [value]);

  function commitValue(nextValue: string) {
    onCommit(nextValue);
    setDraftValue(nextValue);
  }

  return (
    <label className={["property-field", className].filter(Boolean).join(" ")}>
      <span>{label}</span>
      <input
        type="text"
        value={draftValue}
        onBlur={(event) => commitValue(event.target.value)}
        onChange={(event) => setDraftValue(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            commitValue(event.currentTarget.value);
            event.currentTarget.blur();
          }
        }}
      />
    </label>
  );
}

function PropertyTextAreaField(props: {
  className?: string;
  label: string;
  value: string;
  onCommit: (value: string) => void;
}) {
  const { className, label, onCommit, value } = props;
  const [draftValue, setDraftValue] = useState(value);

  useEffect(() => {
    setDraftValue(value);
  }, [value]);

  function commitValue(nextValue: string) {
    onCommit(nextValue);
    setDraftValue(nextValue);
  }

  return (
    <label className={["property-field", className].filter(Boolean).join(" ")}>
      <span>{label}</span>
      <textarea
        rows={2}
        value={draftValue}
        onBlur={(event) => commitValue(event.target.value)}
        onChange={(event) => setDraftValue(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
            commitValue(event.currentTarget.value);
            event.currentTarget.blur();
          }
        }}
      />
    </label>
  );
}

function PropertyColorField(props: {
  className?: string;
  label: string;
  value: string;
  onCommit: (value: string) => void;
}) {
  const { className, label, onCommit, value } = props;
  const [draftValue, setDraftValue] = useState(value);

  useEffect(() => {
    setDraftValue(value);
  }, [value]);

  function commitValue(nextValue: string) {
    if (nextValue === value) {
      setDraftValue(nextValue);
      return;
    }

    onCommit(nextValue);
    setDraftValue(nextValue);
  }

  return (
    <label className={["property-field", className].filter(Boolean).join(" ")}>
      <span>{label}</span>
      <input
        type="color"
        value={draftValue}
        onChange={(event) => {
          const nextValue = event.target.value;
          setDraftValue(nextValue);
          commitValue(nextValue);
        }}
      />
    </label>
  );
}
