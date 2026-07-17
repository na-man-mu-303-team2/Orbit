import type { DeckElement } from "@orbit/shared";
import { describe, expect, it } from "vitest";

import { resolveCanvasMarqueeSelection } from "./useCanvasStageInteractions";

type RectElement = Extract<DeckElement, { type: "rect" }>;

function createRectElement(
  elementId: string,
  overrides: Partial<RectElement> = {}
): RectElement {
  return {
    elementId,
    type: "rect",
    role: "decoration",
    x: 20,
    y: 20,
    width: 40,
    height: 30,
    rotation: 0,
    opacity: 1,
    zIndex: 0,
    locked: false,
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

describe("canvas stage marquee selection", () => {
  it("treats a sub-threshold background gesture as a background click", () => {
    const background = createRectElement("el_background", {
      role: "background",
      x: 0,
      y: 0,
      width: 1920,
      height: 1080,
      locked: true
    });

    expect(
      resolveCanvasMarqueeSelection({
        currentSelection: [],
        elements: [background],
        start: { x: 100, y: 100 },
        end: { x: 101, y: 101 },
        startScreen: { x: 100, y: 100 },
        endScreen: { x: 101, y: 101 },
        surfaceElementId: background.elementId,
        modifiers: {}
      })
    ).toEqual([background.elementId]);
  });

  it("returns the same complete-containment hits for 50%, 100%, and 200% zoom", () => {
    const inside = createRectElement("el_inside");
    const partial = createRectElement("el_partial", {
      x: 180,
      y: 180,
      width: 40,
      height: 40
    });

    for (const scale of [0.5, 1, 2]) {
      expect(
        resolveCanvasMarqueeSelection({
          currentSelection: [],
          elements: [inside, partial],
          start: { x: 200, y: 200 },
          end: { x: 0, y: 0 },
          startScreen: { x: 200 * scale, y: 200 * scale },
          endScreen: { x: 0, y: 0 },
          surfaceElementId: null,
          modifiers: {}
        })
      ).toEqual([inside.elementId]);
    }
  });

  it("applies the pointer-up modifier once to the captured selection", () => {
    const first = createRectElement("el_first");
    const second = createRectElement("el_second", { x: 80 });

    expect(
      resolveCanvasMarqueeSelection({
        currentSelection: [first.elementId],
        elements: [first, second],
        start: { x: 70, y: 10 },
        end: { x: 130, y: 70 },
        startScreen: { x: 70, y: 10 },
        endScreen: { x: 130, y: 70 },
        surfaceElementId: null,
        modifiers: { shiftKey: true }
      })
    ).toEqual([first.elementId, second.elementId]);
  });
});
