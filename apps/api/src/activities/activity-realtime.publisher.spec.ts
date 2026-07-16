import type { Server } from "socket.io";
import { describe, expect, it, vi } from "vitest";

import { ActivityRealtimePublisher } from "./activity-realtime.publisher";

describe("ActivityRealtimePublisher", () => {
  it("publishes revision-only refetch events to isolated presenter and audience rooms", () => {
    const emit = vi.fn();
    const to = vi.fn().mockReturnValue({ emit });
    const publisher = new ActivityRealtimePublisher();
    publisher.attach({ to } as unknown as Server);

    publisher.publishResultsUpdated({
      sessionId: "session_1",
      runId: "activity_run_1",
      revision: 7
    });

    expect(to).toHaveBeenCalledWith("presentation:session_1:presenter");
    expect(to).toHaveBeenCalledWith("presentation:session_1:audience");
    expect(emit).toHaveBeenCalledTimes(2);
    const serialized = JSON.stringify(emit.mock.calls);
    expect(serialized).toContain('"revision":7');
    expect(serialized).toContain('"refetch":true');
    expect(serialized).not.toContain("audienceId");
    expect(serialized).not.toContain("displayName");
    expect(serialized).not.toContain("answers");
  });
});
