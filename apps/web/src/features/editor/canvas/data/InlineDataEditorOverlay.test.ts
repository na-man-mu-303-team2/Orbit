import type { ChartStyle, TableCellProps } from "@orbit/shared";
import { describe, expect, it } from "vitest";

import {
  clampDataEditorFontSize,
  mergeChartStyle,
  updateTableCell
} from "./InlineDataEditorOverlay";

function createCell(text: string): TableCellProps {
  return {
    align: "left",
    borderColor: "#CBD5E1",
    borderWidth: 1,
    colSpan: 1,
    fill: "#FFFFFF",
    fontSize: 18,
    fontWeight: "normal",
    rowSpan: 1,
    text,
    textColor: "#111827",
    verticalAlign: "middle"
  };
}

const chartStyle: ChartStyle = {
  colors: ["#4F81BD"],
  showLegend: true,
  legendPosition: "bottom",
  showDataLabels: false,
  showGrid: true,
  xAxisTitle: "",
  yAxisTitle: "",
  unit: ""
};

describe("inline data editor helpers", () => {
  it("updates only the selected table cell style", () => {
    const rows = [[createCell("A"), createCell("B")]];

    const updated = updateTableCell(rows, 0, 1, {
      fill: "#FF0000",
      fontSize: 28
    });

    expect(updated[0]?.[0]).toEqual(rows[0]?.[0]);
    expect(updated[0]?.[1]).toMatchObject({ fill: "#FF0000", fontSize: 28 });
    expect(updated).not.toBe(rows);
  });

  it("merges chart typography without losing existing style", () => {
    expect(mergeChartStyle(chartStyle, { axisLabelFontSize: 30 })).toMatchObject({
      axisLabelFontSize: 30,
      colors: ["#4F81BD"],
      showLegend: true
    });
  });

  it("clamps editable font sizes", () => {
    expect(clampDataEditorFontSize("2")).toBe(6);
    expect(clampDataEditorFontSize("240")).toBe(200);
    expect(clampDataEditorFontSize("24")).toBe(24);
  });
});
