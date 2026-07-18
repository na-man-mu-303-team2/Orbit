import type {
  Chart,
  ChartStyle,
  DeckElement,
  TableCellProps,
  TableElementProps
} from "@orbit/shared";
import { IconMinus, IconPlus, IconX } from "@tabler/icons-react";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

export function InlineDataEditorOverlay(props: {
  element: DeckElement | null;
  stageScale: number;
  onCommitProps: (elementId: string, props: Record<string, unknown>) => void;
  onFinishEditing: () => void;
}) {
  const { element } = props;
  if (!element || (element.type !== "table" && element.type !== "chart")) return null;

  if (element.type === "chart") {
    return (
      <FloatingChartEditor
        element={element}
        stageScale={props.stageScale}
        onCommitProps={props.onCommitProps}
        onFinishEditing={props.onFinishEditing}
      />
    );
  }

  return (
    <div
      className={`inline-data-editor inline-data-editor-${element.type}`}
      style={{
        height: `${element.height * props.stageScale}px`,
        left: `${element.x * props.stageScale}px`,
        top: `${element.y * props.stageScale}px`,
        transform: `rotate(${element.rotation}deg)`,
        transformOrigin: "top left",
        width: `${element.width * props.stageScale}px`
      }}
    >
      <InlineTableEditor
        element={element}
        onCommitProps={props.onCommitProps}
        onFinishEditing={props.onFinishEditing}
      />
    </div>
  );
}

function FloatingChartEditor(props: {
  element: Extract<DeckElement, { type: "chart" }>;
  stageScale: number;
  onCommitProps: (elementId: string, props: Record<string, unknown>) => void;
  onFinishEditing: () => void;
}) {
  const [position, setPosition] = useState({ left: 16, top: 16 });

  useLayoutEffect(() => {
    function updatePosition() {
      const stage = document.querySelector<HTMLElement>(".konva-editor-stage");
      const stageRect = stage?.getBoundingClientRect();
      const panelWidth = Math.min(420, Math.max(320, window.innerWidth - 32));
      const preferredLeft = (stageRect?.left ?? 0)
        + (props.element.x + props.element.width) * props.stageScale
        + 16;
      const preferredTop = (stageRect?.top ?? 0) + props.element.y * props.stageScale;
      setPosition({
        left: Math.max(16, Math.min(preferredLeft, window.innerWidth - panelWidth - 16)),
        top: Math.max(16, Math.min(preferredTop, window.innerHeight - 240))
      });
    }

    updatePosition();
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    return () => {
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [props.element.height, props.element.width, props.element.x, props.element.y, props.stageScale]);

  return createPortal(
    <div className="inline-data-editor inline-data-editor-chart floating-chart-editor" style={position}>
      <InlineChartEditor
        element={props.element}
        onCommitProps={props.onCommitProps}
        onFinishEditing={props.onFinishEditing}
      />
    </div>,
    document.body
  );
}

function InlineTableEditor(props: {
  element: Extract<DeckElement, { type: "table" }>;
  onCommitProps: (elementId: string, props: Record<string, unknown>) => void;
  onFinishEditing: () => void;
}) {
  const table = props.element.props as TableElementProps;
  const [rows, setRows] = useState(() => table.rows.map((row) => row.map((cell) => ({ ...cell }))));
  const [activeCell, setActiveCell] = useState({ rowIndex: 0, columnIndex: 0 });
  const rowsRef = useRef(rows);
  const columnCount = Math.max(1, ...rows.map((row) => row.length));
  const rowCount = Math.max(1, rows.length);

  useEffect(() => {
    requestAnimationFrame(() => {
      document.querySelector<HTMLInputElement>(
        `.inline-data-editor-table[data-element-id="${props.element.elementId}"] input`
      )?.focus();
    });
  }, [props.element.elementId]);

  useEffect(() => {
    rowsRef.current = rows;
  }, [rows]);

  useEffect(() => {
    function handleOutsidePointerDown(event: PointerEvent) {
      const target = event.target;
      if (isInsideDataEditor(target)) return;
      finishWithCommit();
    }
    document.addEventListener("pointerdown", handleOutsidePointerDown, true);
    return () => document.removeEventListener("pointerdown", handleOutsidePointerDown, true);
  });

  function commit(nextRows = rows) {
    props.onCommitProps(props.element.elementId, { rows: nextRows });
  }

  function finishWithCommit() {
    commit(rowsRef.current);
    props.onFinishEditing();
  }

  function updateRows(nextRows: TableCellProps[][]) {
    rowsRef.current = nextRows;
    setRows(nextRows);
    commit(nextRows);
  }

  function updateActiveCell(patch: Partial<TableCellProps>) {
    updateRows(updateTableCell(rows, activeCell.rowIndex, activeCell.columnIndex, patch));
  }

  const selectedCell =
    rows[activeCell.rowIndex]?.[activeCell.columnIndex] ??
    rows[0]?.[0] ??
    createDefaultTableCell();

  function addRow() {
    const template = rows.at(-1) ?? rows[0] ?? [createDefaultTableCell()];
    updateRows([...rows, template.map((cell) => ({ ...cell, text: "" }))]);
  }

  function removeRow() {
    if (rows.length <= 1) return;
    const nextRows = rows.slice(0, -1);
    setActiveCell((current) => ({
      rowIndex: Math.min(current.rowIndex, nextRows.length - 1),
      columnIndex: current.columnIndex
    }));
    updateRows(nextRows);
  }

  function addColumn() {
    updateRows(rows.map((row) => [
      ...row,
      { ...(row.at(-1) ?? rows[0]?.at(-1) ?? createDefaultTableCell()), text: "" }
    ]));
  }

  function removeColumn() {
    if (columnCount <= 1) return;
    const nextRows = rows.map((row) => row.slice(0, -1));
    setActiveCell((current) => ({
      rowIndex: current.rowIndex,
      columnIndex: Math.min(current.columnIndex, columnCount - 2)
    }));
    updateRows(nextRows);
  }

  return (
    <div
      className="inline-table-editor-grid"
      data-element-id={props.element.elementId}
      style={{
        gridTemplateColumns: trackTemplate(table.columnWidths, columnCount),
        gridTemplateRows: trackTemplate(table.rowHeights, rowCount)
      }}
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.preventDefault();
          finishWithCommit();
        }
      }}
    >
      {rows.flatMap((row, rowIndex) =>
        row.map((cell, columnIndex) => (
          <input
            aria-label={`${rowIndex + 1}행 ${columnIndex + 1}열`}
            key={`${rowIndex}-${columnIndex}`}
            style={{
              background: solidColor(cell.fill, "#ffffff"),
              color: cell.textColor ?? "#111827",
              fontFamily: cell.fontFamily,
              fontSize: `${Math.max(11, (cell.fontSize ?? 18) * 0.72)}px`,
              fontWeight: cell.fontWeight === "bold" ? 700 : 400,
              textAlign: cell.align === "center" || cell.align === "right" ? cell.align : "left"
            }}
            value={cell.text}
            onFocus={() => setActiveCell({ rowIndex, columnIndex })}
            onBlur={() => commit()}
            onChange={(event) => {
              const nextRows = rows.map((nextRow, nextRowIndex) =>
                nextRow.map((nextCell, nextColumnIndex) =>
                  nextRowIndex === rowIndex && nextColumnIndex === columnIndex
                    ? { ...nextCell, text: event.target.value }
                    : nextCell
                )
              );
              setRows(nextRows);
            }}
          />
        ))
      )}
      <div className="inline-table-editor-actions">
        <span className="inline-table-cell-selection">
          {activeCell.rowIndex + 1}행 {activeCell.columnIndex + 1}열
        </span>
        <label className="inline-data-editor-control">
          <span>글자 크기</span>
          <FontSizeInput
            ariaLabel="선택한 표 셀 글자 크기"
            value={selectedCell.fontSize ?? 18}
            onCommit={(value) => updateActiveCell({ fontSize: value })}
          />
        </label>
        <label className="inline-data-editor-control compact-color-control">
          <span>채우기</span>
          <input
            aria-label="선택한 표 셀 채우기 색상"
            type="color"
            value={solidColor(selectedCell.fill, String(createDefaultTableCell().fill))}
            onChange={(event) => updateActiveCell({ fill: event.target.value })}
          />
        </label>
        <DataEditorAction label="행 추가" onClick={addRow} type="add" />
        <DataEditorAction disabled={rows.length <= 1} label="행 삭제" onClick={removeRow} type="remove" />
        <DataEditorAction label="열 추가" onClick={addColumn} type="add" />
        <DataEditorAction disabled={columnCount <= 1} label="열 삭제" onClick={removeColumn} type="remove" />
      </div>
      <EditorCloseButton onClose={finishWithCommit} />
    </div>
  );
}

function InlineChartEditor(props: {
  element: Extract<DeckElement, { type: "chart" }>;
  onCommitProps: (elementId: string, props: Record<string, unknown>) => void;
  onFinishEditing: () => void;
}) {
  const chart = props.element.props as Chart;
  const [title, setTitle] = useState(chart.title);
  const [data, setData] = useState<Array<Record<string, unknown>>>(() =>
    chart.data.map((datum) => ({ ...datum }))
  );
  const [style, setStyle] = useState<ChartStyle>(() => ({
    ...chart.style,
    colors: [...chart.style.colors]
  }));
  const draftRef = useRef({ data, style, title });

  useEffect(() => {
    draftRef.current = { data, style, title };
  }, [data, style, title]);

  useEffect(() => {
    function handleOutsidePointerDown(event: PointerEvent) {
      const target = event.target;
      if (isInsideDataEditor(target)) return;
      finishWithCommit();
    }
    document.addEventListener("pointerdown", handleOutsidePointerDown, true);
    return () => document.removeEventListener("pointerdown", handleOutsidePointerDown, true);
  });

  function commit(nextTitle = title, nextData = data, nextStyle = style) {
    props.onCommitProps(props.element.elementId, {
      title: nextTitle,
      data: nextData,
      style: nextStyle
    });
  }

  function finishWithCommit() {
    commit(draftRef.current.title, draftRef.current.data, draftRef.current.style);
    props.onFinishEditing();
  }

  function updateStyle(patch: Partial<ChartStyle>) {
    const nextStyle = mergeChartStyle(style, patch);
    draftRef.current = { data, style: nextStyle, title };
    setStyle(nextStyle);
    commit(title, data, nextStyle);
  }

  function addDatum() {
    const nextData = [
      ...data,
      chart.type === "scatter"
        ? { label: `항목 ${data.length + 1}`, x: 0, y: 0 }
        : chart.type === "line"
          ? { label: `항목 ${data.length + 1}`, series: "Series 1", value: 0 }
          : { label: `항목 ${data.length + 1}`, value: 0 }
    ];
    draftRef.current = { data: nextData, style, title };
    setData(nextData);
    commit(title, nextData);
  }

  function removeDatum(index: number) {
    if (data.length <= 1) return;
    const nextData = data.filter((_, itemIndex) => itemIndex !== index);
    draftRef.current = { data: nextData, style, title };
    setData(nextData);
    commit(title, nextData);
  }

  return (
    <div
      className="inline-chart-editor-card"
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.preventDefault();
          finishWithCommit();
        }
      }}
    >
      <span className="inline-data-editor-label">차트 제목</span>
      <input
        autoFocus
        className="inline-chart-title-input"
        value={title}
        onBlur={() => commit()}
        onChange={(event) => {
          const nextTitle = event.target.value;
          draftRef.current = { data, style, title: nextTitle };
          setTitle(nextTitle);
          commit(nextTitle, data, style);
        }}
      />
      <div className="inline-chart-text-controls">
        {chart.type === "bar" || chart.type === "line" || chart.type === "scatter" ? (
          <>
            <ChartTextControl
              label="가로축 제목"
              value={style.xAxisTitle}
              onChange={(value) => updateStyle({ xAxisTitle: value })}
            />
            <ChartTextControl
              label="세로축 제목"
              value={style.yAxisTitle}
              onChange={(value) => updateStyle({ yAxisTitle: value })}
            />
          </>
        ) : null}
        <ChartTextControl
          label="값 단위"
          value={style.unit}
          onChange={(value) => updateStyle({ unit: value })}
        />
      </div>
      <div className="inline-chart-font-controls">
        <ChartFontSizeControl
          label="제목"
          value={style.titleFontSize ?? 34}
          onChange={(value) => updateStyle({ titleFontSize: value })}
        />
        <ChartFontSizeControl
          label="축 글자"
          value={style.axisLabelFontSize ?? 28}
          onChange={(value) => updateStyle({ axisLabelFontSize: value })}
        />
        <ChartFontSizeControl
          label="범례"
          value={style.legendFontSize ?? 24}
          onChange={(value) => updateStyle({ legendFontSize: value })}
        />
        <ChartFontSizeControl
          label="값 라벨"
          value={style.dataLabelFontSize ?? 22}
          onChange={(value) => updateStyle({ dataLabelFontSize: value })}
        />
      </div>
      <div className="inline-chart-visibility-controls">
        <label>
          <input
            type="checkbox"
            checked={style.showLegend !== false}
            onChange={(event) => updateStyle({ showLegend: event.target.checked })}
          />
          범례 표시
        </label>
        <label>
          <input
            type="checkbox"
            checked={style.showDataLabels === true}
            onChange={(event) => updateStyle({ showDataLabels: event.target.checked })}
          />
          값 라벨 표시
        </label>
      </div>
      <div className={`inline-chart-data-grid ${chart.type === "scatter" ? "scatter" : chart.type === "line" ? "line" : "colored"}`}>
        <strong>항목</strong>
        {chart.type === "line" ? <strong>시리즈</strong> : null}
        {chart.type === "scatter" ? <><strong>X</strong><strong>Y</strong></> : <strong>값</strong>}
        {chart.type !== "scatter" ? <strong>색상</strong> : null}
        <span aria-hidden="true" />
        {data.map((datum, index) => (
          <ChartDatumInputs
            datum={datum}
            isLine={chart.type === "line"}
            isScatter={chart.type === "scatter"}
            key={index}
            onChange={(nextDatum) => {
              const nextData = data.map((item, itemIndex) => itemIndex === index ? nextDatum : item);
              draftRef.current = { data: nextData, style, title };
              setData(nextData);
              commit(title, nextData, style);
            }}
            onCommit={() => commit()}
            onRemove={() => removeDatum(index)}
            removeDisabled={data.length <= 1}
            color={chart.type !== "scatter"
              ? style.colors[chartColorIndex(chart.type, data, datum, index)] ?? defaultChartColor(chartColorIndex(chart.type, data, datum, index))
              : null}
            onColorChange={(color) => {
              const targetColorIndex = chartColorIndex(chart.type, data, datum, index);
              const colorCount = chart.type === "line"
                ? new Set(data.map((item) => String(item.series ?? "Series 1"))).size
                : data.length;
              const nextColors = Array.from(
                { length: Math.max(style.colors.length, colorCount) },
                (_, colorIndex) => colorIndex === targetColorIndex
                  ? color
                  : style.colors[colorIndex] ?? defaultChartColor(colorIndex)
              );
              updateStyle({ colors: nextColors });
            }}
          />
        ))}
      </div>
      <button className="inline-chart-add-row" type="button" onClick={addDatum}>
        <IconPlus size={14} /> 항목 추가
      </button>
      <span className="inline-data-editor-hint">Tab으로 다음 칸 이동 · Esc로 종료</span>
      <EditorCloseButton onClose={finishWithCommit} />
    </div>
  );
}

function ChartTextControl(props: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="inline-data-editor-control">
      <span>{props.label}</span>
      <input
        value={props.value}
        onChange={(event) => props.onChange(event.target.value)}
      />
    </label>
  );
}

function ChartFontSizeControl(props: {
  label: string;
  value: number;
  onChange: (value: number) => void;
}) {
  return (
    <label className="inline-data-editor-control">
      <span>{props.label}</span>
      <FontSizeInput
        ariaLabel={`${props.label} 글자 크기`}
        value={props.value}
        onCommit={props.onChange}
      />
    </label>
  );
}

function FontSizeInput(props: {
  ariaLabel: string;
  onCommit: (value: number) => void;
  value: number;
}) {
  const [draft, setDraft] = useState(String(props.value));

  useEffect(() => {
    setDraft(String(props.value));
  }, [props.value]);

  function commitDraft() {
    const nextValue = clampDataEditorFontSize(draft);
    setDraft(String(nextValue));
    props.onCommit(nextValue);
  }

  return (
    <input
      aria-label={props.ariaLabel}
      max={200}
      min={6}
      type="number"
      value={draft}
      onBlur={commitDraft}
      onChange={(event) => setDraft(event.target.value)}
      onKeyDown={(event) => {
        if (event.key !== "Enter") return;
        event.preventDefault();
        event.currentTarget.blur();
      }}
    />
  );
}

function EditorCloseButton(props: { onClose: () => void }) {
  return (
    <button aria-label="데이터 편집 닫기" className="inline-data-editor-close" type="button" onClick={props.onClose}>
      <IconX size={15} />
    </button>
  );
}

function isInsideDataEditor(target: EventTarget | null) {
  if (target instanceof Element) return Boolean(target.closest(".inline-data-editor"));
  return target instanceof Node
    ? Boolean(target.parentElement?.closest(".inline-data-editor"))
    : false;
}

function ChartDatumInputs(props: {
  datum: Record<string, unknown>;
  isLine: boolean;
  isScatter: boolean;
  onChange: (datum: Record<string, unknown>) => void;
  onCommit: () => void;
  onRemove: () => void;
  removeDisabled: boolean;
  color: string | null;
  onColorChange: (color: string) => void;
}) {
  return (
    <>
      <input value={String(props.datum.label ?? "")} onBlur={props.onCommit} onChange={(event) => props.onChange({ ...props.datum, label: event.target.value })} />
      {props.isLine ? (
        <input
          aria-label="선 차트 시리즈 이름"
          value={String(props.datum.series ?? "Series 1")}
          onBlur={props.onCommit}
          onChange={(event) => props.onChange({ ...props.datum, series: event.target.value })}
        />
      ) : null}
      {props.isScatter ? (
        <>
          <NumberInput value={Number(props.datum.x ?? 0)} onBlur={props.onCommit} onChange={(value) => props.onChange({ ...props.datum, x: value })} />
          <NumberInput value={Number(props.datum.y ?? 0)} onBlur={props.onCommit} onChange={(value) => props.onChange({ ...props.datum, y: value })} />
        </>
      ) : (
        <NumberInput value={Number(props.datum.value ?? 0)} onBlur={props.onCommit} onChange={(value) => props.onChange({ ...props.datum, value: value })} />
      )}
      {props.color ? (
        <input
          aria-label="차트 항목 색상"
          className="inline-chart-color-input"
          type="color"
          value={props.color}
          onChange={(event) => props.onColorChange(event.target.value)}
        />
      ) : null}
      <button aria-label="항목 삭제" className="inline-data-row-remove" disabled={props.removeDisabled} type="button" onClick={props.onRemove}>
        <IconX size={13} />
      </button>
    </>
  );
}

function DataEditorAction(props: {
  disabled?: boolean;
  label: string;
  onClick: () => void;
  type: "add" | "remove";
}) {
  return (
    <button disabled={props.disabled} type="button" onClick={props.onClick}>
      {props.type === "add" ? <IconPlus size={13} /> : <IconMinus size={13} />}
      {props.label}
    </button>
  );
}

function NumberInput(props: { value: number; onBlur: () => void; onChange: (value: number) => void }) {
  return <input type="number" value={props.value} onBlur={props.onBlur} onChange={(event) => props.onChange(Number(event.target.value) || 0)} />;
}

export function clampDataEditorFontSize(value: string) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 18;
  return Math.min(200, Math.max(6, parsed));
}

export function updateTableCell(
  rows: TableCellProps[][],
  rowIndex: number,
  columnIndex: number,
  patch: Partial<TableCellProps>
) {
  return rows.map((row, nextRowIndex) =>
    row.map((cell, nextColumnIndex) =>
      nextRowIndex === rowIndex && nextColumnIndex === columnIndex
        ? { ...cell, ...patch }
        : cell
    )
  );
}

export function mergeChartStyle(style: ChartStyle, patch: Partial<ChartStyle>): ChartStyle {
  return {
    ...style,
    ...patch,
    colors: patch.colors ? [...patch.colors] : style.colors
  };
}

function trackTemplate(sizes: number[] | undefined, count: number) {
  if (sizes?.length === count && sizes.every((size) => size > 0)) {
    return sizes.map((size) => `${size}fr`).join(" ");
  }
  return `repeat(${count}, minmax(0, 1fr))`;
}

function solidColor(value: unknown, fallback: string) {
  return typeof value === "string" && value !== "transparent" ? value : fallback;
}

function createDefaultTableCell(): TableCellProps {
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

function defaultChartColor(index: number) {
  return ["#4F81BD", "#C0504D", "#9BBB59", "#8064A2", "#F59E0B"][index % 5]!;
}

function chartColorIndex(
  type: Chart["type"],
  data: Array<Record<string, unknown>>,
  datum: Record<string, unknown>,
  datumIndex: number
) {
  if (type !== "line") return datumIndex;
  const seriesNames = Array.from(new Set(data.map((item) => String(item.series ?? "Series 1"))));
  return Math.max(0, seriesNames.indexOf(String(datum.series ?? "Series 1")));
}
