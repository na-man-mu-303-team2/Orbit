import { describe, expect, it, vi } from "vitest";
import { p0AnimationDeck } from "./__fixtures__/animationDeck";
import { createPresenterSlideshowState } from "./presenterStateStore";
import {
  createSlideWindowHeartbeatMessage,
  createSlideWindowReadyMessage
} from "./presentationChannel";
import {
  createPresentationPublisherController,
  isPresentationPeerStale,
  type PresentationChannelStatus
} from "./usePresentationChannelPublisher";

const identity = {
  deckId: p0AnimationDeck.deckId,
  sessionId: "session-presenter-1"
};

describe("createPresentationPublisherController", () => {
  it("publishes a full sanitized snapshot when the slide window becomes ready", () => {
    const posted: unknown[] = [];
    const statuses: PresentationChannelStatus[] = [];
    const channel = {
      close: vi.fn(),
      postMessage: (message: unknown) => posted.push(message)
    };
    const controller = createPresentationPublisherController({
      channel,
      getSnapshot: () => ({
        deck: {
          ...p0AnimationDeck,
          slides: p0AnimationDeck.slides.map((slide) => ({
            ...slide,
            keywords: [],
            speakerNotes: ""
          }))
        },
        deckId: identity.deckId,
        sentAt: 10,
        sessionId: identity.sessionId,
        state: createPresenterSlideshowState(p0AnimationDeck),
        triggerAnimationIds: ["anim_image_zoom_in"],
        type: "presenter-snapshot"
      }),
      getState: () => null,
      identity,
      onStatusChange: (status) => statuses.push(status)
    });

    controller.handleIncoming(createSlideWindowReadyMessage(identity, 20));

    expect(posted).toHaveLength(1);
    expect(posted[0]).toMatchObject({
      deckId: "deck_p0_animation",
      sessionId: "session-presenter-1",
      type: "presenter-snapshot",
      triggerAnimationIds: ["anim_image_zoom_in"]
    });
    expect(JSON.stringify(posted[0])).not.toContain("첫 문장입니다");
    expect(statuses).toEqual(["connected"]);
  });

  it("publishes state updates without needing another ready event", () => {
    const posted: unknown[] = [];
    const state = {
      ...createPresenterSlideshowState(p0AnimationDeck),
      slideId: "slide_p0_2",
      slideIndex: 1,
      stepIndex: 0
    };
    const controller = createPresentationPublisherController({
      channel: {
        close: vi.fn(),
        postMessage: (message: unknown) => posted.push(message)
      },
      getSnapshot: () => null,
      getState: () => ({
        deckId: identity.deckId,
        sentAt: 30,
        sessionId: identity.sessionId,
        state,
        triggerAnimationIds: [],
        type: "presenter-state"
      }),
      identity
    });

    controller.publishState();

    expect(posted).toEqual([
      {
        deckId: "deck_p0_animation",
        sentAt: 30,
        sessionId: "session-presenter-1",
        state,
        triggerAnimationIds: [],
        type: "presenter-state"
      }
    ]);
  });

  it("ignores messages from a different session", () => {
    const posted: unknown[] = [];
    const statuses: PresentationChannelStatus[] = [];
    const controller = createPresentationPublisherController({
      channel: {
        close: vi.fn(),
        postMessage: (message: unknown) => posted.push(message)
      },
      getSnapshot: () => {
        throw new Error("wrong session should not request a snapshot");
      },
      getState: () => null,
      identity,
      onStatusChange: (status) => statuses.push(status)
    });

    controller.handleIncoming(
      createSlideWindowReadyMessage({ ...identity, sessionId: "session-other" }, 40)
    );

    expect(posted).toEqual([]);
    expect(statuses).toEqual([]);
  });

  it("marks the publisher connected on slide-window heartbeat", () => {
    const statuses: PresentationChannelStatus[] = [];
    const controller = createPresentationPublisherController({
      channel: {
        close: vi.fn(),
        postMessage: vi.fn()
      },
      getSnapshot: () => null,
      getState: () => null,
      identity,
      onStatusChange: (status) => statuses.push(status)
    });

    controller.handleIncoming(createSlideWindowHeartbeatMessage(identity, 50));

    expect(statuses).toEqual(["connected"]);
  });

  it("marks peer state stale only after the 5 second heartbeat window", () => {
    expect(isPresentationPeerStale(null, 6000)).toBe(false);
    expect(isPresentationPeerStale(1000, 6000)).toBe(false);
    expect(isPresentationPeerStale(1000, 6001)).toBe(true);
  });
});
