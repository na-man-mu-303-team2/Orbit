import { renderToString } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import {
  completeImageCropDraft,
  getImageCropLocalPointer,
  getImageCropOverlayFrameStyle,
  ImageCropOverlay
} from "./ImageCropOverlay";

describe("ImageCropOverlay", () => {
  it("commits Apply and Reset once while Cancel does not commit", () => {
    const onCommit = vi.fn();
    const crop = { left: 0.2, top: 0.1, right: 0.2, bottom: 0.1 };

    completeImageCropDraft({ action: "apply", crop, onCommit });
    expect(onCommit).toHaveBeenLastCalledWith({ crop });
    expect(onCommit).toHaveBeenCalledTimes(1);

    completeImageCropDraft({ action: "reset", crop, onCommit });
    expect(onCommit).toHaveBeenLastCalledWith({ crop: null });
    expect(onCommit).toHaveBeenCalledTimes(2);

    completeImageCropDraft({ action: "cancel", crop, onCommit });
    expect(onCommit).toHaveBeenCalledTimes(2);
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

  it("renders accessible Apply, Reset, and Cancel controls", () => {
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
    expect(html).toContain("이미지 자르기");
    expect(html).toContain("초기화");
    expect(html).toContain("취소");
    expect(html).toContain("적용");
  });
});
