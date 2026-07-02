import { describe, expect, it } from "vitest";
import { getPresenterKeyboardCommand } from "./usePresenterKeyboard";

describe("usePresenterKeyboard", () => {
  it.each([" ", "ArrowRight", "PageDown", "Enter"])(
    "maps %s to next-step",
    (key) => {
      expect(getPresenterKeyboardCommand({ key, target: null })).toBe("next-step");
    }
  );

  it.each(["ArrowLeft", "PageUp"])("maps %s to previous-slide", (key) => {
    expect(getPresenterKeyboardCommand({ key, target: null })).toBe("previous-slide");
  });

  it("ignores unrelated keys", () => {
    expect(getPresenterKeyboardCommand({ key: "Escape", target: null })).toBeNull();
  });
});
