import { describe, expect, it, vi } from "vitest";

import {
  createAudiencePresenterRealtimePublisher,
  type AudiencePresenterRealtimeSocket,
} from "./audiencePresenterRealtime";

function createFakeSocket(): AudiencePresenterRealtimeSocket & {
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

describe("audience presenter realtime publisher", () => {
  it("joins the presenter room when connected", () => {
    const socket = createFakeSocket();
    const onStatus = vi.fn();

    createAudiencePresenterRealtimePublisher({
      onStatus,
      sessionId: "session_1",
      socketFactory: () => socket,
    });
    socket.trigger("connect");

    expect(onStatus).toHaveBeenCalledWith("connecting");
    expect(onStatus).toHaveBeenCalledWith("connected");
    expect(socket.emit).toHaveBeenCalledWith("audience:presenter-join", {
      sessionId: "session_1",
    });
  });

  it("publishes slide state without deck or speaker-note data", () => {
    const socket = createFakeSocket();
    const publisher = createAudiencePresenterRealtimePublisher({
      sessionId: "session_1",
      socketFactory: () => socket,
    });

    publisher.publishState({
      state: {
        highlights: [{ elementId: "shape_1", active: true }],
        slideId: "slide_2",
        slideIndex: 1,
        stepIndex: 3,
      },
      triggerAnimationIds: ["anim_1"],
    });

    expect(socket.emit).toHaveBeenCalledWith("audience:slide-state:update", {
      sessionId: "session_1",
      slideId: "slide_2",
      slideIndex: 1,
      effectState: {
        highlights: [{ elementId: "shape_1", active: true }],
        stepIndex: 3,
        triggerAnimationIds: ["anim_1"],
      },
    });
    expect(JSON.stringify((socket.emit as any).mock.calls)).not.toContain(
      "speakerNotes",
    );
  });

  it("publishes feature settings updates for live audience clients", () => {
    const socket = createFakeSocket();
    const publisher = createAudiencePresenterRealtimePublisher({
      sessionId: "session_1",
      socketFactory: () => socket,
    });

    publisher.publishFeatureSettings({ pollsEnabled: true });

    expect(socket.emit).toHaveBeenCalledWith(
      "audience:feature-settings:update",
      {
        sessionId: "session_1",
        settings: { pollsEnabled: true },
      },
    );
  });

  it("receives reaction events from the presenter room", () => {
    const socket = createFakeSocket();
    const onReaction = vi.fn();
    createAudiencePresenterRealtimePublisher({
      onReaction,
      sessionId: "session_1",
      socketFactory: () => socket,
    });

    socket.trigger("audience:reaction", {
      type: "audience:reaction",
      roomId: "presentation:session_1:presenter",
      sessionId: "session_1",
      userId: "audience_00000000-0000-4000-8000-000000000001",
      sentAt: "2026-07-05T00:00:00.000Z",
      payload: {
        sessionId: "session_1",
        audienceId: "audience_00000000-0000-4000-8000-000000000001",
        reaction: "heart",
      },
    });

    expect(onReaction).toHaveBeenCalledWith({
      sessionId: "session_1",
      audienceId: "audience_00000000-0000-4000-8000-000000000001",
      reaction: "heart",
    });
  });
});
