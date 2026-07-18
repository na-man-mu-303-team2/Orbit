import type {
  Deck,
  DeckPatch,
  TableCellProps,
  TableElementProps
} from "@orbit/shared";

export type TableStructureDisabledReason =
  | "empty-grid"
  | "jagged-grid"
  | "merged-cells"
  | "row-track-mismatch"
  | "column-track-mismatch";

export type TableOperationDisabledReason =
  | TableStructureDisabledReason
  | "last-row"
  | "last-column"
  | "row-index-out-of-bounds"
  | "column-index-out-of-bounds"
  | "cell-out-of-bounds"
  | "table-element-not-found"
  | "table-element-type-mismatch";

export type TableOperation =
  | {
      columnIndex: number;
      rowIndex: number;
      text: string;
      type: "update_cell_text";
    }
  | { index: number; type: "insert_row" }
  | { index: number; type: "delete_row" }
  | { index: number; type: "insert_column" }
  | { index: number; type: "delete_column" };

export type TableOperationCapability =
  | { enabled: true }
  | { enabled: false; reason: TableOperationDisabledReason };

export type TableStructureCapability =
  | { enabled: true }
  | { enabled: false; reason: TableStructureDisabledReason };

export type TableOperationPatchResult =
  | {
      nextProps: TableElementProps;
      ok: true;
      patch: DeckPatch;
    }
  | { ok: false; reason: TableOperationDisabledReason };

export function getTableStructureCapability(
  table: TableElementProps
): TableStructureCapability {
  const rowCount = table.rows.length;
  const columnCount = table.rows[0]?.length ?? 0;
  if (rowCount === 0 || columnCount === 0) {
    return structureDisabled("empty-grid");
  }
  if (table.rows.some((row) => row.length !== columnCount)) {
    return structureDisabled("jagged-grid");
  }
  if (
    table.rows.some((row) =>
      row.some((cell) => cell.rowSpan > 1 || cell.colSpan > 1)
    )
  ) {
    return structureDisabled("merged-cells");
  }
  if (table.rowHeights && table.rowHeights.length !== rowCount) {
    return structureDisabled("row-track-mismatch");
  }
  if (table.columnWidths && table.columnWidths.length !== columnCount) {
    return structureDisabled("column-track-mismatch");
  }
  return { enabled: true };
}

export function getTableOperationCapability(
  table: TableElementProps,
  operation: TableOperation
): TableOperationCapability {
  if (operation.type === "update_cell_text") {
    const row = table.rows[operation.rowIndex];
    if (
      !Number.isInteger(operation.rowIndex) ||
      !Number.isInteger(operation.columnIndex) ||
      operation.rowIndex < 0 ||
      operation.columnIndex < 0 ||
      !row?.[operation.columnIndex]
    ) {
      return disabled("cell-out-of-bounds");
    }
    return { enabled: true };
  }

  const structure = getTableStructureCapability(table);
  if (!structure.enabled) {
    return structure;
  }

  const rowCount = table.rows.length;
  const columnCount = table.rows[0]!.length;
  if (operation.type === "insert_row") {
    return isInsertionIndex(operation.index, rowCount)
      ? { enabled: true }
      : disabled("row-index-out-of-bounds");
  }
  if (operation.type === "delete_row") {
    if (!isExistingIndex(operation.index, rowCount)) {
      return disabled("row-index-out-of-bounds");
    }
    if (rowCount === 1) {
      return disabled("last-row");
    }
    return { enabled: true };
  }
  if (operation.type === "insert_column") {
    return isInsertionIndex(operation.index, columnCount)
      ? { enabled: true }
      : disabled("column-index-out-of-bounds");
  }
  if (!isExistingIndex(operation.index, columnCount)) {
    return disabled("column-index-out-of-bounds");
  }
  if (columnCount === 1) {
    return disabled("last-column");
  }
  return { enabled: true };
}

export function createTableOperationPatch(
  deck: Deck,
  slideId: string,
  elementId: string,
  operation: TableOperation
): TableOperationPatchResult {
  const slide = deck.slides.find((candidate) => candidate.slideId === slideId);
  const element = slide?.elements.find(
    (candidate) => candidate.elementId === elementId
  );
  if (!element) {
    return failure("table-element-not-found");
  }
  if (element.type !== "table") {
    return failure("table-element-type-mismatch");
  }

  const capability = getTableOperationCapability(element.props, operation);
  if (!capability.enabled) {
    return failure(capability.reason);
  }

  const nextProps = applyTableOperation(
    element.props,
    { height: element.height, width: element.width },
    operation
  );
  const propsPatch: Record<string, unknown> =
    operation.type === "update_cell_text"
      ? { rows: nextProps.rows }
      : {
          columnWidths: nextProps.columnWidths,
          rowHeights: nextProps.rowHeights,
          rows: nextProps.rows
        };
  const patch: DeckPatch = {
    baseVersion: deck.version,
    deckId: deck.deckId,
    operations: [
      {
        elementId,
        props: propsPatch,
        slideId,
        type: "update_element_props"
      }
    ],
    source: "user"
  };

  return { nextProps, ok: true, patch };
}

function applyTableOperation(
  table: TableElementProps,
  frame: { height: number; width: number },
  operation: TableOperation
): TableElementProps {
  const rows = structuredClone(table.rows);
  if (operation.type === "update_cell_text") {
    rows[operation.rowIndex]![operation.columnIndex] = {
      ...rows[operation.rowIndex]![operation.columnIndex]!,
      text: operation.text
    };
    return { ...structuredClone(table), rows };
  }

  const rowCount = rows.length;
  const columnCount = rows[0]!.length;
  let rowHeights = materializeTracks(
    table.rowHeights,
    rowCount,
    frame.height
  );
  let columnWidths = materializeTracks(
    table.columnWidths,
    columnCount,
    frame.width
  );

  if (operation.type === "insert_row") {
    const templateIndex = insertionTemplateIndex(operation.index, rowCount);
    const inserted = rows[templateIndex]!.map(resetCellContent);
    rows.splice(operation.index, 0, inserted);
    rowHeights = insertAndRedistributeTrack(rowHeights, operation.index);
  } else if (operation.type === "delete_row") {
    rows.splice(operation.index, 1);
    rowHeights = deleteAndRedistributeTrack(rowHeights, operation.index);
  } else if (operation.type === "insert_column") {
    const templateIndex = insertionTemplateIndex(operation.index, columnCount);
    for (const row of rows) {
      row.splice(operation.index, 0, resetCellContent(row[templateIndex]!));
    }
    columnWidths = insertAndRedistributeTrack(
      columnWidths,
      operation.index
    );
  } else {
    for (const row of rows) {
      row.splice(operation.index, 1);
    }
    columnWidths = deleteAndRedistributeTrack(
      columnWidths,
      operation.index
    );
  }

  return {
    ...structuredClone(table),
    columnWidths,
    rowHeights,
    rows
  };
}

function resetCellContent(template: TableCellProps): TableCellProps {
  return {
    ...structuredClone(template),
    colSpan: 1,
    rowSpan: 1,
    text: ""
  };
}

function materializeTracks(
  tracks: number[] | undefined,
  count: number,
  frameSize: number
) {
  if (tracks) {
    return [...tracks];
  }
  const size = frameSize / count;
  return Array.from({ length: count }, () => size);
}

function insertAndRedistributeTrack(tracks: number[], index: number) {
  const total = sumTracks(tracks);
  const templateIndex = insertionTemplateIndex(index, tracks.length);
  const next = [...tracks];
  next.splice(index, 0, tracks[templateIndex]!);
  return redistributeTracks(next, total);
}

function deleteAndRedistributeTrack(tracks: number[], index: number) {
  const total = sumTracks(tracks);
  const next = [...tracks];
  next.splice(index, 1);
  return redistributeTracks(next, total);
}

function redistributeTracks(tracks: number[], total: number) {
  const currentTotal = sumTracks(tracks);
  const scale = total / currentTotal;
  const redistributed = tracks.map((track) => track * scale);
  const redistributedTotal = sumTracks(redistributed);
  redistributed[redistributed.length - 1] =
    redistributed[redistributed.length - 1]! + (total - redistributedTotal);
  return redistributed;
}

function insertionTemplateIndex(index: number, count: number) {
  return index === 0 ? 0 : Math.min(index - 1, count - 1);
}

function isInsertionIndex(index: number, count: number) {
  return Number.isInteger(index) && index >= 0 && index <= count;
}

function isExistingIndex(index: number, count: number) {
  return Number.isInteger(index) && index >= 0 && index < count;
}

function sumTracks(tracks: number[]) {
  return tracks.reduce((sum, track) => sum + track, 0);
}

function disabled(
  reason: TableOperationDisabledReason
): TableOperationCapability {
  return { enabled: false, reason };
}

function structureDisabled(
  reason: TableStructureDisabledReason
): TableStructureCapability {
  return { enabled: false, reason };
}

function failure(
  reason: TableOperationDisabledReason
): TableOperationPatchResult {
  return { ok: false, reason };
}
