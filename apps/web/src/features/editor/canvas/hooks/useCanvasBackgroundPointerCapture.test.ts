import { createDemoDeck } from "@orbit/editor-core";
import type { DeckElement } from "@orbit/shared";
import { describe, expect, it } from "vitest";

import { isCanvasPointInsideElementSelectionArea } from "../utils/canvasInteractionUtils";

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

describe("canvas background selection", () => {
  it("treats a full-canvas background as an ordinary selection hit", () => {
    const deck = createDemoDeck();
    const slide = deck.slides[0]!;

    expect(
      isCanvasPointInsideElementSelectionArea({
        deck,
        element: createBackgroundElement(),
        point: { x: 10, y: 10 },
        slide
      })
    ).toBe(true);
  });
});
