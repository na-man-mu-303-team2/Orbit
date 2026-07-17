import {
  IconColumnInsertLeft as ColumnInsertLeft,
  IconColumnInsertRight as ColumnInsertRight,
  IconArrowRight as MoveRight,
  IconMinus as Minus,
  IconPencil as PenLine,
  IconPhotoPlus as ImagePlus,
  IconRowInsertBottom as RowInsertBottom,
  IconRowInsertTop as RowInsertTop,
  IconShape as Shapes,
  IconTrash as Trash,
} from "@tabler/icons-react";
import { useEffect, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";

import type {
  ElementContextMenuState,
  ShapeMenuPosition,
  TableContextAction,
} from "../editorShellUiStore";
import { useEditorShellUiStore } from "../editorShellUiStore";

export type ShapeInsertType =
  | "rect"
  | "ellipse"
  | "line"
  | "arrow"
  | "triangle"
  | "polygon"
  | "star"
  | "customShape";

export function EditorContextMenus(props: {
  elementContextMenu: ElementContextMenuState | null;
  elementActionDisabledReasons?: {
    action?: string;
    group?: string;
    imageReplace?: string;
    ungroup?: string;
  };
  isImageUploadPending: boolean;
  isShapeMenuOpen: boolean;
  onCloseElementContextMenu: () => void;
  onCloseShapeMenu: () => void;
  onCreateGroup: () => void;
  onInsertShape: (shape: ShapeInsertType) => void;
  onReplaceImage: (target: {
    elementId: string;
    slideId: string;
    type: "replace";
  }) => void;
  onTableAction?: (action: TableContextAction) => void;
  onUngroup: (slideId: string, elementId: string) => void;
  shapeDisabledReasons?: Partial<Record<ShapeInsertType, string>>;
  shapeMenuPosition: ShapeMenuPosition | null;
}) {
  const elementMenuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!props.elementContextMenu) return;

    function handleEscape(event: KeyboardEvent) {
      if (event.key === "Escape") props.onCloseElementContextMenu();
    }

    window.addEventListener("keydown", handleEscape);
    return () => window.removeEventListener("keydown", handleEscape);
  }, [props]);

  useEffect(() => {
    if (!props.elementContextMenu || typeof window === "undefined") return;
    const frame = window.requestAnimationFrame(() => {
      const menu = elementMenuRef.current;
      const firstEnabledItem = menu?.querySelector<HTMLButtonElement>(
        '[role="menuitem"]:not(:disabled)',
      );
      (firstEnabledItem ?? menu)?.focus();
    });
    return () => window.cancelAnimationFrame(frame);
  }, [props.elementContextMenu]);

  if (typeof document === "undefined") return null;
  const elementContextMenu = props.elementContextMenu;
  const elementActionDisabledReason = elementContextMenu
    ? (props.elementActionDisabledReasons?.action ??
      (elementContextMenu.type === "image"
        ? props.elementActionDisabledReasons?.imageReplace
        : elementContextMenu.type === "group"
          ? props.elementActionDisabledReasons?.ungroup
          : props.elementActionDisabledReasons?.group))
    : undefined;

  function requestTableAction(action: TableContextAction) {
    if (!elementContextMenu || elementContextMenu.type !== "table-cell") return;
    if (props.onTableAction) {
      props.onTableAction(action);
    } else {
      useEditorShellUiStore.getState().setTableOperationRequest({
        action,
        columnIndex: elementContextMenu.columnIndex,
        elementId: elementContextMenu.elementId,
        rowIndex: elementContextMenu.rowIndex,
        slideId: elementContextMenu.slideId,
      });
    }
    props.onCloseElementContextMenu();
  }

  return (
    <>
      {props.isShapeMenuOpen && props.shapeMenuPosition
        ? createPortal(
            <div
              className="shape-menu-overlay"
              onMouseDown={props.onCloseShapeMenu}
            >
              <div
                className="shape-menu-popover"
                role="menu"
                style={props.shapeMenuPosition}
                onMouseDown={(event) => event.stopPropagation()}
              >
                <span className="shape-menu-title">기본 도형</span>
                <ShapeMenuItem
                  disabledReason={props.shapeDisabledReasons?.rect}
                  symbol="▭"
                  label="사각형"
                  onClick={() => props.onInsertShape("rect")}
                />
                <ShapeMenuItem
                  disabledReason={props.shapeDisabledReasons?.ellipse}
                  symbol="◯"
                  label="원"
                  onClick={() => props.onInsertShape("ellipse")}
                />
                <ShapeMenuItem
                  disabledReason={props.shapeDisabledReasons?.triangle}
                  symbol="⬡"
                  label="삼각형"
                  onClick={() => props.onInsertShape("triangle")}
                />
                <ShapeMenuItem
                  disabledReason={props.shapeDisabledReasons?.polygon}
                  symbol="⬢"
                  label="다각형"
                  onClick={() => props.onInsertShape("polygon")}
                />
                <ShapeMenuItem
                  disabledReason={props.shapeDisabledReasons?.star}
                  symbol="★"
                  label="별"
                  onClick={() => props.onInsertShape("star")}
                />
                <button
                  className="shape-menu-item"
                  disabled={Boolean(props.shapeDisabledReasons?.customShape)}
                  role="menuitem"
                  title={props.shapeDisabledReasons?.customShape}
                  type="button"
                  onClick={() => props.onInsertShape("customShape")}
                >
                  <PenLine size={14} />
                  <span>커스텀 도형 그리기</span>
                  {props.shapeDisabledReasons?.customShape ? (
                    <small>{props.shapeDisabledReasons.customShape}</small>
                  ) : null}
                </button>
                <button
                  className="shape-menu-item"
                  disabled={Boolean(props.shapeDisabledReasons?.line)}
                  role="menuitem"
                  title={props.shapeDisabledReasons?.line}
                  type="button"
                  onClick={() => props.onInsertShape("line")}
                >
                  <Minus size={14} />
                  <span>선</span>
                  {props.shapeDisabledReasons?.line ? (
                    <small>{props.shapeDisabledReasons.line}</small>
                  ) : null}
                </button>
                <button
                  className="shape-menu-item"
                  disabled={Boolean(props.shapeDisabledReasons?.arrow)}
                  role="menuitem"
                  title={props.shapeDisabledReasons?.arrow}
                  type="button"
                  onClick={() => props.onInsertShape("arrow")}
                >
                  <MoveRight size={14} />
                  <span>화살표</span>
                  {props.shapeDisabledReasons?.arrow ? (
                    <small>{props.shapeDisabledReasons.arrow}</small>
                  ) : null}
                </button>
              </div>
            </div>,
            document.body,
          )
        : null}

      {elementContextMenu
        ? createPortal(
            <div
              className="element-context-menu-overlay"
              onMouseDown={props.onCloseElementContextMenu}
            >
              <div
                aria-label={
                  elementContextMenu.type === "table-cell"
                    ? `표 ${elementContextMenu.rowIndex + 1}행 ${elementContextMenu.columnIndex + 1}열 메뉴`
                    : "요소 메뉴"
                }
                className="element-context-menu-popover"
                ref={elementMenuRef}
                role="menu"
                tabIndex={-1}
                style={{
                  left: elementContextMenu.left,
                  top: elementContextMenu.top,
                }}
                onMouseDown={(event) => event.stopPropagation()}
              >
                {elementContextMenu.type === "table-cell" ? (
                  <TableContextMenuItems
                    disabledReasons={elementContextMenu.actionDisabledReasons}
                    onAction={requestTableAction}
                  />
                ) : elementContextMenu.type === "image" ? (
                  <button
                    className="element-context-menu-item"
                    disabled={
                      props.isImageUploadPending ||
                      Boolean(elementActionDisabledReason)
                    }
                    role="menuitem"
                    title={elementActionDisabledReason}
                    type="button"
                    onClick={() =>
                      props.onReplaceImage({
                        elementId: elementContextMenu.elementId,
                        slideId: elementContextMenu.slideId,
                        type: "replace",
                      })
                    }
                  >
                    <ImagePlus size={16} />
                    <span>
                      {props.isImageUploadPending
                        ? "업로드 중..."
                        : "이미지 바꾸기"}
                    </span>
                    {elementActionDisabledReason ? (
                      <small>{elementActionDisabledReason}</small>
                    ) : null}
                  </button>
                ) : elementContextMenu.type === "group" ? (
                  <button
                    className="element-context-menu-item"
                    disabled={Boolean(elementActionDisabledReason)}
                    role="menuitem"
                    title={elementActionDisabledReason}
                    type="button"
                    onClick={() =>
                      props.onUngroup(
                        elementContextMenu.slideId,
                        elementContextMenu.elementId,
                      )
                    }
                  >
                    <Shapes size={16} />
                    <span>그룹 해제</span>
                    {elementActionDisabledReason ? (
                      <small>{elementActionDisabledReason}</small>
                    ) : null}
                  </button>
                ) : (
                  <button
                    className="element-context-menu-item"
                    disabled={Boolean(elementActionDisabledReason)}
                    role="menuitem"
                    title={elementActionDisabledReason}
                    type="button"
                    onClick={props.onCreateGroup}
                  >
                    <Shapes size={16} />
                    <span>그룹</span>
                    {elementActionDisabledReason ? (
                      <small>{elementActionDisabledReason}</small>
                    ) : null}
                  </button>
                )}
              </div>
            </div>,
            document.body,
          )
        : null}
    </>
  );
}

function TableContextMenuItems(props: {
  disabledReasons: Partial<Record<TableContextAction, string>>;
  onAction: (action: TableContextAction) => void;
}) {
  return (
    <>
      <TableContextMenuItem
        action="insertRowAbove"
        disabledReason={props.disabledReasons.insertRowAbove}
        icon={<RowInsertTop size={16} />}
        label="위에 행 추가"
        onAction={props.onAction}
      />
      <TableContextMenuItem
        action="insertRowBelow"
        disabledReason={props.disabledReasons.insertRowBelow}
        icon={<RowInsertBottom size={16} />}
        label="아래에 행 추가"
        onAction={props.onAction}
      />
      <TableContextMenuItem
        action="insertColumnLeft"
        disabledReason={props.disabledReasons.insertColumnLeft}
        icon={<ColumnInsertLeft size={16} />}
        label="왼쪽에 열 추가"
        onAction={props.onAction}
      />
      <TableContextMenuItem
        action="insertColumnRight"
        disabledReason={props.disabledReasons.insertColumnRight}
        icon={<ColumnInsertRight size={16} />}
        label="오른쪽에 열 추가"
        onAction={props.onAction}
      />
      <TableContextMenuItem
        action="deleteRow"
        disabledReason={props.disabledReasons.deleteRow}
        icon={<Trash size={16} />}
        label="현재 행 삭제"
        onAction={props.onAction}
      />
      <TableContextMenuItem
        action="deleteColumn"
        disabledReason={props.disabledReasons.deleteColumn}
        icon={<Trash size={16} />}
        label="현재 열 삭제"
        onAction={props.onAction}
      />
    </>
  );
}

function TableContextMenuItem(props: {
  action: TableContextAction;
  disabledReason?: string;
  icon: ReactNode;
  label: string;
  onAction: (action: TableContextAction) => void;
}) {
  return (
    <button
      className="element-context-menu-item"
      disabled={Boolean(props.disabledReason)}
      role="menuitem"
      title={props.disabledReason}
      type="button"
      onClick={() => props.onAction(props.action)}
    >
      {props.icon}
      <span>{props.label}</span>
      {props.disabledReason ? <small>{props.disabledReason}</small> : null}
    </button>
  );
}

function ShapeMenuItem(props: {
  disabledReason?: string;
  label: string;
  onClick: () => void;
  symbol: string;
}) {
  return (
    <button
      className="shape-menu-item"
      disabled={Boolean(props.disabledReason)}
      role="menuitem"
      title={props.disabledReason}
      type="button"
      onClick={props.onClick}
    >
      <span className="shape-menu-symbol">{props.symbol}</span>
      <span>{props.label}</span>
      {props.disabledReason ? <small>{props.disabledReason}</small> : null}
    </button>
  );
}
