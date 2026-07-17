import {
  IconArrowRight as MoveRight,
  IconMinus as Minus,
  IconPencil as PenLine,
  IconPhotoPlus as ImagePlus,
  IconShape as Shapes
} from "@tabler/icons-react";
import { useEffect } from "react";
import { createPortal } from "react-dom";

import type {
  ElementContextMenuState,
  ShapeMenuPosition
} from "../editorShellUiStore";

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
  onUngroup: (slideId: string, elementId: string) => void;
  shapeDisabledReasons?: Partial<Record<ShapeInsertType, string>>;
  shapeMenuPosition: ShapeMenuPosition | null;
}) {
  useEffect(() => {
    if (!props.elementContextMenu) return;

    function handleEscape(event: KeyboardEvent) {
      if (event.key === "Escape") props.onCloseElementContextMenu();
    }

    window.addEventListener("keydown", handleEscape);
    return () => window.removeEventListener("keydown", handleEscape);
  }, [props]);

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
            document.body
          )
        : null}

      {elementContextMenu
        ? createPortal(
            <div
              className="element-context-menu-overlay"
              onMouseDown={props.onCloseElementContextMenu}
            >
              <div
                className="element-context-menu-popover"
                role="menu"
                style={{
                  left: elementContextMenu.left,
                  top: elementContextMenu.top
                }}
                onMouseDown={(event) => event.stopPropagation()}
              >
                {elementContextMenu.type === "image" ? (
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
                        type: "replace"
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
                        elementContextMenu.elementId
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
            document.body
          )
        : null}
    </>
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
