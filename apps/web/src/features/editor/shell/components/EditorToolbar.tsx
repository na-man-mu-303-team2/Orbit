import {
  IconArrowBackUp,
  IconArrowForwardUp,
  IconChartBar as BarChart3,
  IconChevronDown as ChevronDown,
  IconMagnet,
  IconPhotoPlus as ImagePlus,
  IconPointer as MousePointer2,
  IconShape as Shapes,
  IconSparkles as Sparkles,
  IconTemplate as LayoutTemplate,
  IconTypography as Type
} from "@tabler/icons-react";
import type { ReactNode, RefObject } from "react";

import type { InsertTool } from "../editorShellUiStore";
import { useEditorShellUiStore } from "../editorShellUiStore";

export type EditorToolbarAction =
  | "animation"
  | "chart"
  | "image"
  | "shape"
  | "text";

type EditorToolbarProps = {
  actionDisabledReasons?: Partial<Record<EditorToolbarAction, string>>;
  canMutate: boolean;
  canUseCurrentSlide: boolean;
  compactSelectionTrigger: ReactNode;
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
  shapeMenuButtonRef: RefObject<HTMLButtonElement | null>;
  undoDisabled: boolean;
  zoomControl: ReactNode;
};

export function EditorToolbar(props: EditorToolbarProps) {
  const isCanvasSnappingEnabled = useEditorShellUiStore(
    (state) => state.isCanvasSnappingEnabled
  );
  const setIsCanvasSnappingEnabled = useEditorShellUiStore(
    (state) => state.setIsCanvasSnappingEnabled
  );
  const unavailableSlideReason = props.canUseCurrentSlide
    ? undefined
    : "편집할 슬라이드가 필요합니다.";
  const disabledReason = (action: EditorToolbarAction) =>
    props.actionDisabledReasons?.[action] ?? unavailableSlideReason;

  return (
    <div className="stage-top-controls">
      <div
        className={`editor-toolbar ${props.canMutate ? "" : "viewer-zoom-only"}`}
      >
        {props.canMutate ? (
          <>
            {props.compactSelectionTrigger}
            <div className="tool-group">
              <button
                aria-label="실행 취소"
                className="icon-button history-nav-button"
                disabled={props.undoDisabled}
                title="Undo"
                type="button"
                onClick={props.onUndo}
              >
                <IconArrowBackUp className="history-nav-icon" size={17} />
              </button>
              <button
                aria-label="다시 실행"
                className="icon-button history-nav-button"
                disabled={props.redoDisabled}
                title="Redo"
                type="button"
                onClick={props.onRedo}
              >
                <IconArrowForwardUp className="history-nav-icon" size={17} />
              </button>
              <button
                aria-label="선택 도구"
                className={`icon-button ${props.insertTool === "select" ? "selected-tool" : ""}`}
                title="Select"
                type="button"
                onClick={props.onSelectTool}
              >
                <MousePointer2 size={14} />
              </button>
              <button
                aria-label={`스마트 가이드 ${isCanvasSnappingEnabled ? "끄기" : "켜기"}`}
                aria-pressed={isCanvasSnappingEnabled}
                className={`icon-button ${isCanvasSnappingEnabled ? "selected-tool" : ""}`}
                title="스마트 가이드 (Alt로 일시 해제)"
                type="button"
                onClick={() =>
                  setIsCanvasSnappingEnabled((current) => !current)
                }
              >
                <IconMagnet size={14} />
              </button>
              <div className="toolbar-divider" />
              <button
                aria-label="텍스트"
                className="tool-button"
                disabled={Boolean(disabledReason("text"))}
                title={disabledReason("text") ?? "텍스트"}
                type="button"
                onClick={props.onAddText}
              >
                <Type size={14} />
                <span className="tool-button-label">텍스트</span>
              </button>
              <div className="shape-menu-anchor">
                <button
                  aria-expanded={props.isShapeMenuOpen}
                  aria-haspopup="menu"
                  aria-label="도형"
                  className={`tool-button ${props.isShapeMenuOpen || props.insertTool === "customShape" ? "active" : ""}`}
                  disabled={Boolean(disabledReason("shape"))}
                  ref={props.shapeMenuButtonRef}
                  title={disabledReason("shape") ?? "도형"}
                  type="button"
                  onClick={props.onToggleShapeMenu}
                >
                  <Shapes size={14} />
                  <span className="tool-button-label">도형</span>
                  <ChevronDown size={14} />
                </button>
              </div>
              <button
                aria-label="차트"
                className="tool-button"
                disabled={Boolean(disabledReason("chart"))}
                title={disabledReason("chart") ?? "차트"}
                type="button"
                onClick={props.onAddChart}
              >
                <BarChart3 size={14} />
                <span className="tool-button-label">차트</span>
              </button>
              <button
                aria-label="이미지"
                className="tool-button"
                disabled={
                  Boolean(disabledReason("image")) || props.isImageUploadPending
                }
                title={
                  disabledReason("image") ??
                  (props.isImageUploadPending
                    ? "이미지 업로드 중입니다."
                    : "이미지")
                }
                type="button"
                onClick={props.onOpenImagePicker}
              >
                <ImagePlus size={14} />
                <span className="tool-button-label">이미지</span>
              </button>
              <button
                aria-label="애니메이션"
                className={`tool-button ${props.isAnimationPanelOpen || props.selectedElementAnimationCount > 0 ? "active" : ""}`}
                disabled={Boolean(disabledReason("animation"))}
                title={disabledReason("animation") ?? "애니메이션"}
                type="button"
                onClick={props.onOpenAnimation}
              >
                <Sparkles size={14} />
                <span className="tool-button-label">애니메이션</span>
              </button>
            </div>
            <div className="tool-group">
              <button aria-label="템플릿" className="tool-button" type="button">
                <LayoutTemplate size={14} />
                <span className="tool-button-label">템플릿</span>
              </button>
            </div>
          </>
        ) : null}
        {props.zoomControl}
      </div>
    </div>
  );
}
