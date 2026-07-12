import { describe, expect, it } from "vitest";

import { runtimeConfigResponseSchema } from "./runtime-config.schema";

describe("runtimeConfigResponseSchema", () => {
  it("accepts browser live STT engines exposed by runtime config", () => {
    expect(
      runtimeConfigResponseSchema.parse({ liveSttEngine: "openai-realtime", adaptiveRehearsalCoachEnabled: false, focusedPracticeEnabled: false, challengeQnaEnabled: false })
    ).toEqual({ liveSttEngine: "openai-realtime", adaptiveRehearsalCoachEnabled: false, focusedPracticeEnabled: false, challengeQnaEnabled: false });
    expect(
      runtimeConfigResponseSchema.parse({ liveSttEngine: "web-speech", adaptiveRehearsalCoachEnabled: false, focusedPracticeEnabled: false, challengeQnaEnabled: false })
    ).toEqual({ liveSttEngine: "web-speech", adaptiveRehearsalCoachEnabled: false, focusedPracticeEnabled: false, challengeQnaEnabled: false });
  });

  it("rejects local model engines that are not env-switch targets", () => {
    expect(
      runtimeConfigResponseSchema.safeParse({ liveSttEngine: "sherpa", adaptiveRehearsalCoachEnabled: false, focusedPracticeEnabled: false, challengeQnaEnabled: false }).success
    ).toBe(false);
    expect(
      runtimeConfigResponseSchema.safeParse({ liveSttEngine: "moonshine", adaptiveRehearsalCoachEnabled: false, focusedPracticeEnabled: false, challengeQnaEnabled: false }).success
    ).toBe(false);
  });
});
