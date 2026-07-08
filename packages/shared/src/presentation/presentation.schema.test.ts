import { describe, expect, it } from "vitest";

import {
  createPresentationSessionRequestSchema,
  presentationSessionSchema,
} from "./presentation.schema";

describe("presentation session schemas", () => {
  it("accepts join-code session contracts without passcode fields", () => {
    const session = presentationSessionSchema.parse({
      sessionId: "session_1",
      projectId: "project_1",
      deckId: "deck_1",
      presenterUserId: "user_1",
      joinCode: "123456",
      status: "draft",
      entryStatus: "open",
      audienceSlideRenderMode: "image-first",
      createdAt: "2026-07-05T00:00:00.000Z",
      startedAt: null,
      endedAt: null,
      surveyClosesAt: null,
      rawDataDeleteAfter: "2026-08-04T00:00:00.000Z",
    });

    expect(session.joinCode).toBe("123456");
  });

  it("rejects passcode-oriented create payloads", () => {
    expect(() =>
      createPresentationSessionRequestSchema.parse({
        deckId: "deck_1",
        passcode: "1234",
      }),
    ).toThrow();
  });
});
