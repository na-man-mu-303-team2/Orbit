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
  TextElementProps,
} from "@orbit/shared";
import {
  IconAlignBoxCenterBottom as AlignBottom,
  IconAlignBoxCenterMiddle as AlignMiddle,
  IconAlignBoxCenterTop as AlignTop,
  IconAlignBoxLeftMiddle as AlignLeft,
  IconAlignBoxRightMiddle as AlignRight,
  IconArrowBarToDown as ArrowToBack,
  IconArrowBarToUp as ArrowToFront,
  IconArrowDown as ArrowDown,
  IconArrowUp as ArrowUp,
  IconArrowsMinimize as Shrink,
  IconCircleCheck as ClosePath,
  IconEye as Eye,
  IconEyeOff as EyeOff,
  IconPencil as PenLine,
} from "@tabler/icons-react";
import { useEffect, useState } from "react";

import {
  getCustomShapeNodes,
  getCustomShapePaint,
  getCustomShapeStrokeWidth,
} from "../../canvas/custom-shape/geometry";
import {
  getKonvaFontStyle,
  getPrimaryTextRun,
  getTextElementText,
  measureTextContentBounds,
} from "../../canvas/text/textLayout";
import type { SlideAnimationDiagnostics } from "../../../../../../../packages/editor-core/src/index";
import { resolveRedesignPalette } from "../../../../styles/redesignPalette";
import { IdBadge } from "./EditorIdBadge";
import type { ElementLayerOrderAction } from "../utils/elementLayerOrder";

type TextFitContext = {
  fontFamily?: string;
};

function useEditorPrimaryColor(fallbackColor: string) {
  const [primaryColor, setPrimaryColor] = useState(fallbackColor);

  useEffect(() => {
    const editorShell = document.querySelector<HTMLElement>(
      ".orbit-shell.editor-professional",
    );
    if (!editorShell) return;

    const palette = resolveRedesignPalette(editorShell);
    if (palette) {
      setPrimaryColor(palette.primary);
    }
  }, []);

  return primaryColor;
}

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
    visible?: boolean;
  }) => void;
  onChangeLayerOrder?: (action: ElementLayerOrderAction) => void;
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
  const editorPrimaryColor = useEditorPrimaryColor(
    props.theme?.palette.primary ??
      props.theme?.accentColor ??
      props.slide?.style.accentColor ??
      "",
  );
  const {
    animationDiagnostics,
    customShapeEditActive,
    canvas,
    element,
    onChangeFrame,
    onChangeLayerOrder,
    onChangeProps,
    onChangeSlideStyle,
    onChangeTheme,
    onDeleteAnimation,
    onToggleCustomShapeClosed,
    onToggleCustomShapeEdit,
    showIds,
    slide,
    theme,
  } = props;

  if (!element && !slide) {
    return null;
  }

  if (!element && slide) {
    const danglingAnimations = animationDiagnostics.danglingAnimations
      .map((diagnostic) =>
        slide.animations.find(
          (animation) => animation.animationId === diagnostic.animationId,
        ),
      )
      .filter(Boolean) as DeckAnimation[];

    return (
      <section
        className="selection-quickbar"
        data-testid="editor-slide-quickbar"
      >
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
            value={slide.style.accentColor ?? editorPrimaryColor}
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
            value={theme?.accentColor ?? editorPrimaryColor}
            onCommit={(value) =>
              onChangeTheme({ accentColor: value, palette: { primary: value } })
            }
          />
          <PropertyNumberField
            className="compact-property-field compact-property-field-sm"
            label="본문 크기"
            min={8}
            onCommit={(value) =>
              onChangeTheme({ typography: { bodySize: value } })
            }
            value={theme?.typography.bodySize ?? 26}
          />
          <PropertyNumberField
            className="compact-property-field compact-property-field-sm"
            label="둥글기"
            min={0}
            onCommit={(value) =>
              onChangeTheme({ effects: { borderRadius: value } })
            }
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

  const showMeta = showIds;
  return (
    <section
      className="selection-quickbar element-property-inspector"
      data-testid="editor-element-quickbar"
    >
      {showMeta ? (
        <div className="selection-quickbar-meta">
          {showIds ? <IdBadge id={element.elementId} /> : null}
        </div>
      ) : null}
      <header className="element-property-inspector-header">
        <strong>{getElementTypeLabel(element.type)}</strong>
        <button
          className={`quickbar-toggle ${element.visible ? "active" : ""}`}
          aria-label={element.visible ? "숨기기" : "표시"}
          title={element.visible ? "숨기기" : "표시"}
          type="button"
          onClick={() => onChangeFrame({ visible: !element.visible })}
        >
          {element.visible ? <Eye size={17} /> : <EyeOff size={17} />}
        </button>
      </header>

      <div className="element-property-section">
        <h4>위치</h4>
        {canvas ? (
          <div className="element-property-control-block">
            <span className="element-property-control-label">정렬</span>
            <div className="element-property-alignment-row">
              <div
                className="element-property-segmented"
                role="group"
                aria-label="가로 정렬"
              >
                <button
                  aria-label="왼쪽 정렬"
                  className="quickbar-toggle"
                  title="왼쪽 정렬"
                  type="button"
                  onClick={() => onChangeFrame({ x: 0 })}
                >
                  <AlignLeft aria-hidden="true" size={17} />
                </button>
                <button
                  aria-label="가로 가운데 정렬"
                  className="quickbar-toggle"
                  title="가로 가운데 정렬"
                  type="button"
                  onClick={() =>
                    onChangeFrame({
                      x: Math.round((canvas.width - element.width) / 2),
                    })
                  }
                >
                  <AlignMiddle aria-hidden="true" size={17} />
                </button>
                <button
                  aria-label="오른쪽 정렬"
                  className="quickbar-toggle"
                  title="오른쪽 정렬"
                  type="button"
                  onClick={() =>
                    onChangeFrame({
                      x: Math.max(0, Math.round(canvas.width - element.width)),
                    })
                  }
                >
                  <AlignRight aria-hidden="true" size={17} />
                </button>
              </div>
              <div
                className="element-property-segmented"
                role="group"
                aria-label="세로 정렬"
              >
                <button
                  aria-label="위쪽 정렬"
                  className="quickbar-toggle"
                  title="위쪽 정렬"
                  type="button"
                  onClick={() => onChangeFrame({ y: 0 })}
                >
                  <AlignTop aria-hidden="true" size={17} />
                </button>
                <button
                  aria-label="세로 가운데 정렬"
                  className="quickbar-toggle"
                  title="세로 가운데 정렬"
                  type="button"
                  onClick={() =>
                    onChangeFrame({
                      y: Math.round((canvas.height - element.height) / 2),
                    })
                  }
                >
                  <AlignMiddle aria-hidden="true" size={17} />
                </button>
                <button
                  aria-label="아래쪽 정렬"
                  className="quickbar-toggle"
                  title="아래쪽 정렬"
                  type="button"
                  onClick={() =>
                    onChangeFrame({
                      y: Math.max(
                        0,
                        Math.round(canvas.height - element.height),
                      ),
                    })
                  }
                >
                  <AlignBottom aria-hidden="true" size={17} />
                </button>
              </div>
            </div>
          </div>
        ) : null}
        <div className="element-property-grid">
          <PropertyNumberField
            className="compact-property-field"
            label="X"
            min={0}
            onCommit={(value) => onChangeFrame({ x: Math.max(0, value) })}
            value={Math.round(element.x)}
          />
          <PropertyNumberField
            className="compact-property-field"
            label="Y"
            min={0}
            onCommit={(value) => onChangeFrame({ y: Math.max(0, value) })}
            value={Math.round(element.y)}
          />
        </div>
        <div className="element-property-grid element-property-grid-actions">
          <PropertyNumberField
            className="compact-property-field"
            label="회전"
            onCommit={(value) => onChangeFrame({ rotation: value })}
            value={element.rotation}
          />
          <div
            className="element-property-layer-actions"
            role="group"
            aria-label="레이어 순서"
          >
            <button
              aria-label="맨 앞으로 가져오기"
              className="quickbar-toggle"
              title="맨 앞으로 가져오기"
              type="button"
              onClick={() => onChangeLayerOrder?.("bring-to-front")}
            >
              <ArrowToFront aria-hidden="true" size={17} />
            </button>
            <button
              aria-label="앞으로 가져오기"
              className="quickbar-toggle"
              title="앞으로 가져오기"
              type="button"
              onClick={() => onChangeLayerOrder?.("bring-forward")}
            >
              <ArrowUp aria-hidden="true" size={17} />
            </button>
            <button
              aria-label="뒤로 가져오기"
              className="quickbar-toggle"
              title="뒤로 가져오기"
              type="button"
              onClick={() => onChangeLayerOrder?.("send-backward")}
            >
              <ArrowDown aria-hidden="true" size={17} />
            </button>
            <button
              aria-label="맨 뒤로 보내기"
              className="quickbar-toggle"
              title="맨 뒤로 보내기"
              type="button"
              onClick={() => onChangeLayerOrder?.("send-to-back")}
            >
              <ArrowToBack aria-hidden="true" size={17} />
            </button>
          </div>
        </div>
      </div>

      <div className="element-property-section">
        <h4>레이아웃</h4>
        <div className="element-property-grid">
          <PropertyNumberField
            className="compact-property-field"
            label="W"
            min={1}
            onCommit={(value) => onChangeFrame({ width: Math.max(1, value) })}
            value={Math.round(element.width)}
          />
          <PropertyNumberField
            className="compact-property-field"
            label="H"
            min={1}
            onCommit={(value) => onChangeFrame({ height: Math.max(1, value) })}
            value={Math.round(element.height)}
          />
        </div>
      </div>

      <div className="element-property-section">
        <h4>외형</h4>
        <div className="element-property-grid">
          <PropertyNumberField
            className="compact-property-field"
            label="불투명도 (%)"
            max={100}
            min={0}
            onCommit={(value) =>
              onChangeFrame({
                opacity: Math.max(0, Math.min(100, value)) / 100,
              })
            }
            value={Math.round(element.opacity * 100)}
          />
          {element.type === "rect" ? (
            <PropertyNumberField
              className="compact-property-field"
              label="모서리 반경"
              min={0}
              onCommit={(value) => onChangeProps({ borderRadius: value })}
              value={(element.props as ShapeElementProps).borderRadius}
            />
          ) : null}
        </div>
      </div>

      {element.type !== "group" ? (
        <div className="element-property-section">
          <h4>{getElementContentSectionLabel(element.type)}</h4>
          <div className="selection-quickbar-fields element-property-content-fields">
            <ElementQuickBarFields
              customShapeEditActive={customShapeEditActive}
              element={element}
              onChangeProps={onChangeProps}
              onToggleCustomShapeClosed={onToggleCustomShapeClosed}
              onToggleCustomShapeEdit={onToggleCustomShapeEdit}
              primaryColor={editorPrimaryColor}
            />
          </div>
        </div>
      ) : null}
    </section>
  );
}

function getElementTypeLabel(type: DeckElement["type"]) {
  const labels: Record<DeckElement["type"], string> = {
    arrow: "화살표",
    chart: "차트",
    customShape: "사용자 도형",
    ellipse: "타원",
    group: "그룹",
    image: "이미지",
    line: "선",
    polygon: "다각형",
    rect: "직사각형",
    ring: "링",
    star: "별",
    svg: "SVG",
    table: "표",
    text: "텍스트",
  };

  return labels[type];
}

function getElementContentSectionLabel(type: DeckElement["type"]) {
  if (type === "text") return "텍스트";
  if (type === "image" || type === "svg") return "이미지";
  if (type === "table") return "표";
  if (type === "chart") return "차트";
  return "채우기";
}

function ElementQuickBarFields(props: {
  customShapeEditActive: boolean;
  element: DeckElement;
  onChangeProps: (props: Record<string, unknown>) => void;
  onToggleCustomShapeClosed: () => void;
  onToggleCustomShapeEdit: () => void;
  primaryColor: string;
}) {
  const {
    customShapeEditActive,
    element,
    onChangeProps,
    onToggleCustomShapeClosed,
    onToggleCustomShapeEdit,
    primaryColor,
  } = props;

  if (element.type === "text") {
    const textProps = element.props as TextElementProps;

    return (
      <>
        <PropertyNumberField
          className="compact-property-field compact-property-field-sm"
          label="크기"
          min={1}
          onCommit={(value) => onChangeProps({ fontSize: value })}
          value={textProps.fontSize}
        />
        <PropertyColorField
          className="compact-property-field compact-property-field-color"
          label="글자색"
          value={textProps.color ?? "#111827"}
          onCommit={(value) => onChangeProps({ color: value })}
        />
        <QuickBarSelectField
          className="compact-property-field compact-property-field-sm"
          label="굵기"
          options={[
            { label: "보통", value: "normal" },
            { label: "중간", value: "medium" },
            { label: "세미", value: "semibold" },
            { label: "굵게", value: "bold" },
          ]}
          value={String(textProps.fontWeight)}
          onChange={(value) => onChangeProps({ fontWeight: value })}
        />
        <QuickBarSelectField
          className="compact-property-field compact-property-field-sm"
          label="정렬(가로)"
          options={[
            { label: "왼쪽", value: "left" },
            { label: "가운데", value: "center" },
            { label: "오른쪽", value: "right" },
            { label: "양쪽", value: "justify" },
          ]}
          value={textProps.align}
          onChange={(value) => onChangeProps({ align: value })}
        />
        <QuickBarSelectField
          className="compact-property-field compact-property-field-sm"
          label="정렬(세로)"
          options={[
            { label: "위", value: "top" },
            { label: "가운데", value: "middle" },
            { label: "아래", value: "bottom" },
          ]}
          value={textProps.verticalAlign}
          onChange={(value) => onChangeProps({ verticalAlign: value })}
        />
        <button
          aria-label="텍스트 맞춤 축소"
          className="quickbar-toggle"
          title="맞춤 축소"
          type="button"
          onClick={() => onChangeProps(createShrinkToFitTextProps(element))}
        >
          <Shrink aria-hidden="true" size={16} />
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
          value={solidPaintForControl(shapeProps.fill, primaryColor)}
          onCommit={(value) => onChangeProps({ fill: value })}
        />
        <PropertyColorField
          className="compact-property-field compact-property-field-color"
          label="선 색"
          value={solidPaintForControl(shapeProps.stroke, primaryColor)}
          onCommit={(value) => onChangeProps({ stroke: value })}
        />
        <PropertyNumberField
          className="compact-property-field compact-property-field-sm"
          label="두께"
          min={0}
          onCommit={(value) => onChangeProps({ strokeWidth: value })}
          value={shapeProps.strokeWidth}
        />
        {element.type === "polygon" ? (
          <PropertyNumberField
            className="compact-property-field compact-property-field-sm"
            label="꼭짓점"
            max={12}
            min={3}
            onCommit={(value) =>
              onChangeProps({
                sides: Math.max(3, Math.min(12, Math.round(value))),
              })
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
          aria-label="노드 편집"
          className={`quickbar-action-chip ${customShapeEditActive ? "active" : ""}`}
          title="노드 편집"
          type="button"
          onClick={onToggleCustomShapeEdit}
        >
          <PenLine aria-hidden="true" size={15} />
        </button>
        <button
          aria-label={customShapeProps.closed ? "경로 열기" : "경로 닫기"}
          className={`quickbar-action-chip ${customShapeProps.closed ? "active" : ""}`}
          title={customShapeProps.closed ? "경로 열기" : "경로 닫기"}
          type="button"
          onClick={onToggleCustomShapeClosed}
        >
          <ClosePath aria-hidden="true" size={15} />
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
            { label: "늘리기", value: "stretch" },
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
            onChangeProps(
              parseTableDataDraft(
                value,
                tableProps,
                element.width,
                element.height,
              ),
            )
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
            { label: "산점도", value: "scatter" },
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
          onCommit={(value) =>
            onChangeProps({ data: parseChartDataDraft(value, chart.type) })
          }
        />
        <PropertyColorField
          className="compact-property-field compact-property-field-color"
          label="색상"
          value={chart.style.colors[0] ?? primaryColor}
          onCommit={(value) =>
            onChangeProps({
              style: {
                ...chart.style,
                colors: [value, ...chart.style.colors.slice(1)],
              },
            })
          }
        />
      </>
    );
  }

  return null;
}

export function createShrinkToFitTextProps(
  element: Extract<DeckElement, { type: "text" }>,
  context: TextFitContext = {},
) {
  const lineHeight = Math.min(element.props.lineHeight, 1.15);
  const minFontSize = 8;
  const text = getTextElementText(element.props as TextElementProps);
  const baseProps = createPlainTextFitProps(element, text);

  for (
    let fontSize = Math.floor(getTextFitFontSize(element));
    fontSize >= minFontSize;
    fontSize -= 1
  ) {
    if (
      measureTextHeight(element, {
        ...context,
        fontSize,
        lineHeight,
        text,
        width: element.width,
      }) <= Math.max(1, element.height - 8)
    ) {
      return { ...baseProps, fontSize, lineHeight };
    }
  }

  return { ...baseProps, fontSize: minFontSize, lineHeight: 1.05 };
}

export function createExpandTextWidthToFitFrame(
  element: Extract<DeckElement, { type: "text" }>,
  maxWidth: number,
  context: TextFitContext = {},
) {
  const targetHeight = Math.max(1, element.height - 8);
  const startWidth = Math.ceil(element.width);
  const safeMaxWidth = Math.max(startWidth, Math.floor(maxWidth));
  const text = getTextElementText(element.props as TextElementProps);

  for (let width = startWidth; width <= safeMaxWidth; width += 1) {
    if (
      measureTextHeight(element, {
        ...context,
        fontSize: element.props.fontSize,
        lineHeight: element.props.lineHeight,
        text,
        width,
      }) <= targetHeight
    ) {
      return width;
    }
  }

  return null;
}

export function createSingleLineTextFit(
  element: Extract<DeckElement, { type: "text" }>,
  context: TextFitContext = {},
  options: { maxWidth?: number; minFontSize?: number } = {},
) {
  const text = getTextElementText(element.props as TextElementProps).replace(
    /\s*\n\s*/g,
    " ",
  );
  const maxWidth = options.maxWidth ?? 10000;
  const effectiveFontSize = getTextFitFontSize(element);
  const minFontSize = Math.min(
    Math.floor(effectiveFontSize),
    options.minFontSize ?? 8,
  );
  const lineHeight = Math.min(element.props.lineHeight, 1.15);
  const measured = measureTextContentBounds({
    align: element.props.align,
    fontFamily: getTextFitFontFamily(element, context),
    fontSize: effectiveFontSize,
    fontStyle: getTextFitFontStyle(element),
    lineHeight: element.props.lineHeight,
    text,
    width: 10000,
  });
  const width = Math.max(
    Math.ceil(element.width),
    Math.min(Math.ceil(maxWidth), Math.ceil(measured.width) + 8),
  );
  const props = createPlainTextFitProps(element, text);
  let fits = false;

  for (
    let fontSize = Math.floor(effectiveFontSize);
    fontSize >= minFontSize;
    fontSize -= 1
  ) {
    const metrics = measureTextContentBounds({
      align: element.props.align,
      fontFamily: getTextFitFontFamily(element, context),
      fontSize,
      fontStyle: getTextFitFontStyle(element),
      lineHeight,
      text,
      width: Math.max(1, width - 8),
    });

    if (
      metrics.lineCount <= 1 &&
      metrics.height <= Math.max(1, element.height - 8)
    ) {
      props.fontSize = fontSize;
      props.lineHeight = lineHeight;
      fits = true;
      break;
    }
  }

  return {
    fits,
    props,
    text,
    width,
  };
}

function measureTextHeight(
  element: Extract<DeckElement, { type: "text" }>,
  args: TextFitContext & {
    fontSize: number;
    lineHeight: number;
    text: string;
    width: number;
  },
) {
  return measureTextContentBounds({
    align: element.props.align,
    fontFamily: getTextFitFontFamily(element, args),
    fontSize: args.fontSize,
    fontStyle: getTextFitFontStyle(element),
    lineHeight: args.lineHeight,
    text: args.text,
    width: Math.max(1, args.width - 8),
  }).height;
}

function getTextFitFontFamily(
  element: Extract<DeckElement, { type: "text" }>,
  context: TextFitContext,
) {
  return (
    getPrimaryTextRun(element.props as TextElementProps)?.fontFamily ??
    context.fontFamily ??
    element.props.fontFamily ??
    "Arial"
  );
}

function getTextFitFontSize(element: Extract<DeckElement, { type: "text" }>) {
  return (
    getPrimaryTextRun(element.props as TextElementProps)?.fontSize ??
    element.props.fontSize
  );
}

function getTextFitFontStyle(element: Extract<DeckElement, { type: "text" }>) {
  return getKonvaFontStyle(
    getPrimaryTextRun(element.props as TextElementProps)?.fontWeight ??
      element.props.fontWeight,
  );
}

function createPlainTextFitProps(
  element: Extract<DeckElement, { type: "text" }>,
  text: string,
) {
  const props: Record<string, unknown> = {};
  const primaryRun = getPrimaryTextRun(element.props as TextElementProps);

  if (
    element.props.paragraphs?.length ||
    element.props.runs?.length ||
    element.props.text !== text
  ) {
    props.paragraphs = null;
    props.runs = null;
    props.text = text;
  }

  if (primaryRun?.fontFamily) {
    props.fontFamily = primaryRun.fontFamily;
  }

  if (primaryRun?.fontWeight) {
    props.fontWeight = primaryRun.fontWeight;
  }

  return props;
}

function clampUnit(value: number) {
  return Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0.5));
}

function chartTypePatch(chart: Chart, type: ChartType) {
  return {
    type,
    data: convertChartData(chart, type),
  };
}

function convertChartData(
  chart: Chart,
  type: ChartType,
): Array<Record<string, number | string>> {
  if (type === "scatter") {
    return chart.data.map((datum, index) => ({
      label: datum.label ?? `P${index + 1}`,
      x: "x" in datum ? datum.x : index + 1,
      y: "y" in datum ? datum.y : "value" in datum ? datum.value : 0,
    }));
  }

  return chart.data.map((datum, index) => ({
    label: datum.label ?? `항목 ${index + 1}`,
    ...(type === "line" && "series" in datum && datum.series
      ? { series: datum.series }
      : {}),
    value: "value" in datum ? datum.value : datum.y,
  }));
}

function chartDataDraft(chart: Chart) {
  if (chart.type === "scatter") {
    return chart.data
      .map(
        (datum, index) =>
          `${datum.label ?? `P${index + 1}`}:${datum.x}:${datum.y}`,
      )
      .join(", ");
  }

  if (chart.type === "line") {
    return chart.data
      .map(
        (datum) =>
          `${datum.series ?? "Series 1"}:${datum.label}:${datum.value}`,
      )
      .join(", ");
  }

  return chart.data
    .map((datum) => `${datum.label}:${datum.value}`)
    .join(", ");
}

function parseChartDataDraft(
  value: string,
  type: ChartType,
): Array<Record<string, number | string>> {
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
        y: Number(second) || 0,
      };
    });
  }


  if (type === "line") {
    return entries.map((entry, index) => {
      const parts = entry.split(":").map((part) => part.trim());
      const [series, label, rawValue] = parts.length >= 3
        ? parts
        : ["Series 1", parts[0] ?? `항목 ${index + 1}`, parts[1] ?? "0"];
      return { label, series, value: Number(rawValue) || 0 };
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
          : Number(first) || 0,
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
  height: number,
): Record<string, unknown> {
  const rowTexts = value
    .replace(/\r\n/g, "\n")
    .split("\n")
    .map((row) => row.split("\t"));
  const rowCount = Math.max(1, rowTexts.length);
  const columnCount = Math.max(
    1,
    rowTexts.reduce((maxColumns, row) => Math.max(maxColumns, row.length), 0),
  );
  const rows = rowTexts.map((row, rowIndex) =>
    Array.from({ length: columnCount }, (_, columnIndex) => ({
      ...getTableCellTemplate(table, rowIndex, columnIndex),
      text: row[columnIndex] ?? "",
    })),
  );

  return {
    columnWidths: normalizeTableTrackSizes(
      table.columnWidths,
      columnCount,
      width,
    ),
    rowHeights: normalizeTableTrackSizes(table.rowHeights, rowCount, height),
    rows,
  };
}

function getTableCellTemplate(
  table: TableElementProps,
  rowIndex: number,
  columnIndex: number,
): TableCellProps {
  return {
    ...(table.rows[rowIndex]?.[columnIndex] ??
      table.rows[rowIndex]?.[0] ??
      table.rows[0]?.[columnIndex] ??
      table.rows[0]?.[0] ??
      createQuickBarTableCell()),
  };
}

function normalizeTableTrackSizes(
  sizes: number[] | undefined,
  count: number,
  total: number,
) {
  const fallbackSize = Math.max(1, total / Math.max(1, count));

  return Array.from({ length: count }, (_, index) =>
    Number.isFinite(sizes?.[index]) && Number(sizes?.[index]) > 0
      ? Number(sizes?.[index])
      : fallbackSize,
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
    verticalAlign: "middle",
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
  const {
    className,
    disabled = false,
    label,
    onChange,
    options,
    value,
  } = props;

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
  const {
    className,
    disabled = false,
    label,
    max,
    min,
    onCommit,
    step = "1",
    value,
  } = props;
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
      <span className="property-color-control">
        <input
          aria-label={`${label} 색상 선택`}
          type="color"
          value={draftValue}
          onBlur={(event) => commitValue(event.target.value)}
          onChange={(event) => setDraftValue(event.target.value)}
          onInput={(event) =>
            setDraftValue((event.target as HTMLInputElement).value)
          }
        />
        <code>{draftValue.toUpperCase()}</code>
      </span>
    </label>
  );
}
