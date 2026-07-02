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

  it.each(["button", "a[href]", "[role='button']"])(
    "ignores shortcuts when the event target is inside %s",
    (matchedSelector) => {
      expect(
        getPresenterKeyboardCommand({
          key: "Enter",
          target: createClosestTarget(matchedSelector)
        })
      ).toBeNull();
      expect(
        getPresenterKeyboardCommand({
          key: " ",
          target: createClosestTarget(matchedSelector)
        })
      ).toBeNull();
    }
  );
});

function createClosestTarget(matchedSelector: string): EventTarget {
  const target = {
    closest: (selector: string) =>
      selector.includes(matchedSelector) ? target : null,
    isContentEditable: false
  };

  return target as unknown as EventTarget;
}
