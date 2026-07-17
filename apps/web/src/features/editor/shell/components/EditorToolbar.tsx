import {
  IconArrowBackUp,
  IconArrowForwardUp,
  IconChartBar as BarChart3,
  IconChevronDown as ChevronDown,
  IconPhotoPlus as ImagePlus,
  IconPointer as MousePointer2,
  IconShape as Shapes,
  IconSparkles as Sparkles,
  IconTypography as Type
} from "@tabler/icons-react";
import type { ReactNode, RefObject } from "react";

import type { InsertTool } from "../editorShellUiStore";

type EditorToolbarProps = {
  canUseCurrentSlide: boolean;
  insertTool: InsertTool;
  isAnimationPanelOpen: boolean;
  isImageUploadPending: boolean;
  isShapeMenuOpen: boolean;
  onAddChart: () => void;
  onAddText: () => void;
  onOpenAnimation: () => void;
  onOpenImagePicker: () => void;
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
          <button aria-label="선택 도구" className={`icon-button ${props.insertTool === "select" ? "selected-tool" : ""}`} title="Select" type="button" onClick={props.onSelectTool}>
            <MousePointer2 size={14} />
          </button>
          <div className="toolbar-divider" />
          <button aria-label="텍스트 추가" className="tool-button" title="텍스트 추가" type="button" onClick={props.onAddText}>
            <Type size={17} />
          </button>
          <div className="shape-menu-anchor">
            <button
              aria-expanded={props.isShapeMenuOpen}
              aria-haspopup="menu"
              aria-label="도형"
              className={`tool-button ${props.isShapeMenuOpen || props.insertTool === "customShape" ? "active" : ""}`}
              ref={props.shapeMenuButtonRef}
              title="도형 추가"
              type="button"
              onClick={props.onToggleShapeMenu}
            >
              <Shapes size={17} /><ChevronDown size={12} />
            </button>
          </div>
          <button aria-label="차트 추가" className="tool-button" title="차트 추가" type="button" onClick={props.onAddChart}>
            <BarChart3 size={17} />
          </button>
          <button aria-label="이미지 추가" className="tool-button" disabled={!props.canUseCurrentSlide || props.isImageUploadPending} title="이미지 추가" type="button" onClick={props.onOpenImagePicker}>
            <ImagePlus size={17} />
          </button>
          <button
            aria-label="애니메이션"
            className={`tool-button ${props.isAnimationPanelOpen || props.selectedElementAnimationCount > 0 ? "active" : ""}`}
            disabled={!props.canUseCurrentSlide}
            title="애니메이션"
            type="button"
            onClick={props.onOpenAnimation}
          >
            <Sparkles size={17} />
          </button>
        </div>
      </div>
      {props.selectionProperties}
    </div>
  );
}
