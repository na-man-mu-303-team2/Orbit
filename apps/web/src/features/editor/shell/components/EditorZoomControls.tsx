import {
  IconFocusCentered,
  IconZoomIn,
  IconZoomOut
} from "@tabler/icons-react";

type EditorZoomControlsProps = {
  isFitToViewport: boolean;
  onFitToViewport: () => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
  scale: number;
};

export function EditorZoomControls(props: EditorZoomControlsProps) {
  return (
    <div className="canvas-zoom-controls" role="group" aria-label="슬라이드 확대 및 축소">
      <button aria-label="슬라이드 축소" title="축소" type="button" onClick={props.onZoomOut}>
        <IconZoomOut size={16} />
      </button>
      <button
        aria-label="슬라이드를 작업 영역에 맞춤"
        className={props.isFitToViewport ? "active" : ""}
        title="작업 영역에 맞춤"
        type="button"
        onClick={props.onFitToViewport}
      >
        <IconFocusCentered size={16} />
        <span>{Math.round(props.scale * 100)}%</span>
      </button>
      <button aria-label="슬라이드 확대" title="확대" type="button" onClick={props.onZoomIn}>
        <IconZoomIn size={16} />
      </button>
    </div>
  );
}
