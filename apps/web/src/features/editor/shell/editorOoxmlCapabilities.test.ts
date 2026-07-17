import { createDemoDeck } from "@orbit/editor-core";
import type { Deck, DeckElement, Slide } from "@orbit/shared";
import { describe, expect, it } from "vitest";

import {
  resolveOoxmlEditCapability,
  resolveOoxmlPatchCapability,
} from "./editorOoxmlCapabilities";

describe("resolveOoxmlEditCapability", () => {
  it("keeps legacy imported elements fail closed when provenance is missing", () => {
    const deck = importedDeck();
    const element = deck.slides[0]!.elements[0]!;

    expect(
      resolveOoxmlEditCapability({ deck, element, feature: "rich-text-style" }),
    ).toMatchObject({
      enabled: false,
      reasonCode: "IMPORTED_PROVENANCE_MISSING",
    });
  });

  it("keeps existing generic element edits enabled", () => {
    const deck = createDemoDeck();
    const element = deck.slides[0]!.elements[0]!;

    for (const feature of [
      "element-frame",
      "element-appearance",
      "element-properties",
      "delete-element",
    ] as const) {
      expect(
        resolveOoxmlEditCapability({ deck, element, feature }),
      ).toMatchObject({
        enabled: true,
        reasonCode: "SUPPORTED",
      });
    }

    expect(
      resolveOoxmlEditCapability({ deck, feature: "element-frame" }),
    ).toMatchObject({ enabled: false, reasonCode: "ELEMENT_REQUIRED" });
  });

  it("allows generic slide properties only when a slide is present", () => {
    const deck = createDemoDeck();
    const slide = deck.slides[0]!;

    expect(
      resolveOoxmlEditCapability({ deck, slide, feature: "slide-properties" }),
    ).toMatchObject({ enabled: true, reasonCode: "SUPPORTED" });
    expect(
      resolveOoxmlEditCapability({ deck, feature: "slide-properties" }),
    ).toMatchObject({ enabled: false, reasonCode: "SLIDE_REQUIRED" });
  });

  it("uses explicit imported rich text, crop, and table capabilities", () => {
    const deck = importedDeck();
    const text = importedElement(deck.slides[0]!.elements[0]!, {
      richText: "style-only",
      crop: "none",
      tableCellText: false,
    });
    expect(
      resolveOoxmlEditCapability({
        deck,
        element: text,
        feature: "rich-text-style",
      }),
    ).toMatchObject({ enabled: true, reasonCode: "SUPPORTED" });
    expect(
      resolveOoxmlEditCapability({
        deck,
        element: text,
        feature: "rich-text-content",
      }),
    ).toMatchObject({
      enabled: false,
      reasonCode: "IMPORTED_FEATURE_UNSUPPORTED",
    });

    const image = importedElement(imageElement(), {
      richText: "none",
      crop: "picture",
      tableCellText: false,
    });
    expect(
      resolveOoxmlEditCapability({ deck, element: image, feature: "crop" }),
    ).toMatchObject({ enabled: true });
  });

  it("uses explicit imported frame and delete capabilities only", () => {
    const deck = importedDeck();
    const source = deck.slides[0]!.elements[0]!;
    const permitted = importedElement(source, {
      richText: "none",
      crop: "none",
      tableCellText: false,
      frame: true,
      delete: true,
    });

    for (const feature of ["element-frame", "delete-element"] as const) {
      expect(
        resolveOoxmlEditCapability({ deck, element: permitted, feature }),
      ).toMatchObject({ enabled: true, reasonCode: "SUPPORTED" });
    }
    for (const feature of [
      "element-appearance",
      "element-properties",
    ] as const) {
      expect(
        resolveOoxmlEditCapability({ deck, element: permitted, feature }),
      ).toMatchObject({
        enabled: false,
        reasonCode: "IMPORTED_FEATURE_UNSUPPORTED",
      });
    }

    const denied = importedElement(source, {
      richText: "none",
      crop: "none",
      tableCellText: false,
      frame: false,
      delete: false,
    });
    for (const feature of ["element-frame", "delete-element"] as const) {
      expect(
        resolveOoxmlEditCapability({ deck, element: denied, feature }),
      ).toMatchObject({
        enabled: false,
        reasonCode: "IMPORTED_FEATURE_UNSUPPORTED",
      });
    }

    const unspecified = importedElement(source, {
      richText: "none",
      crop: "none",
      tableCellText: false,
    });
    for (const feature of ["element-frame", "delete-element"] as const) {
      expect(
        resolveOoxmlEditCapability({ deck, element: unspecified, feature }),
      ).toMatchObject({
        enabled: false,
        reasonCode: "IMPORTED_FEATURE_UNSUPPORTED",
      });
    }
  });

  it("uses an explicit image source capability at the patch boundary", () => {
    const deck = importedDeck();
    const image = importedElement(imageElement(), {
      richText: "none",
      crop: "none",
      tableCellText: false,
      frame: false,
      delete: false,
      imageSource: true,
    });
    deck.slides[0]!.elements[0] = image;

    expect(
      resolveOoxmlEditCapability({
        deck,
        element: image,
        feature: "image-source",
      }),
    ).toMatchObject({ enabled: true, reasonCode: "SUPPORTED" });
    expect(
      resolveOoxmlPatchCapability(deck, {
        deckId: deck.deckId,
        baseVersion: deck.version,
        source: "user",
        operations: [
          {
            type: "update_element_props",
            slideId: deck.slides[0]!.slideId,
            elementId: image.elementId,
            props: { alt: "replacement", src: "asset:replacement" },
          },
        ],
      }),
    ).toMatchObject({ enabled: true, reasonCode: "SUPPORTED" });

    deck.slides[0]!.elements[0] = importedElement(image, {
      ...image.ooxmlEditCapabilities!,
      imageSource: false,
    });
    expect(
      resolveOoxmlPatchCapability(deck, {
        deckId: deck.deckId,
        baseVersion: deck.version,
        source: "user",
        operations: [
          {
            type: "update_element_props",
            slideId: deck.slides[0]!.slideId,
            elementId: image.elementId,
            props: { src: "asset:unsafe" },
          },
        ],
      }),
    ).toMatchObject({
      enabled: false,
      reasonCode: "IMPORTED_FEATURE_UNSUPPORTED",
    });
  });

  it("does not treat authored origin alone as serializer support", () => {
    const deck = importedDeck();
    const unsupported: DeckElement = {
      ...deck.slides[0]!.elements[0]!,
      type: "customShape",
      ooxmlOrigin: "authored",
      props: {
        pathData: "M 0 0 L 1 1",
        viewBoxWidth: 1,
        viewBoxHeight: 1,
        fill: "transparent",
        stroke: "transparent",
        strokeWidth: 0,
        closed: true,
        nodes: [],
      },
    };

    for (const feature of [
      "duplicate-element",
      "element-frame",
      "delete-element",
    ] as const) {
      expect(
        resolveOoxmlEditCapability({ deck, element: unsupported, feature }),
      ).toMatchObject({
        enabled: false,
        reasonCode: "AUTHORED_SERIALIZER_UNSUPPORTED",
      });
    }
  });

  it("requires imported target-slide provenance for add-element patches", () => {
    const deck = importedDeck();
    const slide = deck.slides[0]!;
    const element = { ...slide.elements[0]!, elementId: "el_added_text" };
    const patch = {
      deckId: deck.deckId,
      baseVersion: deck.version,
      source: "user" as const,
      operations: [
        {
          type: "add_element" as const,
          slideId: slide.slideId,
          element,
        },
      ],
    };

    expect(resolveOoxmlPatchCapability(deck, patch)).toMatchObject({
      enabled: false,
      reasonCode: "IMPORTED_PROVENANCE_MISSING",
    });

    slide.ooxmlOrigin = "imported";
    expect(resolveOoxmlPatchCapability(deck, patch)).toMatchObject({
      enabled: true,
      reasonCode: "SUPPORTED",
    });
  });

  it("allows authored frame and delete edits within the serializer matrix", () => {
    const deck = importedDeck();
    const element = {
      ...deck.slides[0]!.elements[0]!,
      ooxmlOrigin: "authored" as const,
    };

    for (const feature of ["element-frame", "delete-element"] as const) {
      expect(
        resolveOoxmlEditCapability({ deck, element, feature }),
      ).toMatchObject({ enabled: true, reasonCode: "SUPPORTED" });
    }
    for (const feature of [
      "element-appearance",
      "element-properties",
    ] as const) {
      expect(
        resolveOoxmlEditCapability({ deck, element, feature }),
      ).toMatchObject({
        enabled: false,
        reasonCode: "AUTHORED_SERIALIZER_UNSUPPORTED",
      });
    }
  });

  it("allows plain text updates on authored OOXML text only", () => {
    const deck = importedDeck();
    const element = deck.slides[0]!.elements[0]!;
    expect(element.type).toBe("text");
    if (element.type !== "text") throw new Error("expected text element");
    const plainText: DeckElement = {
      ...element,
      ooxmlOrigin: "authored",
    };

    expect(
      resolveOoxmlEditCapability({
        deck,
        element: plainText,
        feature: "rich-text-content",
      }),
    ).toMatchObject({ enabled: true, reasonCode: "SUPPORTED" });
    expect(
      resolveOoxmlEditCapability({
        deck,
        element: {
          ...element,
          ooxmlOrigin: "authored",
          props: {
            ...element.props,
            runs: [{ text: element.props.text, baseline: "normal" }],
          },
        },
        feature: "rich-text-content",
      }),
    ).toMatchObject({
      enabled: false,
      reasonCode: "AUTHORED_SERIALIZER_UNSUPPORTED",
    });
  });

  it("matches authored add support to the OOXML serializer matrix", () => {
    const deck = importedDeck();
    deck.slides[0]!.ooxmlOrigin = "imported";
    const slide = deck.slides[0]!;
    const source = slide.elements[0]!;
    expect(source.type).toBe("text");
    if (source.type !== "text") throw new Error("expected text element");

    expect(
      resolveOoxmlEditCapability({
        deck,
        element: { ...source, ooxmlOrigin: "authored" },
        feature: "add-element",
        slide,
      }),
    ).toMatchObject({ enabled: true, reasonCode: "SUPPORTED" });
    expect(
      resolveOoxmlEditCapability({
        deck,
        element: {
          ...source,
          ooxmlOrigin: "authored",
          props: { ...source.props, fontWeight: "semibold" },
        },
        feature: "add-element",
        slide,
      }),
    ).toMatchObject({
      enabled: false,
      reasonCode: "AUTHORED_SERIALIZER_UNSUPPORTED",
    });

    const image = { ...imageElement(), ooxmlOrigin: "authored" as const };
    expect(
      resolveOoxmlEditCapability({
        deck,
        element: image,
        feature: "add-element",
        slide,
      }),
    ).toMatchObject({ enabled: true });
    expect(
      resolveOoxmlEditCapability({
        deck,
        element: { ...image, opacity: 0.5 },
        feature: "add-element",
        slide,
      }),
    ).toMatchObject({ enabled: false });
  });

  it("keeps safe main-sequence provenance disabled until the serializer is ready", () => {
    const deck = importedDeck();
    for (const coverage of ["absent", "complete"] as const) {
      const slide = importedSlide(deck.slides[0]!, coverage);
      expect(
        resolveOoxmlEditCapability({
          deck,
          slide,
          feature: "animation-main-sequence",
        }),
      ).toMatchObject({
        enabled: false,
        reasonCode: "ANIMATION_SERIALIZER_NOT_READY",
      });
    }
    for (const coverage of ["unknown", "partial"] as const) {
      const slide = importedSlide(deck.slides[0]!, coverage);
      expect(
        resolveOoxmlEditCapability({
          deck,
          slide,
          feature: "animation-main-sequence",
        }),
      ).toMatchObject({ enabled: false, reasonCode: "MOTION_COVERAGE_UNSAFE" });
    }
  });

  it("denies imported and authored OOXML slide properties", () => {
    const deck = importedDeck();
    const imported = importedSlide(deck.slides[0]!, "absent");
    expect(
      resolveOoxmlEditCapability({
        deck,
        slide: imported,
        feature: "slide-properties",
      }),
    ).toMatchObject({
      enabled: false,
      reasonCode: "IMPORTED_FEATURE_UNSUPPORTED",
    });

    expect(
      resolveOoxmlEditCapability({
        deck,
        slide: { ...imported, ooxmlOrigin: "authored" },
        feature: "slide-properties",
      }),
    ).toMatchObject({
      enabled: false,
      reasonCode: "AUTHORED_SERIALIZER_UNSUPPORTED",
    });
  });
});

function importedDeck(): Deck {
  const deck = createDemoDeck();
  deck.metadata.sourceType = "import";
  return deck;
}

function importedElement(
  element: DeckElement,
  capabilities: NonNullable<DeckElement["ooxmlEditCapabilities"]>,
): DeckElement {
  return {
    ...element,
    ooxmlOrigin: "imported",
    ooxmlEditCapabilities: capabilities,
  };
}

function importedSlide(
  slide: Slide,
  coverage: NonNullable<
    Slide["ooxmlMotionCapabilities"]
  >["importedMainSequenceCoverage"],
): Slide {
  return {
    ...slide,
    ooxmlOrigin: "imported",
    ooxmlMotionCapabilities: {
      transitionWritable: false,
      importedMainSequenceCoverage: coverage,
    },
  };
}

function imageElement(): DeckElement {
  return {
    elementId: "el_image_capability",
    type: "image",
    x: 0,
    y: 0,
    width: 100,
    height: 100,
    rotation: 0,
    opacity: 1,
    zIndex: 1,
    locked: false,
    visible: true,
    props: {
      src: "data:image/png;base64,AA==",
      alt: "",
      fit: "contain",
      focusX: 0.5,
      focusY: 0.5,
    },
  };
}
