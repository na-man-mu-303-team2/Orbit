import { describe, expect, it } from "vitest";
import { brandKitSchema, brandKitValuesSchema } from "./brand-kit.schema";

const palette = {
  primary: "#2563EB",
  secondary: "#0F766E",
  background: "#FFFFFF",
  surface: "#FFFFFF",
  muted: "#E0F2FE",
  border: "#BAE6FD",
  text: "#0F172A",
  accentColor: "#F472B6"
};

describe("brand kit schema", () => {
  it("accepts organization brand values and locked fields", () => {
    const kit = brandKitSchema.parse({
      id: "brand_kit_1",
      organizationId: "organization_1",
      name: "ORBIT",
      version: 1,
      values: {
        palette,
        typography: {
          headingFontFamily: "Pretendard",
          bodyFontFamily: "Pretendard"
        },
        lockedFields: ["palette", "typography", "logo"]
      },
      createdAt: "2026-07-11T00:00:00.000Z",
      updatedAt: "2026-07-11T00:00:00.000Z"
    });

    expect(kit.values.typography.fallbackFamily).toBe("Arial");
    expect(kit.values.lockedFields).toEqual(["palette", "typography", "logo"]);
  });

  it("does not expose platform hard-rule switches", () => {
    const values = brandKitValuesSchema.parse({
      palette,
      typography: {
        headingFontFamily: "Pretendard",
        bodyFontFamily: "Pretendard"
      },
      allowOverflow: true
    });

    expect(values).not.toHaveProperty("allowOverflow");
  });

  it("accepts hybrid official and AI image policy", () => {
    const values = brandKitValuesSchema.parse({
      palette,
      typography: {
        headingFontFamily: "Pretendard",
        bodyFontFamily: "Pretendard"
      },
      mediaPolicy: "hybrid",
      lockedFields: ["mediaPolicy"]
    });

    expect(values.mediaPolicy).toBe("hybrid");
  });
});
