import { describe, expect, it } from "vitest";

import { createDemoDeck } from "../index";
import { applyDeckPatch } from "./applyPatch";
import {
  createAddElementPatch,
  createDeleteElementPatch,
  createElementId,
  createUpdateElementPropsPatch
} from "./elementOperations";

describe("element operation helpers", () => {
  it("creates a unique element id", () => {
    const deck = createDemoDeck();
    expect(createElementId(deck)).toBe("el_11");
  });

  it("creates an add_element patch", () => {
    const deck = createDemoDeck();
    const patch = createAddElementPatch(deck, "slide_1", {
      elementId: "el_7",
      type: "rect",
      x: 32,
      y: 48,
      width: 240,
      height: 120,
      rotation: 0,
      opacity: 1,
      zIndex: 10,
      locked: false,
      visible: true,
      props: {
        fill: "#dbeafe",
        stroke: "#2563eb",
        strokeWidth: 2,
        borderRadius: 12
      }
    });
    const result = applyDeckPatch(deck, patch);

    expect(result.ok).toBe(true);
  });

  it("marks added imported-deck elements as authored without inherited capabilities", () => {
    const deck = createDemoDeck();
    deck.metadata.sourceType = "import";
    const source = {
      ...deck.slides[0].elements[0],
      elementId: "el_import_copy",
      ooxmlOrigin: "imported" as const,
      ooxmlEditCapabilities: {
        richText: "none" as const,
        crop: "none" as const,
        tableCellText: false,
        frame: true
      }
    };

    const patch = createAddElementPatch(deck, "slide_1", source);
    const operation = patch.operations[0];

    expect(operation.type).toBe("add_element");
    if (operation.type === "add_element") {
      expect(operation.element.ooxmlOrigin).toBe("authored");
      expect(operation.element.ooxmlEditCapabilities).toBeUndefined();
    }
    expect(source.ooxmlOrigin).toBe("imported");
    expect(source.ooxmlEditCapabilities).toBeDefined();
  });

  it("creates an update_element_props patch", () => {
    const deck = createDemoDeck();
    const patch = createUpdateElementPropsPatch(deck, "slide_1", "el_1", {
      text: "Changed"
    });
    const result = applyDeckPatch(deck, patch);

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }

    expect(result.deck.slides[0].elements[0].type).toBe("text");
    if (result.deck.slides[0].elements[0].type === "text") {
      expect(result.deck.slides[0].elements[0].props.text).toBe("Changed");
    }
  });

  it("creates a delete_element patch", () => {
    const deck = createDemoDeck();
    const patch = createDeleteElementPatch(deck, "slide_1", "el_1");
    const result = applyDeckPatch(deck, patch);

    expect(result.ok).toBe(true);
  });
});
