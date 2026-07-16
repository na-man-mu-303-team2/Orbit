import { describe, expect, it } from "vitest";

import { getPopupMenuTargetIndex } from "./usePopupMenuKeyboard";

describe("getPopupMenuTargetIndex", () => {
  it("wraps Arrow navigation across enabled menu items", () => {
    expect(getPopupMenuTargetIndex(0, 3, "ArrowUp")).toBe(2);
    expect(getPopupMenuTargetIndex(2, 3, "ArrowDown")).toBe(0);
  });

  it("moves Home and End to the menu boundaries", () => {
    expect(getPopupMenuTargetIndex(1, 3, "Home")).toBe(0);
    expect(getPopupMenuTargetIndex(1, 3, "End")).toBe(2);
  });

  it("ignores keys that do not navigate the menu", () => {
    expect(getPopupMenuTargetIndex(1, 3, "Enter")).toBeNull();
  });
});
