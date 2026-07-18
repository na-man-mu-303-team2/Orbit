import { describe, expect, it } from "vitest";

import {
  getImageElementCssLayout,
  getImageElementLayout,
  getInitialImageCrop,
  minimumImageCropVisibleArea,
  normalizeImageCrop,
  panImageCrop,
  zoomImageCrop
} from "./imageElementLayout";

describe("imageElementLayout", () => {
  it("normalizes invalid edges while preserving a valid persisted crop", () => {
    const invalid = normalizeImageCrop({
      left: 0.8,
      top: 0.9,
      right: 0.7,
      bottom: 0.6
    });
    const persisted = { left: 0.475, top: 0, right: 0.475, bottom: 0 };

    expect(invalid.left + invalid.right).toBeLessThan(1);
    expect(invalid.top + invalid.bottom).toBeLessThan(1);
    expect(normalizeImageCrop(persisted)).toEqual(persisted);
  });

  it("keeps visible size invariant while panning and bounds zoom", () => {
    const start = { left: 0.2, top: 0.1, right: 0.2, bottom: 0.3 };
    const panned = panImageCrop({
      crop: start,
      deltaX: 10_000,
      deltaY: -10_000,
      frameHeight: 400,
      frameWidth: 600
    });
    const zoomed = zoomImageCrop({
      anchorX: 0.5,
      anchorY: 0.5,
      crop: start,
      scale: 10_000
    });

    expect(1 - panned.left - panned.right).toBeCloseTo(0.6);
    expect(1 - panned.top - panned.bottom).toBeCloseTo(0.6);
    expect(
      (1 - zoomed.left - zoomed.right) *
        (1 - zoomed.top - zoomed.bottom)
    ).toBeCloseTo(minimumImageCropVisibleArea);
  });

  it("shares one source crop layout between rendering and the HTML draft", () => {
    const crop = { left: 0.25, top: 0, right: 0.25, bottom: 0 };
    const layout = getImageElementLayout({
      crop,
      fit: "cover",
      focusX: 0.5,
      focusY: 0.5,
      frameHeight: 200,
      frameWidth: 200,
      imageHeight: 200,
      imageWidth: 400
    });

    expect(layout.crop).toEqual({ height: 200, width: 200, x: 100, y: 0 });
    expect(
      getImageElementCssLayout({
        frameHeight: 200,
        frameWidth: 200,
        imageHeight: 200,
        imageWidth: 400,
        layout
      })
    ).toEqual({ height: 200, left: -100, top: 0, width: 400 });
    expect(
      getInitialImageCrop({
        imageProps: { crop, fit: "cover", focusX: 0.5, focusY: 0.5 },
        frameHeight: 200,
        frameWidth: 200,
        imageHeight: 200,
        imageWidth: 400
      })
    ).toEqual(crop);
  });
});
