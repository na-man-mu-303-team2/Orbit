import { createDemoDeck } from "@orbit/editor-core";
import type { DeckElement } from "@orbit/shared";
import { describe, expect, it } from "vitest";

import { isCanvasBackgroundElement } from "./useCanvasBackgroundPointerCapture";

type RectElement = Extract<DeckElement, { type: "rect" }>;

function createBackgroundElement(
  overrides: Partial<RectElement> = {}
): RectElement {
  return {
    elementId: "el_background",
    type: "rect",
    role: "background",
    x: 0,
    y: 0,
    width: 1920,
    height: 1080,
    rotation: 0,
    opacity: 1,
    zIndex: 0,
    locked: true,
    visible: true,
    props: {
      fill: "#ffffff",
      stroke: "transparent",
      strokeWidth: 0,
      borderRadius: 0
    },
    ...overrides
  };
}

describe("isCanvasBackgroundElement", () => {
  it("treats a full-canvas background as canvas background hit", () => {
    const deck = createDemoDeck();

    expect(isCanvasBackgroundElement(deck, createBackgroundElement())).toBe(
      true
    );
  });

  it("does not treat a partial background shape as canvas background hit", () => {
    const deck = createDemoDeck();

    expect(
      isCanvasBackgroundElement(
        deck,
        createBackgroundElement({ width: 960 })
      )
    ).toBe(false);
  });

  it("does not treat a non-background element as canvas background hit", () => {
    const deck = createDemoDeck();

    expect(
      isCanvasBackgroundElement(
        deck,
        createBackgroundElement({ role: "decoration" })
      )
    ).toBe(false);
  });
});
