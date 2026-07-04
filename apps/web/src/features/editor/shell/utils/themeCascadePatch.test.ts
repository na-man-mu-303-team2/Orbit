import { applyDeckPatch, createDemoDeck } from "@orbit/editor-core";
import { describe, expect, it } from "vitest";

import { createThemeCascadePatch } from "./themeCascadePatch";

describe("createThemeCascadePatch", () => {
  it("cascades theme controls into visible slide and element properties", () => {
    const deck = createDemoDeck();
    const patch = createThemeCascadePatch(deck, {
      backgroundColor: "#101827",
      accentColor: "#f97316",
      palette: { primary: "#f97316" },
      typography: { bodySize: 34 },
      effects: { borderRadius: 6 }
    });

    const result = applyDeckPatch(deck, patch);

    expect(result.ok).toBe(true);
    if (!result.ok) {
      throw new Error(result.error.message);
    }

    const slide = result.deck.slides[0];
    const bodyText = slide.elements.find((element) => element.elementId === "el_2");
    const roundedShape = slide.elements.find((element) => element.elementId === "el_3");
    const accentLine = slide.elements.find((element) => element.elementId === "el_5");

    expect(slide.style.backgroundColor).toBe("#101827");
    expect(slide.style.accentColor).toBe("#f97316");
    expect((bodyText?.props as { fontSize?: number }).fontSize).toBe(34);
    expect((roundedShape?.props as { borderRadius?: number }).borderRadius).toBe(6);
    expect((accentLine?.props as { stroke?: string }).stroke).toBe("#f97316");
  });
});
