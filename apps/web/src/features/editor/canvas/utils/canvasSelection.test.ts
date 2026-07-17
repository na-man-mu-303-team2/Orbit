import type { DeckElement } from "@orbit/shared";
import { describe, expect, it } from "vitest";

import {
  applyCanvasSelection,
  getMarqueeSelectionElementIds,
  getRotatedElementAabb,
  getSelectableCanvasElements,
  hasReachedCanvasMarqueeThreshold,
  normalizeCanvasSelectionRect
} from "./canvasSelection";

type RectElement = Extract<DeckElement, { type: "rect" }>;

function createRectElement(
  elementId: string,
  overrides: Partial<RectElement> = {}
): RectElement {
  return {
    elementId,
    type: "rect",
    role: "decoration",
    x: 0,
    y: 0,
    width: 100,
    height: 80,
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

describe("canvasSelection", () => {
  it("keeps only visible top-level elements while allowing locked elements", () => {
    const child = createRectElement("el_child");
    const hidden = createRectElement("el_hidden", { visible: false });
    const locked = createRectElement("el_locked", { locked: true });
    const group = {
      ...createRectElement("el_group"),
      type: "group" as const,
      props: { childElementIds: [child.elementId] }
    } as DeckElement;

    expect(
      getSelectableCanvasElements([child, hidden, locked, group]).map(
        (element) => element.elementId
      )
    ).toEqual(["el_locked", "el_group"]);
  });

  it("applies replace, Shift union, and Cmd/Ctrl toggle in stable slide order", () => {
    const elements = [
      createRectElement("el_a"),
      createRectElement("el_b"),
      createRectElement("el_c")
    ];

    expect(
      applyCanvasSelection({
        currentSelection: ["el_b", "missing"],
        elements,
        hitElementIds: ["el_c", "el_a"]
      })
    ).toEqual(["el_a", "el_c"]);
    expect(
      applyCanvasSelection({
        currentSelection: ["el_b"],
        elements,
        hitElementIds: ["el_b", "el_c"],
        modifiers: { shiftKey: true }
      })
    ).toEqual(["el_b", "el_c"]);
    expect(
      applyCanvasSelection({
        currentSelection: ["el_a", "el_b"],
        elements,
        hitElementIds: ["el_b", "el_c"],
        modifiers: { metaKey: true }
      })
    ).toEqual(["el_a", "el_c"]);
    expect(
      applyCanvasSelection({
        currentSelection: ["el_a", "el_b"],
        elements,
        hitElementIds: ["el_b", "el_c"],
        modifiers: { ctrlKey: true, shiftKey: true }
      })
    ).toEqual(["el_a", "el_c"]);
  });

  it("normalizes all drag directions and measures the threshold in screen space", () => {
    expect(normalizeCanvasSelectionRect({ x: 80, y: 70 }, { x: 20, y: 10 })).toEqual({
      x: 20,
      y: 10,
      width: 60,
      height: 60
    });
    expect(
      hasReachedCanvasMarqueeThreshold({
        start: { x: 10, y: 10 },
        end: { x: 12, y: 12 }
      })
    ).toBe(false);
    expect(
      hasReachedCanvasMarqueeThreshold({
        start: { x: 10, y: 10 },
        end: { x: 13, y: 10 }
      })
    ).toBe(true);
  });

  it("uses the complete rotated AABB and rejects partial marquee overlap", () => {
    const rotated = createRectElement("el_rotated", {
      x: 100,
      y: 100,
      width: 100,
      height: 50,
      rotation: 90
    });
    const inside = createRectElement("el_inside", {
      x: 180,
      y: 180,
      width: 20,
      height: 20
    });

    expect(getRotatedElementAabb(rotated)).toEqual({
      x: 50,
      y: 100,
      width: 50,
      height: 100
    });
    expect(
      getMarqueeSelectionElementIds({
        elements: [rotated, inside],
        rect: { x: 50, y: 100, width: 150, height: 100 }
      })
    ).toEqual(["el_rotated", "el_inside"]);
    expect(
      getMarqueeSelectionElementIds({
        elements: [rotated, inside],
        rect: { x: 60, y: 100, width: 140, height: 100 }
      })
    ).toEqual(["el_inside"]);
  });
});
