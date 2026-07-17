import { describe, expect, it } from "vitest";

import {
  createSlideIconDataUrl,
  slideIconDefinitions
} from "./slideIconRegistry";

describe("slideIconRegistry", () => {
  it("exposes a curated icon set with unique names", () => {
    expect(slideIconDefinitions.length).toBeGreaterThanOrEqual(30);
    expect(slideIconDefinitions.length).toBeLessThanOrEqual(50);
    expect(new Set(slideIconDefinitions.map((icon) => icon.name)).size).toBe(
      slideIconDefinitions.length
    );
  });

  it("serializes a selected icon as an encoded SVG data URL", () => {
    const dataUrl = createSlideIconDataUrl(slideIconDefinitions[0]!, "#2563eb");

    expect(dataUrl).toMatch(/^data:image\/svg\+xml;charset=utf-8,/);
    expect(decodeURIComponent(dataUrl)).toContain("<svg");
    expect(decodeURIComponent(dataUrl)).toContain("#2563eb");
  });
});
