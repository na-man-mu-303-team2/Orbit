import { describe, expect, it } from "vitest";
import { orbitDesignTokens } from "./tokens";

function pixels(value: string) {
  return Number.parseFloat(value.replace("px", ""));
}

describe("ORBIT typography tokens", () => {
  it("keeps readable UI text at or above the documented minimum", () => {
    expect(pixels(orbitDesignTokens.type.caption)).toBeGreaterThanOrEqual(12);
    expect(pixels(orbitDesignTokens.type.uiSmall)).toBeGreaterThanOrEqual(13);
    expect(pixels(orbitDesignTokens.type.ui)).toBeGreaterThanOrEqual(14);
    expect(pixels(orbitDesignTokens.type.bodySmall)).toBeGreaterThanOrEqual(14);
    expect(pixels(orbitDesignTokens.type.body)).toBeGreaterThanOrEqual(16);
  });

  it("provides intermediate steps between body and display text", () => {
    expect(pixels(orbitDesignTokens.type.bodyLarge)).toBe(18);
    expect(pixels(orbitDesignTokens.type.subheading)).toBe(20);
    expect(pixels(orbitDesignTokens.type.heading)).toBe(26);
    expect(orbitDesignTokens.type.pageTitle).toContain("3rem");
  });
});
