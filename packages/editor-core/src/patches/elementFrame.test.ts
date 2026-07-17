import { describe, expect, it } from "vitest";

import { createDemoDeck } from "../index";
import { applyDeckPatch } from "./applyPatch";
import {
  createElementFramePatch,
  normalizeElementFrameDraft
} from "./elementFrame";

describe("elementFrame helpers", () => {
  it("normalizes coordinates, size, rotation, opacity, and zIndex", () => {
    const deck = createDemoDeck();
    const element = deck.slides[0].elements[0];
    const frame = normalizeElementFrameDraft(deck.canvas, element, {
      x: -40,
      y: 5000,
      width: 0,
      height: Number.NaN,
      rotation: -45,
      opacity: 4,
      zIndex: -3
    });

    expect(frame).toMatchObject({
      x: 0,
      y: deck.canvas.height,
      width: 1,
      height: 1,
      rotation: 315,
      opacity: 1,
      zIndex: 0
    });
  });

  it("creates an update_element_frame patch that can be applied to a deck", () => {
    const deck = createDemoDeck();
    const patch = createElementFramePatch(deck, "slide_1", "el_1", {
      x: 240,
      y: 180,
      width: 700,
      height: 140,
      rotation: 30
    });
    const result = applyDeckPatch(deck, patch);

    expect(result.ok).toBe(true);

    if (!result.ok) {
      return;
    }

    expect(result.deck.slides[0].elements[0]).toMatchObject({
      x: 240,
      y: 180,
      width: 700,
      height: 140,
      rotation: 30
    });
  });

  it("keeps explicit null role when clearing element role", () => {
    const deck = createDemoDeck();
    const element = deck.slides[0].elements[0];
    const frame = normalizeElementFrameDraft(deck.canvas, element, {
      role: null
    });

    expect(frame.role).toBeNull();
    expect(frame).toEqual({ role: null });
  });

  it("includes the complete geometry but omits untouched presentation fields", () => {
    const deck = createDemoDeck();
    const element = deck.slides[0].elements[0];
    const frame = normalizeElementFrameDraft(deck.canvas, element, {
      x: 240
    });

    expect(frame).toEqual({
      x: 240,
      y: element.y,
      width: element.width,
      height: element.height,
      rotation: element.rotation
    });
  });
});
