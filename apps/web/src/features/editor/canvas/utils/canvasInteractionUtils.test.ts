import type { DeckElement } from "@orbit/shared";
import { describe, expect, it } from "vitest";

import { getElementsIntersectingSelectionRect } from "./canvasInteractionUtils";

function element(
  elementId: string,
  frame: { x: number; y: number; width: number; height: number },
  options: { rotation?: number; visible?: boolean } = {}
) {
  return {
    elementId,
    type: "rect",
    role: "decoration",
    ...frame,
    rotation: options.rotation ?? 0,
    opacity: 1,
    zIndex: 1,
    locked: false,
    visible: options.visible ?? true,
    props: {
      fill: "#ffffff",
      stroke: "#000000",
      strokeWidth: 0,
      borderRadius: 0
    }
  } as DeckElement;
}

describe("getElementsIntersectingSelectionRect", () => {
  it("returns visible elements intersecting the drag selection", () => {
    const elements = [
      element("el_inside", { x: 100, y: 100, width: 120, height: 80 }),
      element("el_partial", { x: 280, y: 180, width: 100, height: 100 }),
      element("el_outside", { x: 600, y: 500, width: 100, height: 100 }),
      element("el_hidden", { x: 120, y: 120, width: 80, height: 80 }, { visible: false })
    ];

    expect(
      getElementsIntersectingSelectionRect(elements, {
        x: 80,
        y: 80,
        width: 240,
        height: 160
      })
    ).toEqual(["el_inside", "el_partial"]);
  });

  it("uses rotated element bounds", () => {
    const rotated = element(
      "el_rotated",
      { x: 300, y: 300, width: 100, height: 40 },
      { rotation: 90 }
    );

    expect(
      getElementsIntersectingSelectionRect([rotated], {
        x: 255,
        y: 320,
        width: 30,
        height: 30
      })
    ).toEqual(["el_rotated"]);
  });
});
