import { describe, expect, it } from "vitest";
import { shouldPollFocusedPractice, transitionFocusedPractice } from "./focusedPracticeMachine";

describe("focused practice client machine", () => {
  it("blocks invalid transitions and stops polling terminal state", () => {
    expect(() => transitionFocusedPractice("ready", "result")).toThrow("Invalid");
    expect(transitionFocusedPractice("processing", "result")).toBe("result");
    expect(shouldPollFocusedPractice("terminal")).toBe(false);
  });
});
