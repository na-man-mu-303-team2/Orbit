import type { DeckElement } from "@orbit/shared";
import { describe, expect, it } from "vitest";

import { createDemoDeck } from "../index";
import { applyDeckPatch } from "./applyPatch";
import {
  createAddElementPatch,
  createDuplicateElementPatch,
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

  it("marks elements added to imported decks as authored without copying capabilities", () => {
    const deck = createDemoDeck();
    deck.metadata.sourceType = "import";
    const source = {
      ...deck.slides[0].elements[0],
      elementId: "el_authored_copy",
      ooxmlOrigin: "imported" as const,
      ooxmlEditCapabilities: {
        richText: "full" as const,
        crop: "picture" as const,
        tableCellText: true
      }
    };

    const patch = createAddElementPatch(deck, "slide_1", source);
    const operation = patch.operations[0];

    expect(operation?.type).toBe("add_element");
    if (operation?.type === "add_element") {
      expect(operation.element.ooxmlOrigin).toBe("authored");
      expect(operation.element.ooxmlEditCapabilities).toBeUndefined();
    }
    expect(source.ooxmlOrigin).toBe("imported");
    expect(source.ooxmlEditCapabilities).toBeDefined();
  });

  it("duplicates imported nested groups with new authored descendants and locators", () => {
    const deck = createDemoDeck();
    deck.metadata.sourceType = "import";
    const child = {
      ...deck.slides[0].elements[0],
      elementId: "el_imported_child",
      ooxmlOrigin: "imported" as const,
      ooxmlEditCapabilities: {
        richText: "full" as const,
        crop: "none" as const,
        tableCellText: false
      }
    };
    const nestedGroup: DeckElement = {
      elementId: "el_imported_nested_group",
      type: "group",
      x: 100,
      y: 100,
      width: 300,
      height: 200,
      rotation: 0,
      opacity: 1,
      zIndex: 2,
      locked: false,
      visible: true,
      ooxmlOrigin: "imported",
      ooxmlEditCapabilities: {
        richText: "none",
        crop: "none",
        tableCellText: false
      },
      props: { childElementIds: [child.elementId] }
    };
    const rootGroup: DeckElement = {
      ...nestedGroup,
      elementId: "el_imported_root_group",
      zIndex: 3,
      props: { childElementIds: [nestedGroup.elementId] }
    };
    deck.slides[0].elements = [child, nestedGroup, rootGroup];

    const duplicated = createDuplicateElementPatch(
      deck,
      deck.slides[0].slideId,
      rootGroup.elementId
    );

    expect(duplicated).not.toBeNull();
    expect(duplicated?.patch.operations).toHaveLength(3);
    const added = duplicated?.patch.operations.flatMap((operation) =>
      operation.type === "add_element" ? [operation.element] : []
    ) ?? [];
    expect(new Set(added.map((element) => element.elementId)).size).toBe(3);
    expect(added.every((element) => element.ooxmlOrigin === "authored")).toBe(
      true
    );
    expect(
      added.every((element) => element.ooxmlEditCapabilities === undefined)
    ).toBe(true);
    const duplicatedRoot = added.find(
      (element) => element.elementId === duplicated?.duplicateElementId
    );
    expect(duplicatedRoot?.type).toBe("group");
    if (duplicatedRoot?.type === "group") {
      expect(duplicatedRoot.props.childElementIds).not.toContain(
        nestedGroup.elementId
      );
    }
    const result = applyDeckPatch(deck, duplicated!.patch);
    expect(result.ok).toBe(true);
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
