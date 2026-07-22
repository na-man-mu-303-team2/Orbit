import { describe, expect, it } from "vitest";

import { slideRedesignProgressEventSchema } from "./job-progress.schema";

describe("slideRedesignProgressEventSchema", () => {
  it("uses the common realtime envelope without adding a transport event type", () => {
    const event = slideRedesignProgressEventSchema.parse({
      roomId: "project-1",
      sessionId: "session-1",
      userId: "system",
      sentAt: "2026-07-22T00:00:00.000Z",
      payload: {
        jobId: "job-redesign-1",
        projectId: "project-1",
        sessionId: "session-1",
        stage: "interpreting",
        completedStages: [],
      },
    });

    expect(event.payload.stage).toBe("interpreting");
    expect("type" in event).toBe(false);
  });

  it("only accepts system-authored progress events", () => {
    expect(
      slideRedesignProgressEventSchema.safeParse({
        roomId: "project-1",
        sessionId: "session-1",
        userId: "user-1",
        sentAt: "2026-07-22T00:00:00.000Z",
        payload: {
          jobId: "job-redesign-1",
          projectId: "project-1",
          sessionId: "session-1",
          stage: "interpreting",
          completedStages: [],
        },
      }).success,
    ).toBe(false);
  });
});
