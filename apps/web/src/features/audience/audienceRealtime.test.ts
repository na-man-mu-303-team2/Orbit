import { describe, expect, it, vi } from "vitest";

import {
  connectAudienceRealtime,
  type AudienceRealtimeSocket,
} from "./audienceRealtime";

const now = "2026-07-05T00:00:00.000Z";

function createFakeSocket(): AudienceRealtimeSocket & {
  trigger: (event: string, payload?: unknown) => void;
} {
  const handlers = new Map<string, Array<(payload: never) => void>>();

  return {
    connected: false,
    disconnect: vi.fn(),
    emit: vi.fn(),
    off: vi.fn((event: string, handler: (payload: never) => void) => {
      handlers.set(
        event,
        (handlers.get(event) ?? []).filter((current) => current !== handler),
      );
      return undefined as never;
    }),
    on: vi.fn((event: string, handler: (payload: never) => void) => {
      handlers.set(event, [...(handlers.get(event) ?? []), handler]);
      return undefined as never;
    }),
    trigger: (event: string, payload?: unknown) => {
      for (const handler of handlers.get(event) ?? []) {
        handler(payload as never);
      }
    },
  };
}

describe("audience realtime client", () => {
  it("joins the audience room when the socket connects", () => {
    const socket = createFakeSocket();
    const onStatus = vi.fn();

    connectAudienceRealtime({
      onError: vi.fn(),
      onFeatureSettings: vi.fn(),
      onSlideState: vi.fn(),
      onState: vi.fn(),
      onStatus,
      sessionId: "session_1",
      socketFactory: () => socket,
    });
    socket.trigger("connect");

    expect(onStatus).toHaveBeenCalledWith("connecting");
    expect(onStatus).toHaveBeenCalledWith("connected");
    expect(socket.emit).toHaveBeenCalledWith("audience:join", {
      sessionId: "session_1",
    });
  });

  it("parses recovery and slide-state events", () => {
    const socket = createFakeSocket();
    const onState = vi.fn();
    const onSlideState = vi.fn();
    const onFeatureSettings = vi.fn();

    connectAudienceRealtime({
      onError: vi.fn(),
      onFeatureSettings,
      onSlideState,
      onState,
      onStatus: vi.fn(),
      sessionId: "session_1",
      socketFactory: () => socket,
    });

    socket.trigger("audience:state", {
      type: "audience:state",
      roomId: "presentation:session_1:audience",
      sessionId: "session_1",
      userId: "audience_00000000-0000-4000-8000-000000000001",
      sentAt: now,
      payload: {
        session: {
          sessionId: "session_1",
          projectId: "project_1",
          joinCode: "123456",
          status: "live",
          entryStatus: "open",
        },
        participant: {
          audienceId: "audience_00000000-0000-4000-8000-000000000001",
          sessionId: "session_1",
          nickname: "orbit",
          joinedAt: now,
          lastSeenAt: now,
          joinedBeforeEnd: true,
        },
        state: {
          sessionId: "session_1",
          slideId: "slide_1",
          slideIndex: 0,
          effectState: { stepIndex: 1 },
          activeInteractionId: null,
          updatedAt: now,
        },
        features: {
          sessionId: "session_1",
          qnaEnabled: false,
          aiQnaEnabled: false,
          pollsEnabled: false,
          quizzesEnabled: false,
          reactionsEnabled: false,
          surveyEnabled: false,
          updatedAt: now,
        },
      },
    });
    socket.trigger("audience:slide-state", {
      type: "audience:slide-state",
      roomId: "presentation:session_1:audience",
      sessionId: "session_1",
      userId: "user_1",
      sentAt: now,
      payload: {
        state: {
          sessionId: "session_1",
          slideId: "slide_2",
          slideIndex: 1,
          effectState: { stepIndex: 2 },
          activeInteractionId: null,
          updatedAt: now,
        },
      },
    });
    socket.trigger("audience:feature-settings", {
      type: "audience:feature-settings",
      roomId: "presentation:session_1:audience",
      sessionId: "session_1",
      userId: "user_1",
      sentAt: now,
      payload: {
        features: {
          sessionId: "session_1",
          qnaEnabled: true,
          aiQnaEnabled: false,
          pollsEnabled: true,
          quizzesEnabled: false,
          reactionsEnabled: false,
          surveyEnabled: false,
          updatedAt: now,
        },
      },
    });

    expect(onState).toHaveBeenCalledWith(
      expect.objectContaining({
        state: expect.objectContaining({ slideId: "slide_1" }),
      }),
    );
    expect(onSlideState).toHaveBeenCalledWith(
      expect.objectContaining({ slideId: "slide_2" }),
    );
    expect(onFeatureSettings).toHaveBeenCalledWith(
      expect.objectContaining({ qnaEnabled: true, pollsEnabled: true }),
    );
  });

  it("parses audience reaction events", () => {
    const socket = createFakeSocket();
    const onReaction = vi.fn();

    connectAudienceRealtime({
      onError: vi.fn(),
      onFeatureSettings: vi.fn(),
      onReaction,
      onSlideState: vi.fn(),
      onState: vi.fn(),
      onStatus: vi.fn(),
      sessionId: "session_1",
      socketFactory: () => socket,
    });

    socket.trigger("audience:reaction", {
      type: "audience:reaction",
      roomId: "presentation:session_1:audience",
      sessionId: "session_1",
      userId: "audience_00000000-0000-4000-8000-000000000001",
      sentAt: now,
      payload: {
        sessionId: "session_1",
        audienceId: "audience_00000000-0000-4000-8000-000000000001",
        reaction: "clap",
      },
    });

    expect(onReaction).toHaveBeenCalledWith({
      sessionId: "session_1",
      audienceId: "audience_00000000-0000-4000-8000-000000000001",
      reaction: "clap",
    });
  });

  it("reports reconnecting status on disconnect and removes handlers on cleanup", () => {
    const socket = createFakeSocket();
    const onStatus = vi.fn();
    const connection = connectAudienceRealtime({
      onError: vi.fn(),
      onFeatureSettings: vi.fn(),
      onSlideState: vi.fn(),
      onState: vi.fn(),
      onStatus,
      sessionId: "session_1",
      socketFactory: () => socket,
    });

    socket.trigger("disconnect");
    connection.disconnect();

    expect(onStatus).toHaveBeenCalledWith("reconnecting");
    expect(socket.off).toHaveBeenCalledWith(
      "audience:state",
      expect.any(Function),
    );
    expect(socket.off).toHaveBeenCalledWith(
      "audience:feature-settings",
      expect.any(Function),
    );
    expect(socket.disconnect).toHaveBeenCalled();
  });
});
