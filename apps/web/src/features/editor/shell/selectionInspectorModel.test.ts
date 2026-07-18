import { describe, expect, it } from "vitest";

import {
  createSelectionInspectorModel,
  resolveSelectionInspectorCompactMode,
} from "./selectionInspectorModel";

const currentSlideElementIds = ["el_1", "el_2", "el_3"];

describe("createSelectionInspectorModel", () => {
  it("returns slide, element, and multi modes for zero, one, and many selections", () => {
    expect(
      createSelectionInspectorModel({
        compact: false,
        currentSlideElementIds,
        origin: "programmatic",
        selectedElementIds: [],
      }),
    ).toMatchObject({
      mode: "slide",
      selectedCount: 0,
      selectedElementIds: [],
    });

    expect(
      createSelectionInspectorModel({
        compact: false,
        currentSlideElementIds,
        origin: "programmatic",
        selectedElementIds: ["el_2"],
      }),
    ).toMatchObject({
      mode: "element",
      selectedCount: 1,
      selectedElementId: "el_2",
      selectedElementIds: ["el_2"],
    });

    expect(
      createSelectionInspectorModel({
        compact: false,
        currentSlideElementIds,
        origin: "programmatic",
        selectedElementIds: ["el_1", "el_3"],
      }),
    ).toMatchObject({
      mode: "multi",
      selectedCount: 2,
      selectedElementIds: ["el_1", "el_3"],
    });
  });

  it("filters stale and duplicate selected ids against the current slide", () => {
    expect(
      createSelectionInspectorModel({
        compact: false,
        currentSlideElementIds,
        origin: "programmatic",
        selectedElementIds: ["stale", "el_2", "el_2", "missing", "el_1"],
      }),
    ).toMatchObject({
      mode: "multi",
      selectedCount: 2,
      selectedElementIds: ["el_2", "el_1"],
    });
  });

  it("only requests Design auto-open for a valid desktop canvas selection", () => {
    for (const testCase of [
      { compact: false, origin: "canvas", selected: ["el_1"], expected: true },
      {
        compact: false,
        origin: "canvas",
        selected: ["stale"],
        expected: false,
      },
      { compact: true, origin: "canvas", selected: ["el_1"], expected: false },
      { compact: null, origin: "canvas", selected: ["el_1"], expected: false },
      {
        compact: undefined,
        origin: "canvas",
        selected: ["el_1"],
        expected: false,
      },
      {
        compact: false,
        origin: "validation",
        selected: ["el_1"],
        expected: false,
      },
      {
        compact: false,
        origin: "programmatic",
        selected: ["el_1"],
        expected: false,
      },
    ] as const) {
      expect(
        createSelectionInspectorModel({
          compact: testCase.compact,
          currentSlideElementIds,
          origin: testCase.origin,
          selectedElementIds: testCase.selected,
        }).shouldAutoOpenDesignInspector,
      ).toBe(testCase.expected);
    }
  });
});

describe("resolveSelectionInspectorCompactMode", () => {
  it("uses the 860px boundary and treats unknown or invalid widths as unknown", () => {
    expect(resolveSelectionInspectorCompactMode(860)).toBe(true);
    expect(resolveSelectionInspectorCompactMode(861)).toBe(false);
    expect(resolveSelectionInspectorCompactMode(null)).toBeNull();
    expect(resolveSelectionInspectorCompactMode(undefined)).toBeNull();
    expect(resolveSelectionInspectorCompactMode(Number.NaN)).toBeNull();
    expect(resolveSelectionInspectorCompactMode(-1)).toBeNull();
  });
});
