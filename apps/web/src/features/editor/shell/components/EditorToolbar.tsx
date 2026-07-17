import {
  IconArrowBackUp,
  IconArrowForwardUp,
  IconChartBar as BarChart3,
  IconChevronDown as ChevronDown,
  IconPhotoPlus as ImagePlus,
  IconIcons,
  IconPointer as MousePointer2,
  IconShape as Shapes,
  IconSparkles as Sparkles,
  IconTemplate as LayoutTemplate,
  IconTypography as Type
} from "@tabler/icons-react";
import type { ReactNode, RefObject } from "react";

import type { InsertTool } from "../editorShellUiStore";

type EditorToolbarProps = {
  canUseCurrentSlide: boolean;
  insertTool: InsertTool;
  isAnimationPanelOpen: boolean;
  isImageUploadPending: boolean;
  isIconPanelOpen: boolean;
  isShapeMenuOpen: boolean;
  onAddChart: () => void;
  onAddText: () => void;
  onOpenAnimation: () => void;
  onOpenImagePicker: () => void;
  onOpenIconLibrary: () => void;
  onRedo: () => void;
  onSelectTool: () => void;
  onToggleShapeMenu: () => void;
  onUndo: () => void;
  redoDisabled: boolean;
  selectedElementAnimationCount: number;
  selectionProperties: ReactNode;
  shapeMenuButtonRef: RefObject<HTMLButtonElement | null>;
  undoDisabled: boolean;
};

export function EditorToolbar(props: EditorToolbarProps) {
  const editDisabledTitle = props.canUseCurrentSlide
    ? undefined
    : "특수 장표는 장표 설정에서 관리합니다.";

  return (
    <div className="stage-top-controls">
      <div className="editor-toolbar">
        <div className="tool-group">
          <button aria-label="실행 취소" className="icon-button history-nav-button" disabled={props.undoDisabled} title="Undo" type="button" onClick={props.onUndo}>
            <IconArrowBackUp className="history-nav-icon" size={17} />
          </button>
          <button aria-label="다시 실행" className="icon-button history-nav-button" disabled={props.redoDisabled} title="Redo" type="button" onClick={props.onRedo}>
            <IconArrowForwardUp className="history-nav-icon" size={17} />
          </button>
          <button aria-label="선택 도구" className={`icon-button ${props.insertTool === "select" ? "selected-tool" : ""}`} disabled={!props.canUseCurrentSlide} title={editDisabledTitle ?? "Select"} type="button" onClick={props.onSelectTool}>
            <MousePointer2 size={14} />
          </button>
          <div className="toolbar-divider" />
          <button aria-label="텍스트" className="tool-button" disabled={!props.canUseCurrentSlide} title={editDisabledTitle} type="button" onClick={props.onAddText}>
            <Type size={14} /><span className="tool-button-label">텍스트</span>
          </button>
          <div className="shape-menu-anchor">
            <button
              aria-expanded={props.isShapeMenuOpen}
              aria-haspopup="menu"
              aria-label="도형"
              className={`tool-button ${props.isShapeMenuOpen || props.insertTool === "customShape" ? "active" : ""}`}
              disabled={!props.canUseCurrentSlide}
              ref={props.shapeMenuButtonRef}
              title={editDisabledTitle}
              type="button"
              onClick={props.onToggleShapeMenu}
            >
              <Shapes size={14} /><span className="tool-button-label">도형</span><ChevronDown size={14} />
            </button>
          </div>
          <button aria-label="차트" className="tool-button" disabled={!props.canUseCurrentSlide} title={editDisabledTitle} type="button" onClick={props.onAddChart}>
            <BarChart3 size={14} /><span className="tool-button-label">차트</span>
          </button>
          <button
            aria-label="아이콘"
            className={`tool-button ${props.isIconPanelOpen ? "active" : ""}`}
            disabled={!props.canUseCurrentSlide}
            title={editDisabledTitle}
            type="button"
            onClick={props.onOpenIconLibrary}
          >
            <IconIcons size={14} /><span className="tool-button-label">아이콘</span>
          </button>
          <button aria-label="이미지" className="tool-button" disabled={!props.canUseCurrentSlide || props.isImageUploadPending} title={editDisabledTitle} type="button" onClick={props.onOpenImagePicker}>
            <ImagePlus size={14} /><span className="tool-button-label">이미지</span>
          </button>
          <button
            aria-label="애니메이션"
            className={`tool-button ${props.isAnimationPanelOpen || props.selectedElementAnimationCount > 0 ? "active" : ""}`}
            disabled={!props.canUseCurrentSlide}
            title={editDisabledTitle}
            type="button"
            onClick={props.onOpenAnimation}
          >
            <Sparkles size={14} /><span className="tool-button-label">애니메이션</span>
          </button>
        </div>
        <div className="tool-group">
          <button aria-label="템플릿" className="tool-button" disabled={!props.canUseCurrentSlide} title={editDisabledTitle} type="button"><LayoutTemplate size={14} /><span className="tool-button-label">템플릿</span></button>
        </div>
      </div>
      {props.selectionProperties}
    </div>
  );
}
