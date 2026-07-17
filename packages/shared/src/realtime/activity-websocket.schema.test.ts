import { describe, expect, it } from "vitest";

import {
  activityResultsUpdatedEventSchema,
  presentationActivityEventSchema,
  websocketEventSchema
} from "./websocket.schema";

describe("Activity WebSocket contract", () => {
  it("keeps legacy events parseable", () => {
    expect(
      websocketEventSchema.safeParse({
        type: "slide-changed",
        roomId: "project_1",
        sessionId: "session_1",
        userId: "user_1",
        payload: { deckId: "deck_1", slideId: "slide_1", slideIndex: 0 },
        sentAt: "2026-07-17T00:00:00.000Z"
      }).success
    ).toBe(true);
  });

  it("parses revisioned Activity state events", () => {
    expect(
      presentationActivityEventSchema.safeParse({
        type: "activity-state-changed",
        roomId: "presentation:session_1:audience",
        sessionId: "session_1",
        userId: "system",
        payload: {
          sessionId: "session_1",
          activityId: "activity_1",
          activityRunId: "activity_run_1",
          status: "open",
          revision: 2
        },
        sentAt: "2026-07-17T00:00:00.000Z"
      }).success
    ).toBe(true);
  });

  it("rejects identity and pending raw text in audience result events", () => {
    const result = activityResultsUpdatedEventSchema.safeParse({
      type: "activity-results-updated",
      roomId: "presentation:session_1:audience",
      sessionId: "session_1",
      userId: "system",
      payload: {
        sessionId: "session_1",
        activityRunId: "activity_run_1",
        revision: 3,
        refetch: false,
        publicResult: {
          activityRunId: "activity_run_1",
          activityId: "activity_1",
          status: "results",
          revision: 3,
          responseCount: 1,
          aggregates: [],
          approvedTextEntries: [],
          displayName: "민감 이름 sentinel",
          textEntries: [{ text: "미승인 문구 sentinel" }]
        }
      },
      sentAt: "2026-07-17T00:00:00.000Z"
    });

    expect(result.success).toBe(false);
  });
});
