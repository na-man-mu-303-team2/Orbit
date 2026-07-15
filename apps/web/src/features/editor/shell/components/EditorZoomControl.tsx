import { IconMinus, IconPlus } from "@tabler/icons-react";

import "./editor-zoom-control.css";

export type EditorZoomControlProps = {
  canZoomIn: boolean;
  canZoomOut: boolean;
  isFit: boolean;
  onFit: () => void;
  onReset: () => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
  zoomPercent: number;
};

export function EditorZoomControl({
  canZoomIn,
  canZoomOut,
  isFit,
  onFit,
  onReset,
  onZoomIn,
  onZoomOut,
  zoomPercent,
}: EditorZoomControlProps) {
  const roundedZoomPercent = Math.round(zoomPercent);

  return (
    <div
      aria-label="캔버스 확대/축소"
      className="editor-zoom-control"
      role="group"
    >
      <button
        aria-label="캔버스 축소"
        className="editor-zoom-control-icon"
        disabled={!canZoomOut}
        type="button"
        onClick={onZoomOut}
      >
        <IconMinus aria-hidden="true" size={16} stroke={2} />
      </button>
      <output
        aria-label="현재 확대/축소"
        aria-live="polite"
        className="editor-zoom-control-value"
      >
        {roundedZoomPercent}%
      </output>
      <button
        aria-label="캔버스 확대"
        className="editor-zoom-control-icon"
        disabled={!canZoomIn}
        type="button"
        onClick={onZoomIn}
      >
        <IconPlus aria-hidden="true" size={16} stroke={2} />
      </button>
      <button
        aria-label="캔버스에 맞추기"
        aria-pressed={isFit}
        className="editor-zoom-control-action"
        type="button"
        onClick={onFit}
      >
        Fit
      </button>
      <button
        aria-label="100%로 보기"
        aria-pressed={!isFit && roundedZoomPercent === 100}
        className="editor-zoom-control-action"
        type="button"
        onClick={onReset}
      >
        100%
      </button>
    </div>
  );
}
