import type { Deck, DeckElement } from "@orbit/shared";
import { describe, expect, it } from "vitest";

import { createDemoDeck } from "../index";
import { applyDeckPatch } from "./applyPatch";
import {
  createElementOrderPatch,
  getTopLevelElementStack
} from "./elementOrder";

type RectElement = Extract<DeckElement, { type: "rect" }>;

function createRectElement(elementId: string, zIndex: number): RectElement {
  return {
    elementId,
    type: "rect",
    role: "decoration",
    x: 0,
    y: 0,
    width: 100,
    height: 80,
    rotation: 0,
    opacity: 1,
    zIndex,
    locked: false,
    visible: true,
    props: {
      fill: "#ffffff",
      stroke: "transparent",
      strokeWidth: 0,
      borderRadius: 0
    }
  };
}

function createDeck(elements: DeckElement[]): Deck {
  const deck = createDemoDeck();
  deck.slides[0]!.elements = elements;
  return deck;
}

function getAppliedTopLevelOrder(deck: Deck, patch: NonNullable<ReturnType<typeof createElementOrderPatch>>) {
  const result = applyDeckPatch(deck, patch);
  expect(result.ok).toBe(true);

  if (!result.ok) {
    throw new Error(result.error.message);
  }

  return {
    order: getTopLevelElementStack(result.deck.slides[0]!.elements).map(
      (element) => element.elementId
    ),
    version: result.deck.version
  };
}

describe("createElementOrderPatch", () => {
  it("normalizes tied zIndex values deterministically before moving one step", () => {
    const back = createRectElement("el_back", 1);
    const selected = createRectElement("el_selected", 5);
    const tied = createRectElement("el_tied", 5);
    const deck = createDeck([selected, tied, back]);
    const patch = createElementOrderPatch({
      deck,
      direction: "forward",
      selectedElementIds: [selected.elementId],
      slideId: deck.slides[0]!.slideId
    });

    expect(patch).not.toBeNull();
    expect(patch?.operations).toEqual([
      expect.objectContaining({ elementId: back.elementId, frame: { zIndex: 0 } }),
      expect.objectContaining({ elementId: tied.elementId, frame: { zIndex: 1 } }),
      expect.objectContaining({ elementId: selected.elementId, frame: { zIndex: 2 } })
    ]);
    expect(getAppliedTopLevelOrder(deck, patch!)).toEqual({
      order: [back.elementId, tied.elementId, selected.elementId],
      version: deck.version + 1
    });
  });

  it("moves a multi-selection as a stable block by one neighbor", () => {
    const elements = [
      createRectElement("el_a", 0),
      createRectElement("el_b", 1),
      createRectElement("el_c", 2),
      createRectElement("el_d", 3)
    ];
    const deck = createDeck(elements);
    const forwardPatch = createElementOrderPatch({
      deck,
      direction: "forward",
      selectedElementIds: ["el_b", "el_c"],
      slideId: deck.slides[0]!.slideId
    });
    const backwardPatch = createElementOrderPatch({
      deck,
      direction: "backward",
      selectedElementIds: ["el_b", "el_c"],
      slideId: deck.slides[0]!.slideId
    });

    expect(getAppliedTopLevelOrder(deck, forwardPatch!).order).toEqual([
      "el_a",
      "el_d",
      "el_b",
      "el_c"
    ]);
    expect(getAppliedTopLevelOrder(deck, backwardPatch!).order).toEqual([
      "el_b",
      "el_c",
      "el_a",
      "el_d"
    ]);
  });

  it("excludes group children from both normalization and selection", () => {
    const child = createRectElement("el_child", 50);
    const other = createRectElement("el_other", 0);
    const group = {
      ...createRectElement("el_group", 1),
      type: "group" as const,
      props: { childElementIds: [child.elementId] }
    } as DeckElement;
    const deck = createDeck([other, child, group]);

    expect(getTopLevelElementStack(deck.slides[0]!.elements).map((element) => element.elementId)).toEqual([
      other.elementId,
      group.elementId
    ]);
    expect(
      createElementOrderPatch({
        deck,
        direction: "forward",
        selectedElementIds: [child.elementId],
        slideId: deck.slides[0]!.slideId
      })
    ).toBeNull();
  });

  it("returns null when a normalized edge selection cannot move", () => {
    const deck = createDeck([
      createRectElement("el_back", 0),
      createRectElement("el_front", 1)
    ]);

    expect(
      createElementOrderPatch({
        deck,
        direction: "forward",
        selectedElementIds: ["el_front"],
        slideId: deck.slides[0]!.slideId
      })
    ).toBeNull();
    expect(
      createElementOrderPatch({
        deck,
        direction: "backward",
        selectedElementIds: ["el_back"],
        slideId: "slide_missing"
      })
    ).toBeNull();
  });
});
