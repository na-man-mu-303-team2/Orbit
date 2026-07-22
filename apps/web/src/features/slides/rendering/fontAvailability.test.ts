import { createDemoDeck } from "@orbit/editor-core";
import { describe, expect, it, vi } from "vitest";
import { diagnoseImportedDeckFonts } from "./fontAvailability";

describe("diagnoseImportedDeckFonts", () => {
  it("reports the fallback and affected slide count without changing font names", () => {
    const deck = createDemoDeck();
    const unknownElementId = deck.slides[0]!.elements.find(
      (element) => element.type === "text"
    )?.elementId;
    expect(unknownElementId).toBeTruthy();
    const firstSlide = {
      ...deck.slides[0]!,
      elements: deck.slides[0]!.elements.map((element) =>
        element.type === "text" && element.elementId === unknownElementId
          ? {
              ...element,
              props: {
                ...element.props,
                fontFamily: "Unlisted Presentation Font"
              }
            }
          : element
      )
    };
    const secondSlide = {
      ...structuredClone(firstSlide),
      order: 2,
      slideId: "slide_unknown_font_2"
    };
    const importedDeck = { ...deck, slides: [firstSlide, secondSlide] };
    const check = vi.fn(() => true);

    expect(
      diagnoseImportedDeckFonts(importedDeck, {
        declaredFamilies: ['"INTER"'],
        fontFaceSet: { check }
      })
    ).toEqual([
      {
        affectedSlideCount: 2,
        fallbackFamily: "Arial",
        fontFamily: "Unlisted Presentation Font"
      }
    ]);
    expect(firstSlide.elements).toEqual(importedDeck.slides[0]?.elements);
    expect(check).toHaveBeenCalledWith(
      '400 16px "Inter"',
      "가나다 Orbit"
    );
  });
});
