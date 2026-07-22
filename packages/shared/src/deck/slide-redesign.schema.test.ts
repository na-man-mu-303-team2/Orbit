import { describe, expect, it } from "vitest";

import { slideRedesignPaletteOptionsSchema } from "./slide-redesign.schema";

const options = [
  {
    optionId: "current-theme",
    name: "현재 테마 유지",
    isCurrentTheme: true,
    palette: {
      dominant: "#FFFFFF",
      surface: "#F8FAFC",
      text: "#111827",
      focal: "#2563EB",
      secondary: "#7C3AED",
    },
    rationale: "현재 테마를 유지합니다.",
  },
  {
    optionId: "calm-blue",
    name: "차분한 블루",
    isCurrentTheme: false,
    palette: {
      dominant: "#EFF6FF",
      surface: "#FFFFFF",
      text: "#172554",
      focal: "#2563EB",
      secondary: "#0F766E",
    },
    rationale: "차분한 인상을 줍니다.",
  },
  {
    optionId: "vivid-coral",
    name: "선명한 코럴",
    isCurrentTheme: false,
    palette: {
      dominant: "#FFF7ED",
      surface: "#FFFFFF",
      text: "#431407",
      focal: "#EA580C",
      secondary: "#DB2777",
    },
    rationale: "강한 인상을 줍니다.",
  },
];

describe("slide redesign palette schema", () => {
  it("accepts exactly three options with the current theme first", () => {
    const parsed = slideRedesignPaletteOptionsSchema.parse(options);

    expect(parsed).toHaveLength(3);
    expect(parsed[0]?.isCurrentTheme).toBe(true);
  });

  it("rejects duplicate option IDs", () => {
    const result = slideRedesignPaletteOptionsSchema.safeParse([
      options[0],
      options[1],
      { ...options[2], optionId: options[1]!.optionId },
    ]);

    expect(result.success).toBe(false);
  });
});
