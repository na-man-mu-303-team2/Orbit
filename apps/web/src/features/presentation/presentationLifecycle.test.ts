import { describe, expect, it } from "vitest";

import { shouldWarnBeforePresentationUnload } from "./presentationLifecycle";

describe("presentationLifecycle", () => {
  it("warns only while a live presentation can lose in-progress data", () => {
    expect(shouldWarnBeforePresentationUnload("preflight")).toBe(false);
    expect(shouldWarnBeforePresentationUnload("starting")).toBe(false);
    expect(shouldWarnBeforePresentationUnload("active")).toBe(true);
    expect(shouldWarnBeforePresentationUnload("finishing")).toBe(true);
    expect(shouldWarnBeforePresentationUnload("failed")).toBe(false);
  });
});
