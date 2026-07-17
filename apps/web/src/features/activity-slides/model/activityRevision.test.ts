import { describe, expect, it, vi } from "vitest";

import {
  acceptActivityRevision,
  createActivityRevisionConsumer
} from "./activityRevision";

describe("acceptActivityRevision", () => {
  it("ignores an out-of-order lower revision", () => {
    const current = { revision: 5, value: "fresh" };

    expect(acceptActivityRevision(current, { revision: 4, value: "stale" })).toBe(
      current
    );
    expect(acceptActivityRevision(current, { revision: 6, value: "new" })).toEqual({
      revision: 6,
      value: "new"
    });
  });

  it("refetches only for a newer event in the active presentation session", () => {
    const onRefetch = vi.fn();
    const consumer = createActivityRevisionConsumer({
      current: { revision: 5, runId: "activity_run_1" },
      onRefetch,
      sessionId: "session_1"
    });

    expect(consumer.consume(resultsEvent("session_1", "activity_run_1", 4))).toBe(false);
    expect(consumer.consume(resultsEvent("session_other", "activity_run_1", 6))).toBe(false);
    expect(consumer.consume(resultsEvent("session_1", "activity_run_1", 6))).toBe(true);
    expect(consumer.consume(resultsEvent("session_1", "activity_run_1", 5))).toBe(false);
    expect(onRefetch).toHaveBeenCalledTimes(1);
  });

  it("accepts a new active run even when its revision restarts lower", () => {
    const onRefetch = vi.fn();
    const consumer = createActivityRevisionConsumer({
      current: { revision: 50, runId: "activity_run_old" },
      onRefetch,
      sessionId: "session_1"
    });

    expect(
      consumer.consume({
        type: "active-activity-changed",
        roomId: "presentation:session_1:audience",
        sessionId: "session_1",
        userId: "system",
        sentAt: "2026-07-17T00:00:00.000Z",
        payload: {
          activityId: "activity_new",
          activityRunId: "activity_run_new",
          revision: 1,
          sessionId: "session_1"
        }
      })
    ).toBe(true);
    expect(onRefetch).toHaveBeenCalledTimes(1);
  });
});

function resultsEvent(sessionId: string, runId: string, revision: number) {
  return {
    type: "activity-results-updated",
    roomId: `presentation:${sessionId}:audience`,
    sessionId,
    userId: "system",
    sentAt: "2026-07-17T00:00:00.000Z",
    payload: {
      activityRunId: runId,
      refetch: true,
      revision,
      sessionId
    }
  };
}
