import type { DeckCanvas, DeckElement } from "@orbit/shared";
import { describe, expect, it } from "vitest";

import {
  buildCanvasSnapCandidates,
  canvasResizeBoxToTransformerBox,
  canvasSafeMarginRatios,
  isCanvasResizeHandle,
  resolveCanvasDragInteraction,
  snapCanvasFrame,
  snapCanvasResizeBox,
  transformerBoxToCanvasResizeBox,
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

  it("bypasses drag correction and guides when snapping is off or Alt is held", () => {
    const common = {
      canvas,
      elements: [] as DeckElement[],
      frame: createFrame({ x: 4, y: 4 }),
      movingElementId: "el_moving",
      phase: "move" as const,
      stageScale: 1
    };

    expect(
      resolveCanvasDragInteraction({ ...common, snappingEnabled: false })
    ).toEqual({
      commitFrame: null,
      guides: [],
      previewFrame: common.frame
    });
    expect(
      resolveCanvasDragInteraction({ ...common, bypassSnapping: true })
    ).toEqual({
      commitFrame: null,
      guides: [],
      previewFrame: common.frame
    });
    expect(
      resolveCanvasDragInteraction({
        ...common,
        phase: "end",
        snappingEnabled: false
      })
    ).toEqual({
      commitFrame: common.frame,
      guides: [],
      previewFrame: null
    });
  });

  it.each([
    ["top-left", { x: 203, y: 303 }, ["x", "y"]],
    ["top-center", { x: 150, y: 303 }, ["y"]],
    ["top-right", { x: 97, y: 303 }, ["x", "y"]],
    ["middle-left", { x: 203, y: 260 }, ["x"]],
    ["middle-right", { x: 97, y: 260 }, ["x"]],
    ["bottom-left", { x: 203, y: 217 }, ["x", "y"]],
    ["bottom-center", { x: 150, y: 217 }, ["y"]],
    ["bottom-right", { x: 97, y: 217 }, ["x", "y"]]
  ] as const)(
    "snaps only the moving edges for the %s resize handle",
    (activeHandle, position, expectedAxes) => {
      const target = createRectElement("el_target", {
        height: 20,
        width: 20,
        x: 200,
        y: 300
      });
      const box = {
        height: 80,
        rotation: 0,
        width: 100,
        ...position
      };
      const originalRight = box.x + box.width;
      const originalBottom = box.y + box.height;
      const result = snapCanvasResizeBox({
        activeHandle,
        box,
        canvas,
        elements: [target],
        movingElementId: "el_moving",
        stageScale: 1
      });

      expect(result.guides.map((guide) => guide.axis)).toEqual(expectedAxes);

      if (activeHandle.endsWith("left")) {
        expect(result.box.x).toBe(200);
        expect(result.box.x + result.box.width).toBe(originalRight);
      } else if (activeHandle.endsWith("right")) {
        expect(result.box.x).toBe(box.x);
        expect(result.box.x + result.box.width).toBe(200);
      } else {
        expect(result.box.x).toBe(box.x);
        expect(result.box.width).toBe(box.width);
      }

      if (activeHandle.startsWith("top")) {
        expect(result.box.y).toBe(300);
        expect(result.box.y + result.box.height).toBe(originalBottom);
      } else if (activeHandle.startsWith("bottom")) {
        expect(result.box.y).toBe(box.y);
        expect(result.box.y + result.box.height).toBe(300);
      } else {
        expect(result.box.y).toBe(box.y);
        expect(result.box.height).toBe(box.height);
      }
    }
  );

  it("keeps the opposite corner fixed while snapping a rotated resize box", () => {
    const box = {
      height: 80,
      rotation: Math.PI / 2,
      width: 100,
      x: 77,
      y: 100
    };
    const result = snapCanvasResizeBox({
      activeHandle: "bottom-right",
      box,
      canvas,
      elements: [],
      movingElementId: "el_moving",
      stageScale: 1
    });

    expect(result.box).toMatchObject({
      height: 77,
      rotation: Math.PI / 2,
      width: 100,
      x: 77,
      y: 100
    });
    expect(result.guides).toEqual([
      expect.objectContaining({ axis: "x", kind: "slide-edge", position: 0 })
    ]);
  });

  it.each([0.5, 1, 2])(
    "keeps resize snap tolerance at five screen pixels at scale %s",
    (stageScale) => {
      const withinTolerance = snapCanvasResizeBox({
        activeHandle: "middle-left",
        box: {
          height: 40,
          rotation: 0,
          width: 100,
          x: 4 / stageScale,
          y: 400
        },
        canvas,
        elements: [],
        movingElementId: "el_moving",
        stageScale
      });
      const outsideTolerance = snapCanvasResizeBox({
        activeHandle: "middle-left",
        box: {
          height: 40,
          rotation: 0,
          width: 100,
          x: 6 / stageScale,
          y: 400
        },
        canvas,
        elements: [],
        movingElementId: "el_moving",
        stageScale
      });

      expect(withinTolerance.box.x).toBe(0);
      expect(withinTolerance.guides).toEqual([
        expect.objectContaining({ axis: "x", kind: "slide-edge", position: 0 })
      ]);
      expect(outsideTolerance.box.x).toBe(6 / stageScale);
      expect(outsideTolerance.guides).toEqual([]);
    }
  );

  it("enforces a one-unit minimum without moving the opposite resize edge", () => {
    const result = snapCanvasResizeBox({
      activeHandle: "middle-left",
      box: {
        height: 40,
        rotation: 0,
        width: 0.25,
        x: 300,
        y: 500
      },
      canvas,
      elements: [],
      movingElementId: "el_moving",
      stageScale: 1
    });

    expect(result.box.width).toBe(1);
    expect(result.box.x + result.box.width).toBe(300.25);
    expect(result.guides).toEqual([]);
  });

  it("accepts only the eight resize anchors", () => {
    expect(isCanvasResizeHandle("top-left")).toBe(true);
    expect(isCanvasResizeHandle("bottom-center")).toBe(true);
    expect(isCanvasResizeHandle("rotater")).toBe(false);
    expect(isCanvasResizeHandle(null)).toBe(false);
  });

  it.each([0.5, 1, 2])(
    "round-trips Transformer absolute boxes through canvas coordinates at scale %s",
    (stageScale) => {
      const absoluteBox = {
        height: 160 * stageScale,
        rotation: Math.PI / 4,
        width: 240 * stageScale,
        x: 320 * stageScale,
        y: 180 * stageScale
      };

      expect(
        canvasResizeBoxToTransformerBox(
          transformerBoxToCanvasResizeBox(absoluteBox, stageScale),
          stageScale
        )
      ).toEqual(absoluteBox);
    }
  );
});
