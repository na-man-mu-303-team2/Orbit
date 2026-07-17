import { describe, expect, it } from "vitest";

import { updateSmartArtTypography } from "./2026071703000-IncreaseSmartArtTypography";

describe("IncreaseSmartArtTypography2026071703000", () => {
  it("increases title and description typography without changing decorations", () => {
    const elements = [
      { elementIdSuffix: "title_0", textField: "title" as const, props: { fontSize: 23 } },
      { elementIdSuffix: "description_0", textField: "description" as const, props: { fontSize: 15 } },
      { elementIdSuffix: "badge_0", props: { fontSize: 18 } },
    ];

    const updated = updateSmartArtTypography("smart_art_classification_grid_4", elements, "up");

    expect(updated.map((element) => element.props?.fontSize)).toEqual([30, 21, 18]);
  });

  it("uses a larger numeric value size for metric cards and restores original sizes", () => {
    const elements = [
      { elementIdSuffix: "title_0", textField: "title" as const, props: { fontSize: 24 } },
      { elementIdSuffix: "description_0", textField: "description" as const, props: { fontSize: 15 } },
    ];

    const updated = updateSmartArtTypography("smart_art_metric_cards_3", elements, "up");
    expect(updated.map((element) => element.props?.fontSize)).toEqual([30, 30]);
    expect(
      updateSmartArtTypography("smart_art_metric_cards_3", updated, "down").map(
        (element) => element.props?.fontSize,
      ),
    ).toEqual([24, 15]);
  });
});
