import { describe, expect, it } from "vitest";

import {
  parsePresentationActivityEvent,
  presentationAudienceRoomId,
  presentationPresenterRoomId
} from "./index";

describe("presentation Activity realtime helpers", () => {
  it("builds isolated presenter and audience room IDs", () => {
    expect(presentationPresenterRoomId("session_1")).toBe(
      "presentation:session_1:presenter"
    );
    expect(presentationAudienceRoomId("session_1")).toBe(
      "presentation:session_1:audience"
    );
  });

  it("parses a sanitized Activity event", () => {
    expect(
      parsePresentationActivityEvent({
        type: "active-activity-changed",
        roomId: presentationAudienceRoomId("session_1"),
        sessionId: "session_1",
        userId: "system",
        payload: {
          sessionId: "session_1",
          activityId: "activity_1",
          activityRunId: "activity_run_1",
          revision: 1
        },
        sentAt: "2026-07-17T00:00:00.000Z"
      }).type
    ).toBe("active-activity-changed");
  });
});
