import type { Deck, Slide } from "@orbit/shared";
import type Konva from "konva";
import { Rect as KonvaRect } from "react-konva";
import type { ComponentType } from "react";
import { useEffect } from "react";

import { getTableContextActionStates } from "../../shell/hooks/useEditorCanvasCommands";
import type {
  TableCellTarget,
  TableOperationRequest,
} from "../../shell/editorShellUiStore";
import { useEditorShellUiStore } from "../../shell/editorShellUiStore";
import type { CanvasSelectionModifiers } from "../utils/canvasSelection";
import { TableCellEditorOverlay } from "./TableCellEditorOverlay";
import { getTableLayout } from "./tableLayout";

type KonvaComponent = ComponentType<any>;
const Rect = KonvaRect as unknown as KonvaComponent;

type TableElement = Extract<Slide["elements"][number], { type: "table" }>;

export function clearDisabledTableInteraction(args: {
  activeTableCell: TableCellTarget | null;
  disabled: boolean;
  editingElementId: string | null;
  elementId: string;
  setActiveTableCell: (value: null) => void;
  setEditingElementId: (value: null) => void;
}) {
  if (!args.disabled) return;
  if (args.activeTableCell?.elementId === args.elementId) {
    args.setActiveTableCell(null);
  }
  if (args.editingElementId === args.elementId) {
    args.setEditingElementId(null);
  }
}

export function createTableCellTextUpdateRequest(args: {
  columnIndex: number;
  elementId: string;
  initialText: string;
  rowIndex: number;
  slideId: string;
  text: string;
}): TableOperationRequest | null {
  if (args.text === args.initialText) return null;
  return {
    action: "updateCellText",
    columnIndex: args.columnIndex,
    elementId: args.elementId,
    rowIndex: args.rowIndex,
    slideId: args.slideId,
    text: args.text,
  };
}

export function TableCellHitTargets(props: {
  deck: Deck;
  disabled: boolean;
  element: TableElement;
  frame: {
    height: number;
    rotation: number;
    width: number;
    x: number;
    y: number;
  };
  isSelected: boolean;
  slide: Slide;
  stageScale: number;
  onOpenContextMenu: (clientX: number, clientY: number) => void;
  onSelect: (modifiers: CanvasSelectionModifiers) => void;
}) {
  const activeTableCell = useEditorShellUiStore(
    (state) => state.activeTableCell,
  );
  const editingElementId = useEditorShellUiStore(
    (state) => state.editingElementId,
  );
  const setActiveTableCell = useEditorShellUiStore(
    (state) => state.setActiveTableCell,
  );
  const setEditingElementId = useEditorShellUiStore(
    (state) => state.setEditingElementId,
  );
  const setTableOperationRequest = useEditorShellUiStore(
    (state) => state.setTableOperationRequest,
  );
  const layout = getTableLayout(props.element.props, props.frame);
  const capability = getTableContextActionStates({
    deck: props.deck,
    element: props.element,
  });
  const activeCellLayout =
    activeTableCell?.elementId === props.element.elementId &&
    activeTableCell.slideId === props.slide.slideId
      ? (layout.cells.find(
          (cell) =>
            cell.rowIndex === activeTableCell.rowIndex &&
            cell.columnIndex === activeTableCell.columnIndex,
        ) ?? null)
      : null;

  function selectCell(
    rowIndex: number,
    columnIndex: number,
    modifiers: CanvasSelectionModifiers = {},
  ) {
    if (props.disabled) return;
    setActiveTableCell({
      cellEditDisabledReason: capability.cellText.enabled
        ? null
        : capability.cellText.reason,
      columnIndex,
      elementId: props.element.elementId,
      rowIndex,
      slideId: props.slide.slideId,
    });
    props.onSelect(modifiers);
  }

  function startEditing(rowIndex: number, columnIndex: number) {
    if (props.disabled) return;
    selectCell(rowIndex, columnIndex);
    if (capability.cellText.enabled) {
      setEditingElementId(props.element.elementId);
    }
  }

  useEffect(() => {
    clearDisabledTableInteraction({
      activeTableCell,
      disabled: props.disabled,
      editingElementId,
      elementId: props.element.elementId,
      setActiveTableCell,
      setEditingElementId,
    });
  }, [
    activeTableCell?.elementId,
    editingElementId,
    props.element.elementId,
    props.disabled,
    setActiveTableCell,
    setEditingElementId,
  ]);

  useEffect(() => {
    if (
      !props.isSelected ||
      props.disabled ||
      !activeCellLayout ||
      editingElementId === props.element.elementId
    ) {
      return;
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key !== "Enter" || event.metaKey || event.ctrlKey) return;
      const target = event.target;
      if (
        target instanceof Element &&
        target.closest(
          "input, textarea, select, button, [contenteditable]:not([contenteditable='false'])",
        )
      ) {
        return;
      }
      if (!capability.cellText.enabled) return;
      event.preventDefault();
      setEditingElementId(props.element.elementId);
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [
    activeCellLayout,
    capability.cellText.enabled,
    editingElementId,
    props.element.elementId,
    props.disabled,
    props.isSelected,
    setEditingElementId,
  ]);

  return (
    <>
      {layout.cells.map((cellLayout) => {
        const selected =
          props.isSelected &&
          activeCellLayout?.rowIndex === cellLayout.rowIndex &&
          activeCellLayout.columnIndex === cellLayout.columnIndex;

        return (
          <Rect
            data-table-column-index={cellLayout.columnIndex}
            data-table-row-index={cellLayout.rowIndex}
            fill="rgba(15, 23, 42, 0.001)"
            height={Math.max(1, cellLayout.height)}
            key={`table-cell-hit-${cellLayout.rowIndex}-${cellLayout.columnIndex}`}
            listening={!props.disabled}
            stroke={selected ? "#2563eb" : "transparent"}
            strokeWidth={selected ? 2 : 0}
            width={Math.max(1, cellLayout.width)}
            x={cellLayout.x}
            y={cellLayout.y}
            onClick={(event: Konva.KonvaEventObject<MouseEvent>) => {
              event.cancelBubble = true;
              selectCell(cellLayout.rowIndex, cellLayout.columnIndex, {
                ctrlKey: event.evt.ctrlKey,
                metaKey: event.evt.metaKey,
                shiftKey: event.evt.shiftKey,
              });
            }}
            onContextMenu={(event: Konva.KonvaEventObject<PointerEvent>) => {
              event.cancelBubble = true;
              event.evt.preventDefault();
              selectCell(cellLayout.rowIndex, cellLayout.columnIndex);
              props.onOpenContextMenu(event.evt.clientX, event.evt.clientY);
            }}
            onDblClick={(event: Konva.KonvaEventObject<MouseEvent>) => {
              event.cancelBubble = true;
              startEditing(cellLayout.rowIndex, cellLayout.columnIndex);
            }}
            onTap={(event: Konva.KonvaEventObject<TouchEvent>) => {
              event.cancelBubble = true;
              selectCell(cellLayout.rowIndex, cellLayout.columnIndex);
            }}
          />
        );
      })}
      {!props.disabled &&
      editingElementId === props.element.elementId &&
      activeCellLayout ? (
        <TableCellEditorOverlay
          cell={activeCellLayout.cell}
          cellLayout={activeCellLayout}
          columnIndex={activeCellLayout.columnIndex}
          element={{
            elementId: props.element.elementId,
            rotation: props.frame.rotation,
            x: props.frame.x,
            y: props.frame.y,
          }}
          rowIndex={activeCellLayout.rowIndex}
          stageScale={props.stageScale}
          onCommit={(text) => {
            const request = createTableCellTextUpdateRequest({
              columnIndex: activeCellLayout.columnIndex,
              elementId: props.element.elementId,
              initialText: activeCellLayout.cell.text,
              rowIndex: activeCellLayout.rowIndex,
              slideId: props.slide.slideId,
              text,
            });
            if (request) setTableOperationRequest(request);
          }}
          onFinish={() => setEditingElementId(null)}
        />
      ) : null}
    </>
  );
}
