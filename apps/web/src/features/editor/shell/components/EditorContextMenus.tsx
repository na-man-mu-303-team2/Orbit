import {
  IconArrowRight as MoveRight,
  IconChartBar as BarChart,
  IconChartLine as LineChart,
  IconChartPie as PieChart,
  IconCircle as Circle,
  IconHexagon as Polygon,
  IconMinus as Minus,
  IconPencil as PenLine,
  IconPhotoPlus as ImagePlus,
  IconRectangle as Rectangle,
  IconShape as Shapes,
  IconStar as Star,
  IconTable as Table,
  IconTriangle as Triangle
} from "@tabler/icons-react";
import { useEffect, type ReactNode } from "react";
import { createPortal } from "react-dom";

import type {
  ElementContextMenuState,
  ShapeMenuPosition
} from "../editorShellUiStore";
import type { ChartInsertType } from "./EditorToolbar";

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
  chartMenuPosition: ShapeMenuPosition | null;
  elementContextMenu: ElementContextMenuState | null;
  isChartMenuOpen: boolean;
  isImageUploadPending: boolean;
  isShapeMenuOpen: boolean;
  onCloseChartMenu: () => void;
  onCloseElementContextMenu: () => void;
  onCloseShapeMenu: () => void;
  onCreateGroup: () => void;
  onInsertChart: (type: ChartInsertType) => void;
  onInsertShape: (shape: ShapeInsertType) => void;
  onReplaceImage: (target: {
    elementId: string;
    slideId: string;
    type: "replace";
  }) => void;
  onUngroup: (slideId: string, elementId: string) => void;
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

  return (
    <>
      {props.isChartMenuOpen && props.chartMenuPosition
        ? createPortal(
            <div className="shape-menu-overlay" onMouseDown={props.onCloseChartMenu}>
              <div
                className="shape-menu-popover"
                role="menu"
                style={props.chartMenuPosition}
                onMouseDown={(event) => event.stopPropagation()}
              >
                <span className="shape-menu-title">차트 및 표</span>
                <ShapeMenuItem icon={<BarChart />} label="막대" onClick={() => props.onInsertChart("bar")} />
                <ShapeMenuItem icon={<LineChart />} label="선" onClick={() => props.onInsertChart("line")} />
                <ShapeMenuItem icon={<PieChart />} label="원형" onClick={() => props.onInsertChart("pie")} />
                <ShapeMenuItem icon={<Table />} label="표" onClick={() => props.onInsertChart("table")} />
              </div>
            </div>,
            document.body
          )
        : null}

      {props.isShapeMenuOpen && props.shapeMenuPosition
        ? createPortal(
            <div className="shape-menu-overlay" onMouseDown={props.onCloseShapeMenu}>
              <div
                className="shape-menu-popover"
                role="menu"
                style={props.shapeMenuPosition}
                onMouseDown={(event) => event.stopPropagation()}
              >
                <span className="shape-menu-title">기본 도형</span>
                <ShapeMenuItem icon={<Rectangle />} label="사각형" onClick={() => props.onInsertShape("rect")} />
                <ShapeMenuItem icon={<Circle />} label="원" onClick={() => props.onInsertShape("ellipse")} />
                <ShapeMenuItem icon={<Triangle />} label="삼각형" onClick={() => props.onInsertShape("triangle")} />
                <ShapeMenuItem icon={<Polygon />} label="다각형" onClick={() => props.onInsertShape("polygon")} />
                <ShapeMenuItem icon={<Star />} label="별" onClick={() => props.onInsertShape("star")} />
                <ShapeMenuItem icon={<PenLine />} label="커스텀 도형 그리기" onClick={() => props.onInsertShape("customShape")} />
                <ShapeMenuItem icon={<Minus />} label="선" onClick={() => props.onInsertShape("line")} />
                <ShapeMenuItem icon={<MoveRight />} label="화살표" onClick={() => props.onInsertShape("arrow")} />
              </div>
            </div>,
            document.body
          )
        : null}

      {elementContextMenu
        ? createPortal(
            <div className="element-context-menu-overlay" onMouseDown={props.onCloseElementContextMenu}>
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
                    disabled={props.isImageUploadPending}
                    role="menuitem"
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
                    <span>{props.isImageUploadPending ? "업로드 중..." : "이미지 바꾸기"}</span>
                  </button>
                ) : elementContextMenu.type === "group" ? (
                  <button
                    className="element-context-menu-item"
                    role="menuitem"
                    type="button"
                    onClick={() =>
                      props.onUngroup(
                        elementContextMenu.slideId,
                        elementContextMenu.elementId
                      )
                    }
                  >
                    <Shapes size={16} /><span>그룹 해제</span>
                  </button>
                ) : (
                  <button className="element-context-menu-item" role="menuitem" type="button" onClick={props.onCreateGroup}>
                    <Shapes size={16} /><span>그룹화</span>
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
  icon: ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button className="shape-menu-item" role="menuitem" type="button" onClick={props.onClick}>
      <span aria-hidden="true" className="shape-menu-symbol">{props.icon}</span>
      <span>{props.label}</span>
    </button>
  );
}
