import type { DeckCanvas, DeckElement } from "@orbit/shared";
import { describe, expect, it } from "vitest";

import {
  buildCanvasSnapCandidates,
  canvasSafeMarginRatios,
  resolveCanvasDragInteraction,
  snapCanvasFrame,
  type CanvasFrame
} from "./canvasSnapping";

type RectElement = Extract<DeckElement, { type: "rect" }>;

const canvas: DeckCanvas = {
  aspectRatio: "16:9",
  height: 1080,
  preset: "wide-16-9",
  width: 1920
};

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

function createFrame(overrides: Partial<CanvasFrame> = {}): CanvasFrame {
  return {
    height: 80,
    rotation: 0,
    width: 100,
    x: 0,
    y: 0,
    ...overrides
  };
}

describe("canvasSnapping", () => {
  it("builds slide, safe-margin, and visible top-level element candidates", () => {
    const child = createRectElement("el_child", { x: 400 });
    const hidden = createRectElement("el_hidden", { visible: false, x: 500 });
    const selected = createRectElement("el_selected", { x: 600 });
    const locked = createRectElement("el_locked", { locked: true, x: 700 });
    const group = {
      ...createRectElement("el_group", { x: 300 }),
      type: "group" as const,
      props: { childElementIds: [child.elementId] }
    } as DeckElement;
    const candidates = buildCanvasSnapCandidates({
      canvas,
      elements: [child, hidden, selected, locked, group],
      movingElementId: "el_group",
      selectedElementIds: [selected.elementId]
    });

    expect(
      candidates
        .filter((candidate) => candidate.axis === "x" && candidate.kind !== "element")
        .map((candidate) => candidate.position)
    ).toEqual([
      0,
      canvas.width / 2,
      canvas.width,
      canvas.width * canvasSafeMarginRatios.horizontal,
      canvas.width * (1 - canvasSafeMarginRatios.horizontal)
    ]);
    expect(
      candidates
        .filter((candidate) => candidate.axis === "y" && candidate.kind !== "element")
        .map((candidate) => candidate.position)
    ).toEqual([
      0,
      canvas.height / 2,
      canvas.height,
      canvas.height * canvasSafeMarginRatios.vertical,
      canvas.height * (1 - canvasSafeMarginRatios.vertical)
    ]);
    expect(
      [...new Set(candidates.flatMap((candidate) => candidate.elementId ?? []))]
    ).toEqual([locked.elementId]);
  });

  it.each([0.5, 1, 2])(
    "keeps the snap tolerance at five screen pixels at scale %s",
    (stageScale) => {
      const withinTolerance = snapCanvasFrame({
        canvas,
        elements: [],
        frame: createFrame({ x: 4 / stageScale, y: 173 }),
        movingElementId: "el_moving",
        stageScale
      });
      const outsideTolerance = snapCanvasFrame({
        canvas,
        elements: [],
        frame: createFrame({ x: 6 / stageScale, y: 173 }),
        movingElementId: "el_moving",
        stageScale
      });

      expect(withinTolerance.frame.x).toBe(0);
      expect(withinTolerance.guides.some((guide) => guide.axis === "x")).toBe(true);
      expect(outsideTolerance.frame.x).toBe(6 / stageScale);
      expect(outsideTolerance.guides.some((guide) => guide.axis === "x")).toBe(false);
    }
  );

  it("chooses the nearest candidate independently on each axis", () => {
    const horizontalTarget = createRectElement("el_x", {
      x: 200,
      y: 650,
      width: 20,
      height: 20
    });
    const nearerHorizontalTarget = createRectElement("el_nearer_x", {
      x: 205,
      y: 700,
      width: 20,
      height: 20
    });
    const verticalTarget = createRectElement("el_y", {
      x: 800,
      y: 300,
      width: 20,
      height: 20
    });
    const result = snapCanvasFrame({
      canvas,
      elements: [horizontalTarget, nearerHorizontalTarget, verticalTarget],
      frame: createFrame({ height: 20, width: 20, x: 204, y: 297 }),
      movingElementId: "el_moving",
      stageScale: 1
    });

    expect(result.frame).toMatchObject({ x: 205, y: 300 });
    expect(result.guides).toEqual([
      expect.objectContaining({
        axis: "x",
        elementId: nearerHorizontalTarget.elementId
      }),
      expect.objectContaining({ axis: "y", elementId: verticalTarget.elementId })
    ]);
  });

  it("snaps complete rotated AABBs while preserving the element rotation", () => {
    const rotatedTarget = createRectElement("el_target", {
      x: 300,
      y: 200,
      width: 100,
      height: 40,
      rotation: 90
    });
    const result = snapCanvasFrame({
      canvas,
      elements: [rotatedTarget],
      frame: createFrame({ height: 20, rotation: 90, width: 80, x: 283, y: 517 }),
      movingElementId: "el_moving",
      stageScale: 1
    });

    expect(result.frame).toMatchObject({ x: 280, y: 517, rotation: 90 });
    expect(result.guides).toContainEqual(
      expect.objectContaining({ axis: "x", elementId: rotatedTarget.elementId, position: 260 })
    );
  });

  it("keeps drag moves preview-only and clears guides on end or cancel", () => {
    const common = {
      canvas,
      elements: [] as DeckElement[],
      frame: createFrame({ x: 4, y: 4 }),
      movingElementId: "el_moving",
      stageScale: 1
    };
    const move = resolveCanvasDragInteraction({ ...common, phase: "move" });
    const end = resolveCanvasDragInteraction({ ...common, phase: "end" });
    const cancel = resolveCanvasDragInteraction({ ...common, phase: "cancel" });

    expect(move).toMatchObject({
      commitFrame: null,
      previewFrame: { x: 0, y: 0 }
    });
    expect(move.guides).toHaveLength(2);
    expect(end).toMatchObject({
      commitFrame: { x: 0, y: 0 },
      guides: [],
      previewFrame: null
    });
    expect(cancel).toEqual({
      commitFrame: null,
      guides: [],
      previewFrame: null
    });
  });
});
