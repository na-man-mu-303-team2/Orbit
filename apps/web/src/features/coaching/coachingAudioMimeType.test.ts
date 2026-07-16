import { describe, expect, it } from "vitest";
import { normalizeCoachingAudioMimeType } from "./coachingAudioMimeType";

describe("normalizeCoachingAudioMimeType", () => {
  it("removes browser codec parameters before sending the audio contract", () => {
    expect(normalizeCoachingAudioMimeType("audio/webm;codecs=opus")).toBe(
      "audio/webm",
    );
  });

  it("uses the supported WebM fallback for an empty MIME type", () => {
    expect(normalizeCoachingAudioMimeType("")).toBe("audio/webm");
  });
});
