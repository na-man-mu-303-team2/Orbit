import type {
  Chart,
  CustomShapeElementProps,
  DeckElement,
  DeckAnimation,
  ImageElementProps,
  ShapeElementProps,
  Slide,
  TextElementProps
} from "@orbit/shared";
import { Lock, LockOpen, Eye, EyeOff, PenLine } from "lucide-react";
import { useEffect, useState } from "react";

import {
  getCustomShapeNodes,
  getCustomShapePaint,
  getCustomShapeStrokeWidth
} from "../../canvas/custom-shape/geometry";
import type { SlideAnimationDiagnostics } from "../../../../../../../packages/editor-core/src/index";
import { buildAnimationSummary } from "./animation/animationUi";
import { IdBadge } from "./EditorIdBadge";

export function SelectionQuickBar(props: {
  animations: DeckAnimation[];
  animationDiagnostics: SlideAnimationDiagnostics;
  canCreateAnimation: boolean;
  customShapeEditActive: boolean;
  element: DeckElement | null;
  selectedKeywordLabel: string | null;
  slide: Slide | null;
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
  onDeleteAnimation: (animationId: string) => void;
  onToggleCustomShapeClosed: () => void;
  onToggleCustomShapeEdit: () => void;
  showIds: boolean;
}) {
  const {
    animations,
    animationDiagnostics,
    customShapeEditActive,
    element,
    onOpenAnimationEditor,
    onChangeFrame,
    onChangeProps,
    onChangeSlideStyle,
    onDeleteAnimation,
    onToggleCustomShapeClosed,
    onToggleCustomShapeEdit,
    showIds,
    slide
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
          {danglingAnimations.length > 0 ? (
            <>
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
        {element.type === "image" ? (
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
            { label: "굵게", value: "bold" }
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
            { label: "양쪽", value: "justify" }
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
            { label: "아래", value: "bottom" }
          ]}
          value={textProps.verticalAlign}
          onChange={(value) => onChangeProps({ verticalAlign: value })}
        />
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
          value={shapeProps.fill === "transparent" ? "#dbeafe" : shapeProps.fill}
          onCommit={(value) => onChangeProps({ fill: value })}
        />
        <PropertyColorField
          className="compact-property-field compact-property-field-color"
          label="선 색"
          value={
            shapeProps.stroke === "transparent" ? "#2563eb" : shapeProps.stroke
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

  if (element.type === "image") {
    const imageProps = element.props as ImageElementProps;

    return (
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
            { label: "도넛", value: "doughnut" }
          ]}
          value={chart.type}
          onChange={(value) => onChangeProps({ type: value })}
        />
      </>
    );
  }

  return null;
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
  const {
    className,
    disabled = false,
    label,
    max,
    min,
    onCommit,
    step = "1",
    value
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
        onBlur={(event) => commitValue(event.target.value)}
        onChange={(event) => setDraftValue(event.target.value)}
        onInput={(event) => setDraftValue((event.target as HTMLInputElement).value)}
      />
    </label>
  );
}
