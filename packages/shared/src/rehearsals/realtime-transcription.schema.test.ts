import { describe, expect, it } from "vitest";
import {
  realtimeOobClientSecretResponseSchema,
  realtimeTranscriptionClientSecretResponseSchema,
} from "./realtime-transcription.schema";

describe("realtimeTranscriptionClientSecretResponseSchema", () => {
  it("accepts a gpt-realtime-whisper client secret response", () => {
    expect(
      realtimeTranscriptionClientSecretResponseSchema.parse({
        clientSecret: "ek_test",
        delay: "minimal",
        expiresAt: 1790000000,
        model: "gpt-realtime-whisper"
      })
    ).toEqual({
      clientSecret: "ek_test",
      delay: "minimal",
      expiresAt: 1790000000,
      model: "gpt-realtime-whisper"
    });
  });

  it("rejects unknown realtime transcription delay values", () => {
    expect(() =>
      realtimeTranscriptionClientSecretResponseSchema.parse({
        clientSecret: "ek_test",
        delay: "instant",
        expiresAt: 1790000000,
        model: "gpt-realtime-whisper"
      })
    ).toThrow();
  });
});

describe("realtimeOobClientSecretResponseSchema", () => {
  it("accepts a scoped precision session secret without transcription delay", () => {
    expect(
      realtimeOobClientSecretResponseSchema.parse({
        clientSecret: "ek_test",
        expiresAt: 1_790_000_000,
        model: "gpt-realtime-2.1",
      }),
    ).toEqual({
      clientSecret: "ek_test",
      expiresAt: 1_790_000_000,
      model: "gpt-realtime-2.1",
    });
  });
});
