import { describe, expect, it } from "vitest";

import {
  createSavedDesignPackRequestSchema,
  savedDesignPackSchema,
  savedDesignPackSnapshotSchema
} from "./saved-design-pack.schema";

const preferences = {
  palette: { primary: "#2563EB", background: "#FFFFFF" },
  typography: {
    headingFontFamily: "Pretendard",
    bodyFontFamily: "Pretendard",
    lineHeight: 1.24
  },
  tone: "professional" as const,
  density: "medium" as const,
  titleStyle: "action" as const,
  layoutPreference: "varied" as const,
  imageDensity: "low" as const,
  mediaPolicy: "balanced" as const,
  referencePolicy: "topic-only" as const,
  qaStrictness: "standard" as const
};

describe("saved design pack schema", () => {
  it("accepts preference rules and ownership metadata", () => {
    const pack = savedDesignPackSchema.parse({
      id: "design_pack_personal_1",
      ownerType: "user",
      ownerId: "user_1",
      name: "My report pack",
      version: 1,
      baseStylePackId: "brandlogy-modern",
      preferences,
      createdAt: "2026-07-11T00:00:00.000Z",
      updatedAt: "2026-07-11T00:00:00.000Z"
    });

    expect(pack.isDefault).toBe(false);
    expect(pack.preferences.typography.titleSizeScale).toBe(1);
  });

  it("does not accept platform hard-rule overrides", () => {
    const result = createSavedDesignPackRequestSchema.safeParse({
      name: "Unsafe pack",
      preferences: {
        ...preferences,
        minimumBodyFontSize: 12,
        allowLowContrast: true
      }
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.preferences).not.toHaveProperty("minimumBodyFontSize");
      expect(result.data.preferences).not.toHaveProperty("allowLowContrast");
    }
  });

  it("accepts a reproducible deck snapshot without a saved pack id", () => {
    const snapshot = savedDesignPackSnapshotSchema.parse({
      name: "Session Design Pack",
      version: 1,
      baseStylePackId: "brandlogy-modern",
      preferences
    });

    expect(snapshot.id).toBeUndefined();
  });
});
