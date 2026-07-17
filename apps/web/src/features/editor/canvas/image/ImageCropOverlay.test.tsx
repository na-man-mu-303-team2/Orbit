import { renderToString } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import {
  completeImageCropDraft,
  getImageCropLocalPointer,
  getImageCropOverlayFrameStyle,
  ImageCropOverlay
} from "./ImageCropOverlay";

describe("ImageCropOverlay", () => {
  it("completes one session once and keeps cancel free of Deck mutations", () => {
    const onApply = vi.fn();
    const onCancel = vi.fn();
    const onReset = vi.fn();
    const crop = { left: 0.2, top: 0.1, right: 0.2, bottom: 0.1 };

    const completed = completeImageCropDraft({
      action: "apply",
      completed: false,
      crop,
      onApply,
      onCancel,
      onReset
    });
    completeImageCropDraft({
      action: "reset",
      completed,
      crop,
      onApply,
      onCancel,
      onReset
    });

    expect(onApply).toHaveBeenCalledOnce();
    expect(onApply).toHaveBeenCalledWith(crop);
    expect(onReset).not.toHaveBeenCalled();

    completeImageCropDraft({
      action: "cancel",
      completed: false,
      crop,
      onApply: vi.fn(),
      onCancel,
      onReset: vi.fn()
    });
    expect(onCancel).toHaveBeenCalledOnce();
  });

  it("maps zoom and rotation to the fixed element frame", () => {
    expect(
      getImageCropOverlayFrameStyle(
        { x: 100, y: 200, width: 300, height: 150, rotation: 30 },
        0.5
      )
    ).toEqual({
      height: 75,
      left: 50,
      top: 100,
      transform: "rotate(30deg)",
      transformOrigin: "top left",
      width: 150
    });

    const pointer = getImageCropLocalPointer({
      clientX: 0,
      clientY: 125,
      frame: { x: 100, y: 200, width: 300, height: 150, rotation: 90 },
      rootLeft: 0,
      rootTop: 0,
      stageScale: 0.5
    });

    expect(pointer.x).toBeCloseTo(25);
    expect(pointer.y).toBeCloseTo(50);
  });

  it("renders a modal dialog with explicit crop controls and instructions", () => {
    const html = renderToString(
      <ImageCropOverlay
        frame={{ x: 0, y: 0, width: 400, height: 240, rotation: 0 }}
        imageProps={{
          alt: "Crop fixture",
          fit: "cover",
          focusX: 0.5,
          focusY: 0.5,
          src: "data:image/png;base64,AA=="
        }}
        stageScale={1}
        onApply={vi.fn()}
        onCancel={vi.fn()}
        onReset={vi.fn()}
      />
    );

    expect(html).toContain('role="dialog"');
    expect(html).toContain('aria-modal="true"');
    expect(html).toContain("이미지를 드래그해 위치를 바꾸고");
    expect(html).toContain("초기화");
    expect(html).toContain("취소");
    expect(html).toContain("적용");
  });
});
