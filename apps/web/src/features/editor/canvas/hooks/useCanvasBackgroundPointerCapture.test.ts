import { createDemoDeck } from "@orbit/editor-core";
import type { DeckElement } from "@orbit/shared";
import { describe, expect, it, vi } from "vitest";

import { isCanvasPointInsideElementSelectionArea } from "../utils/canvasInteractionUtils";
import { applyCanvasSelection } from "../utils/canvasSelection";
import { cancelCanvasMarqueeFromKeyboardEvent } from "./useCanvasBackgroundPointerCapture";

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
    const background = createBackgroundElement();

    expect(
      isCanvasPointInsideElementSelectionArea({
        deck,
        element: background,
        point: { x: 10, y: 10 },
        slide
      })
    ).toBe(true);
    expect(
      applyCanvasSelection({
        currentSelection: [],
        elements: [background],
        hitElementIds: [background.elementId]
      })
    ).toEqual([background.elementId]);
  });

  it("owns Escape only while it cancels a marquee draft", () => {
    const preventDefault = vi.fn();
    const stopImmediatePropagation = vi.fn();
    const onCancelMarquee = vi.fn(() => true);

    expect(
      cancelCanvasMarqueeFromKeyboardEvent({
        event: {
          key: "Escape",
          target: null,
          preventDefault,
          stopImmediatePropagation
        },
        onCancelMarquee
      })
    ).toBe(true);
    expect(onCancelMarquee).toHaveBeenCalledTimes(1);
    expect(preventDefault).toHaveBeenCalledTimes(1);
    expect(stopImmediatePropagation).toHaveBeenCalledTimes(1);

    onCancelMarquee.mockReturnValue(false);
    expect(
      cancelCanvasMarqueeFromKeyboardEvent({
        event: {
          key: "Escape",
          target: null,
          preventDefault,
          stopImmediatePropagation
        },
        onCancelMarquee
      })
    ).toBe(false);
    expect(preventDefault).toHaveBeenCalledTimes(1);
    expect(stopImmediatePropagation).toHaveBeenCalledTimes(1);
  });
});
