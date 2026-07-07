import { describe, expect, it } from "vitest";

import { runtimeConfigResponseSchema } from "./runtime-config.schema";

describe("runtimeConfigResponseSchema", () => {
  it("accepts browser live STT engines exposed by runtime config", () => {
    expect(
      runtimeConfigResponseSchema.parse({ liveSttEngine: "openai-realtime" })
    ).toEqual({ liveSttEngine: "openai-realtime" });
    expect(
      runtimeConfigResponseSchema.parse({ liveSttEngine: "web-speech" })
    ).toEqual({ liveSttEngine: "web-speech" });
  });

  it("rejects local model engines that are not env-switch targets", () => {
    expect(
      runtimeConfigResponseSchema.safeParse({ liveSttEngine: "sherpa" }).success
    ).toBe(false);
    expect(
      runtimeConfigResponseSchema.safeParse({ liveSttEngine: "moonshine" }).success
    ).toBe(false);
  });
});
