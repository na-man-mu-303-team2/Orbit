import { describe, expect, it } from "vitest";

import {
  getImageElementCssLayout,
  getImageElementLayout,
  getInitialImageCrop,
  minimumImageCropVisibleArea,
  normalizeImageCrop,
  normalizeInteractiveImageCrop,
  panImageCrop,
  zoomImageCrop,
} from "./imageElementLayout";

describe("imageElementLayout", () => {
  it("canonicalizes invalid stored edges without expanding a valid narrow crop", () => {
    const invalidCrop = normalizeImageCrop({
      left: 0.8,
      top: 0.9,
      right: 0.7,
      bottom: 0.6,
    });
    const narrowCrop = {
      left: 0.475,
      top: 0,
      right: 0.475,
      bottom: 0,
    };

    expect(invalidCrop.left).toBeGreaterThanOrEqual(0);
    expect(invalidCrop.top).toBeGreaterThanOrEqual(0);
    expect(invalidCrop.right).toBeGreaterThanOrEqual(0);
    expect(invalidCrop.bottom).toBeGreaterThanOrEqual(0);
    expect(invalidCrop.left + invalidCrop.right).toBeLessThan(1);
    expect(invalidCrop.top + invalidCrop.bottom).toBeLessThan(1);
    expect(normalizeImageCrop(narrowCrop)).toEqual(narrowCrop);
  });

  it("enforces the minimum visible area only for interactive normalization", () => {
    const crop = normalizeInteractiveImageCrop({
      left: 0.475,
      top: 0.475,
      right: 0.475,
      bottom: 0.475,
    });
    const visibleWidth = 1 - crop.left - crop.right;
    const visibleHeight = 1 - crop.top - crop.bottom;

    expect(visibleWidth * visibleHeight).toBeCloseTo(
      minimumImageCropVisibleArea,
    );
    expect(visibleWidth).toBeCloseTo(visibleHeight);
  });

  it("keeps the visible size invariant while clamping large pan deltas", () => {
    const start = { left: 0.2, top: 0.1, right: 0.2, bottom: 0.3 };
    const next = panImageCrop({
      crop: start,
      deltaX: 10000,
      deltaY: -10000,
      frameHeight: 400,
      frameWidth: 600,
    });

    expect(1 - next.left - next.right).toBeCloseTo(0.6);
    expect(1 - next.top - next.bottom).toBeCloseTo(0.6);
    expect(next.left).toBe(0);
    expect(next.bottom).toBe(0);
  });

  it("clamps zoom at both the full image and minimum visible area", () => {
    const start = { left: 0.2, top: 0.1, right: 0.2, bottom: 0.3 };
    const zoomedIn = zoomImageCrop({
      anchorX: 0.25,
      anchorY: 0.75,
      crop: start,
      scale: 100,
    });
    const zoomedOut = zoomImageCrop({
      anchorX: 0.5,
      anchorY: 0.5,
      crop: zoomedIn,
      scale: 0.001,
    });

    expect(1 - zoomedIn.left - zoomedIn.right).toBeCloseTo(0.1);
    expect(1 - zoomedIn.top - zoomedIn.bottom).toBeCloseTo(0.1);
    expect(zoomedOut).toEqual({ left: 0, top: 0, right: 0, bottom: 0 });
  });

  it("uses one bounded zoom scale without distorting a cover crop", () => {
    const initialCrop = getInitialImageCrop({
      imageProps: {
        fit: "cover",
        focusX: 0.5,
        focusY: 0.5,
      },
      frameHeight: 200,
      frameWidth: 200,
      imageHeight: 200,
      imageWidth: 400,
    });
    const zoomedOut = zoomImageCrop({
      anchorX: 0.5,
      anchorY: 0.5,
      crop: initialCrop,
      scale: 0.8,
    });
    const zoomedIn = zoomImageCrop({
      anchorX: 0.25,
      anchorY: 0.75,
      crop: initialCrop,
      scale: 10_000,
    });
    const zoomedInVisibleWidth = 1 - zoomedIn.left - zoomedIn.right;
    const zoomedInVisibleHeight = 1 - zoomedIn.top - zoomedIn.bottom;

    expect(initialCrop).toEqual({
      left: 0.25,
      top: 0,
      right: 0.25,
      bottom: 0,
    });
    expect(zoomedOut).toEqual(initialCrop);
    expect(zoomedInVisibleWidth * zoomedInVisibleHeight).toBeCloseTo(
      minimumImageCropVisibleArea,
    );
    expect(
      (400 * zoomedInVisibleWidth) / (200 * zoomedInVisibleHeight),
    ).toBeCloseTo(1);
  });

  it("uses one source crop layout for Konva and the editor HTML preview", () => {
    const layout = getImageElementLayout({
      crop: { left: 0.25, top: 0, right: 0.25, bottom: 0 },
      fit: "cover",
      focusX: 0.5,
      focusY: 0.5,
      frameHeight: 200,
      frameWidth: 200,
      imageHeight: 200,
      imageWidth: 400,
    });
    const css = getImageElementCssLayout({
      frameHeight: 200,
      frameWidth: 200,
      imageHeight: 200,
      imageWidth: 400,
      layout,
    });

    expect(layout.crop).toEqual({ height: 200, width: 200, x: 100, y: 0 });
    expect(css).toEqual({ height: 200, left: -100, top: 0, width: 400 });
  });

  it("renders and reopens a valid five-percent persisted crop unchanged", () => {
    const crop = { left: 0.475, top: 0, right: 0.475, bottom: 0 };
    const layout = getImageElementLayout({
      crop,
      fit: "cover",
      focusX: 0.5,
      focusY: 0.5,
      frameHeight: 100,
      frameWidth: 100,
      imageHeight: 500,
      imageWidth: 1_000,
    });
    const reopenedCrop = getInitialImageCrop({
      imageProps: {
        crop,
        fit: "cover",
        focusX: 0.5,
        focusY: 0.5,
      },
      frameHeight: 100,
      frameWidth: 100,
      imageHeight: 500,
      imageWidth: 1_000,
    });

    expect(layout.crop?.height).toBe(500);
    expect(layout.crop?.width).toBeCloseTo(50);
    expect(layout.crop?.x).toBe(475);
    expect(layout.crop?.y).toBe(0);
    expect(reopenedCrop).toEqual(crop);
  });

  it("handles contain and cover boundaries without distorting the crop draft", () => {
    const containLayout = getImageElementLayout({
      crop: undefined,
      fit: "contain",
      focusX: 0.5,
      focusY: 0.5,
      frameHeight: 200,
      frameWidth: 200,
      imageHeight: 200,
      imageWidth: 400,
    });
    const initialCrop = getInitialImageCrop({
      imageProps: {
        fit: "contain",
        focusX: 0.75,
        focusY: 0.5,
      },
      frameHeight: 200,
      frameWidth: 200,
      imageHeight: 200,
      imageWidth: 400,
    });

    expect(
      getImageElementCssLayout({
        frameHeight: 200,
        frameWidth: 200,
        imageHeight: 200,
        imageWidth: 400,
        layout: containLayout,
      }),
    ).toEqual({ height: 100, left: 0, top: 50, width: 200 });
    expect(initialCrop).toEqual({
      left: 0.375,
      top: 0,
      right: 0.125,
      bottom: 0,
    });
  });
});
