import { describe, expect, it, vi } from "vitest";

import { connectAudienceActivityRealtime } from "./activityRealtimeClient";

describe("connectAudienceActivityRealtime", () => {
  it("joins the audience room, refreshes on reconnect, and ignores lower revisions", () => {
    const listeners = new Map<string, (value?: unknown) => void>();
    const socket = {
      connected: false,
      disconnect: vi.fn(),
      emit: vi.fn(),
      off: vi.fn(),
      on: vi.fn((event: string, listener: (value?: unknown) => void) => {
        listeners.set(event, listener);
        return socket;
      })
    };
    const onRefresh = vi.fn();
    const connection = connectAudienceActivityRealtime(
      {
        current: { revision: 5, runId: "activity_run_1" },
        onRefresh,
        projectId: "project_1",
        sessionId: "session_1"
      },
      () => socket as never
    );

    listeners.get("connect")?.();
    expect(socket.emit).toHaveBeenCalledWith("presentation:audience:join", {
      projectId: "project_1",
      sessionId: "session_1"
    });
    expect(onRefresh).toHaveBeenCalledTimes(1);

    listeners.get("activity-results-updated")?.(resultsEvent(4));
    expect(onRefresh).toHaveBeenCalledTimes(1);
    listeners.get("activity-results-updated")?.(resultsEvent(6));
    expect(onRefresh).toHaveBeenCalledTimes(2);

    connection.disconnect();
    expect(socket.off).toHaveBeenCalledWith("connect", expect.any(Function));
    expect(socket.disconnect).toHaveBeenCalledOnce();
  });
});

function resultsEvent(revision: number) {
  return {
    type: "activity-results-updated",
    roomId: "presentation:session_1:audience",
    sessionId: "session_1",
    userId: "system",
    sentAt: "2026-07-17T00:00:00.000Z",
    payload: {
      activityRunId: "activity_run_1",
      refetch: true,
      revision,
      sessionId: "session_1"
    }
  };
}
