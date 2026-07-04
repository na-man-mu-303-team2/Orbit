import { describe, expect, it } from "vitest";

import {
  audiencePresenterRoomId,
  audiencePrivateRoomId,
  audienceSessionRoomId,
  createRealtimeEvent,
} from "./index";

describe("realtime helpers", () => {
  it("creates audience room ids for session, presenter, and private rooms", () => {
    expect(audienceSessionRoomId("session_1")).toBe(
      "presentation:session_1:audience",
    );
    expect(audiencePresenterRoomId("session_1")).toBe(
      "presentation:session_1:presenter",
    );
    expect(
      audiencePrivateRoomId({
        sessionId: "session_1",
        audienceId: "audience_1",
      }),
    ).toBe("presentation:session_1:audience:audience_1");
  });

  it("creates audience realtime events with explicit room and session ids", () => {
    expect(
      createRealtimeEvent({
        type: "audience:slide-state",
        roomId: audienceSessionRoomId("session_1"),
        sessionId: "session_1",
        userId: "system",
        payload: {
          state: {
            sessionId: "session_1",
            slideId: "slide_1",
            slideIndex: 0,
            effectState: {},
            activeInteractionId: null,
            updatedAt: "2026-07-05T00:00:00.000Z",
          },
        },
      }).roomId,
    ).toBe("presentation:session_1:audience");
  });
});
