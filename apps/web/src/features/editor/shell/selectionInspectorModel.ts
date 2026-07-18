export const selectionInspectorCompactBreakpoint = 860;

export type SelectionInspectorOrigin = "canvas" | "validation" | "programmatic";

export type SelectionInspectorMode =
  | {
      mode: "slide";
      selectedElementIds: [];
    }
  | {
      mode: "element";
      selectedElementId: string;
      selectedElementIds: [string];
    }
  | {
      mode: "multi";
      selectedElementIds: string[];
    };

export type SelectionInspectorModel = SelectionInspectorMode & {
  selectedCount: number;
  shouldAutoOpenDesignInspector: boolean;
};

export function resolveSelectionInspectorCompactMode(
  viewportWidth: number | null | undefined,
): boolean | null {
  if (
    viewportWidth === null ||
    viewportWidth === undefined ||
    !Number.isFinite(viewportWidth) ||
    viewportWidth < 0
  ) {
    return null;
  }

  return viewportWidth <= selectionInspectorCompactBreakpoint;
}

export function createSelectionInspectorModel(input: {
  compact: boolean | null | undefined;
  currentSlideElementIds: readonly string[];
  origin: SelectionInspectorOrigin;
  selectedElementIds: readonly string[];
}): SelectionInspectorModel {
  const validElementIds = new Set(input.currentSlideElementIds);
  const seenElementIds = new Set<string>();
  const selectedElementIds = input.selectedElementIds.filter((elementId) => {
    if (!validElementIds.has(elementId) || seenElementIds.has(elementId)) {
      return false;
    }

    seenElementIds.add(elementId);
    return true;
  });
  const selectedCount = selectedElementIds.length;
  const shouldAutoOpenDesignInspector =
    input.origin === "canvas" && input.compact === false && selectedCount > 0;

  if (selectedCount === 0) {
    return {
      mode: "slide",
      selectedCount,
      selectedElementIds: [],
      shouldAutoOpenDesignInspector,
    };
  }

  if (selectedCount === 1) {
    return {
      mode: "element",
      selectedCount,
      selectedElementId: selectedElementIds[0]!,
      selectedElementIds: [selectedElementIds[0]!],
      shouldAutoOpenDesignInspector,
    };
  }

  return {
    mode: "multi",
    selectedCount,
    selectedElementIds,
    shouldAutoOpenDesignInspector,
  };
}
