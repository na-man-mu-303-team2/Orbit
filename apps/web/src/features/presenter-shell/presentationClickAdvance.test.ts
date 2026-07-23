import { describe, expect, it } from "vitest";

import { shouldAdvancePresentationFromClick } from "./presentationClickAdvance";

describe("shouldAdvancePresentationFromClick", () => {
  it("allows a click on slide content and ignores embedded controls", () => {
    expect(
      shouldAdvancePresentationFromClick(
        { closest: () => null } as unknown as EventTarget,
      ),
    ).toBe(true);
    expect(
      shouldAdvancePresentationFromClick(
        { closest: () => ({}) } as unknown as EventTarget,
      ),
    ).toBe(false);
  });
});
