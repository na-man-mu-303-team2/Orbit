import { describe, expect, it } from "vitest";

import {
  audienceEffectStatePayloadSchema,
  audienceFeatureSettingsPayloadSchema,
  audiencePrivateRoomPayloadSchema,
  audienceReactionPayloadSchema,
  audienceRoomIdSchema,
  audienceSessionEndedPayloadSchema,
  audienceSlideStatePayloadSchema,
  audienceStatePayloadSchema,
} from "./websocket.schema";

const now = "2026-07-05T00:00:00.000Z";

const session = {
  sessionId: "session_1",
  projectId: "project_1",
  joinCode: "123456",
  status: "live",
  entryStatus: "open",
} as const;

const participant = {
  audienceId: "audience_00000000-0000-4000-8000-000000000001",
  sessionId: "session_1",
  nickname: "orbit",
  joinedAt: now,
  lastSeenAt: now,
  joinedBeforeEnd: true,
} as const;

const state = {
  sessionId: "session_1",
  slideId: "slide_1",
  slideIndex: 0,
  effectState: { revealIds: ["shape_1"] },
  activeInteractionId: null,
  updatedAt: now,
} as const;

const features = {
  sessionId: "session_1",
  qnaEnabled: false,
  aiQnaEnabled: false,
  pollsEnabled: false,
  quizzesEnabled: false,
  reactionsEnabled: false,
  surveyEnabled: false,
  updatedAt: now,
} as const;

describe("websocket audience schemas", () => {
  it("validates audience room id formats", () => {
    expect(audienceRoomIdSchema.parse("presentation:session_1:audience")).toBe(
      "presentation:session_1:audience",
    );
    expect(audienceRoomIdSchema.parse("presentation:session_1:presenter")).toBe(
      "presentation:session_1:presenter",
    );
    expect(
      audienceRoomIdSchema.parse("presentation:session_1:audience:audience_1"),
    ).toBe("presentation:session_1:audience:audience_1");

    expect(() =>
      audienceRoomIdSchema.parse("presentation:session_1"),
    ).toThrow();
  });

  it("validates audience state recovery payloads", () => {
    expect(
      audienceStatePayloadSchema.parse({
        session,
        participant,
        state,
        features,
      }),
    ).toEqual({
      session,
      participant,
      state,
      features,
    });
  });

  it("rejects unsafe slide and effect payload fields", () => {
    expect(() =>
      audienceSlideStatePayloadSchema.parse({
        state: {
          ...state,
          effectState: { presenterScript: "private" },
        },
      }),
    ).toThrow();

    expect(() =>
      audienceEffectStatePayloadSchema.parse({
        sessionId: "session_1",
        slideId: "slide_1",
        effectState: { speakerNotes: "private" },
        updatedAt: now,
      }),
    ).toThrow();
  });

  it("validates feature settings and private audience room payloads", () => {
    expect(audienceFeatureSettingsPayloadSchema.parse({ features })).toEqual({
      features,
    });

    expect(
      audienceReactionPayloadSchema.parse({
        sessionId: "session_1",
        audienceId: participant.audienceId,
        reaction: "clap",
      }),
    ).toEqual({
      sessionId: "session_1",
      audienceId: participant.audienceId,
      reaction: "clap",
    });

    expect(() =>
      audienceReactionPayloadSchema.parse({
        sessionId: "session_1",
        audienceId: participant.audienceId,
        reaction: "custom",
      }),
    ).toThrow();

    expect(
      audiencePrivateRoomPayloadSchema.parse({
        sessionId: "session_1",
        audienceId: participant.audienceId,
      }),
    ).toEqual({
      sessionId: "session_1",
      audienceId: participant.audienceId,
    });
  });

  it("validates audience session-ended payloads", () => {
    expect(
      audienceSessionEndedPayloadSchema.parse({
        session: { ...session, status: "ended", entryStatus: "closed" },
      }),
    ).toEqual({
      session: { ...session, status: "ended", entryStatus: "closed" },
    });
  });
});
