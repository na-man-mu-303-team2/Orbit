import { describe, expect, it } from "vitest";

import {
  audienceEventSchema,
  audienceFeatureSettingsSchema,
  audienceJoinRequestSchema,
  audienceRealtimeStateSchema,
  audienceSafePayloadSchema,
} from "./audience.schema";

const now = "2026-07-05T00:00:00.000Z";

describe("audience schemas", () => {
  it("validates 6-digit join code requests and required nicknames", () => {
    expect(audienceJoinRequestSchema.parse({ nickname: "  orbit  " })).toEqual({
      nickname: "orbit",
    });

    expect(() => audienceJoinRequestSchema.parse({ nickname: "" })).toThrow();
    expect(() =>
      audienceJoinRequestSchema.parse({ nickname: "orbit", passcode: "1234" }),
    ).toThrow();
  });

  it("rejects presenter-only and sensitive fields in audience payloads", () => {
    const unsafePayloads = [
      { speakerNotes: "do not expose" },
      { slide: { rawTranscript: "raw transcript" } },
      { audio: [{ rawAudio: "base64" }] },
      { presenterScript: "private script" },
      { fileBase64: "Zm9v" },
      { nested: { token: "secret token" } },
    ];

    for (const payload of unsafePayloads) {
      expect(() => audienceSafePayloadSchema.parse(payload)).toThrow();
    }
  });

  it("uses audience-safe payload validation for realtime state and events", () => {
    expect(() =>
      audienceRealtimeStateSchema.parse({
        sessionId: "session_1",
        slideId: "slide_1",
        slideIndex: 0,
        effectState: { speakerNotes: "private" },
        activeInteractionId: null,
        updatedAt: now,
      }),
    ).toThrow();

    expect(() =>
      audienceEventSchema.parse({
        eventId: "event_00000000-0000-4000-8000-000000000001",
        sessionId: "session_1",
        actorType: "presenter",
        actorId: "user_1",
        type: "slide.changed",
        payload: { slideId: "slide_1", presenterScript: "private" },
        occurredAt: now,
      }),
    ).toThrow();
  });

  it("requires Q&A when AI Q&A is enabled", () => {
    expect(() =>
      audienceFeatureSettingsSchema.parse({
        sessionId: "session_1",
        qnaEnabled: false,
        aiQnaEnabled: true,
        pollsEnabled: false,
        quizzesEnabled: false,
        reactionsEnabled: false,
        surveyEnabled: false,
        updatedAt: now,
      }),
    ).toThrow();
  });
});
