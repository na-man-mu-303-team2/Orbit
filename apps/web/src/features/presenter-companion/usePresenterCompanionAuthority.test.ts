import { describe, expect, it } from "vitest";
import {
  createCompanionShareSurfaceId,
  createCompanionSurfaceId,
} from "./usePresenterCompanionAuthority";

describe("createCompanionSurfaceId", () => {
  it("creates a stable bounded opaque surface id", () => {
    const first = createCompanionSurfaceId(
      "slide:with spaces/and-a-very-long-identifier-that-needs-bounding",
    );
    const second = createCompanionSurfaceId(
      "slide:with spaces/and-a-very-long-identifier-that-needs-bounding",
    );

    expect(first).toBe(second);
    expect(first).toMatch(/^[A-Za-z0-9_-]{1,64}$/);
  });

  it("does not collapse distinct unsafe slide ids to the same surface", () => {
    expect(createCompanionSurfaceId("slide:a")).not.toBe(
      createCompanionSurfaceId("slide/a"),
    );
  });

  it("isolates screen-share annotation by share epoch", () => {
    const first = createCompanionShareSurfaceId("share_1");
    const restarted = createCompanionShareSurfaceId("share_2");

    expect(first).toMatch(/^[A-Za-z0-9_-]{1,64}$/);
    expect(first).not.toBe(restarted);
    expect(createCompanionShareSurfaceId("share_1")).toBe(first);
  });
});
