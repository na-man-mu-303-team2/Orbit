import { describe, expect, it } from "vitest";
import { alignSmartArtCardText } from "./2026071704000-CenterSmartArtCardText";

describe("CenterSmartArtCardText2026071704000", () => {
  it("centers title and description text vertically and horizontally", () => {
    const result = alignSmartArtCardText("smart_art_card_grid_3", [
      { textField: "title", props: { align: "left", verticalAlign: "top" } },
      { textField: "description", props: { align: "left", verticalAlign: "top" } },
      { props: { fill: "#ffffff" } },
    ], "up");

    expect(result[0]?.props).toMatchObject({ align: "center", verticalAlign: "middle" });
    expect(result[1]?.props).toMatchObject({ align: "center", verticalAlign: "middle" });
    expect(result[2]?.props).toEqual({ fill: "#ffffff" });
  });
});
