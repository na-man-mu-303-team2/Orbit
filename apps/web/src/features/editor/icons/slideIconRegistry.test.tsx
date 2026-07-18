import { describe, expect, it } from "vitest";

import {
  createSlideIconDataUrl,
  slideArrowIconDefinitions,
  slideIconDefinitions
} from "./slideIconRegistry";

describe("slideIconRegistry", () => {
  it("exposes a curated icon set with unique names", () => {
    expect(slideIconDefinitions.length).toBeGreaterThanOrEqual(60);
    expect(slideIconDefinitions.length).toBeLessThanOrEqual(80);
    expect(new Set(slideIconDefinitions.map((icon) => icon.name)).size).toBe(
      slideIconDefinitions.length
    );
  });

  it("provides a searchable arrow and flow asset pack", () => {
    expect(slideArrowIconDefinitions.length).toBeGreaterThanOrEqual(12);
    expect(
      slideArrowIconDefinitions.every(
        (icon) =>
          icon.category === "arrow" &&
          icon.keywords.includes("화살표") &&
          Boolean(icon.defaultWidth) &&
          Boolean(icon.defaultHeight),
      ),
    ).toBe(true);
  });

  it("serializes presentation arrows with their slide-ready aspect ratio", () => {
    const arrow = slideArrowIconDefinitions[0]!;
    const dataUrl = createSlideIconDataUrl(arrow, "#2563eb");
    const markup = decodeURIComponent(dataUrl);

    expect(arrow.defaultWidth).toBeGreaterThan(arrow.defaultHeight ?? 0);
    expect(markup).toContain(`width=\"${arrow.defaultWidth}\"`);
    expect(markup).toContain(`height=\"${arrow.defaultHeight}\"`);
    expect(markup).toContain("#2563eb");
  });

  it("serializes a selected icon as an encoded SVG data URL", () => {
    const dataUrl = createSlideIconDataUrl(slideIconDefinitions[0]!, "#2563eb");

    expect(dataUrl).toMatch(/^data:image\/svg\+xml;charset=utf-8,/);
    expect(decodeURIComponent(dataUrl)).toContain("<svg");
    expect(decodeURIComponent(dataUrl)).toContain("#2563eb");
  });
});
