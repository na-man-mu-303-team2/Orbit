import { describe, expect, it } from "vitest";
import { p0AnimationDeck } from "./__fixtures__/animationDeck";
import { createPresenterSlideshowState } from "./presenterStateStore";
import {
  createPresenterHeartbeatMessage,
  createPresenterSnapshotMessage,
  createPresenterStateMessage,
  createSlideWindowDeckSnapshot,
  createSlideWindowHeartbeatMessage,
  createSlideWindowReadyMessage,
  getPresentationChannelName,
  isPresentationChannelMessage,
  matchesPresentationChannelIdentity
} from "./presentationChannel";

const identity = {
  deckId: p0AnimationDeck.deckId,
  sessionId: "session-presenter-1"
};

describe("presentationChannel", () => {
  it("creates deterministic session-scoped channel names", () => {
    expect(getPresentationChannelName(identity)).toBe(
      "orbit:presenter-screen:deck_p0_animation:session-presenter-1"
    );
    expect(
      getPresentationChannelName({
        ...identity,
        sessionId: "session-presenter-2"
      })
    ).not.toBe(getPresentationChannelName(identity));
  });

  it("removes speaker notes and keywords from the slide-window deck snapshot", () => {
    const snapshot = createSlideWindowDeckSnapshot(p0AnimationDeck);

    expect(snapshot.deckId).toBe(p0AnimationDeck.deckId);
    expect(snapshot.slides[0]?.elements).toEqual(p0AnimationDeck.slides[0]?.elements);
    expect(snapshot.slides[0]?.animations).toEqual(p0AnimationDeck.slides[0]?.animations);
    expect(snapshot.slides[0]?.speakerNotes).toBe("");
    expect(snapshot.slides[0]?.keywords).toEqual([]);
    expect(JSON.stringify(snapshot)).not.toContain("첫 문장입니다");
    expect(JSON.stringify(snapshot)).not.toContain("두 번째 슬라이드입니다");
  });

  it("creates presenter snapshot messages without presenter-only content", () => {
    const message = createPresenterSnapshotMessage({
      deck: p0AnimationDeck,
      identity,
      sentAt: 10,
      state: {
        ...createPresenterSlideshowState(p0AnimationDeck),
        highlights: [{ elementId: "el_body", active: true }],
        stepIndex: 1
      },
      triggerAnimationIds: ["anim_image_zoom_in"]
    });
    const serialized = JSON.stringify(message);

    expect(message).toMatchObject({
      deckId: "deck_p0_animation",
      sessionId: "session-presenter-1",
      sentAt: 10,
      type: "presenter-snapshot",
      triggerAnimationIds: ["anim_image_zoom_in"],
      state: {
        slideId: "slide_p0_1",
        stepIndex: 1,
        highlights: [{ elementId: "el_body", active: true }]
      }
    });
    expect(serialized).not.toContain("speakerNotes\":\"첫");
    expect(serialized).not.toContain("transcript");
    expect(serialized).not.toContain("rawAudio");
    expect(serialized).not.toContain("runId");
  });

  it("validates channel messages and ignores wrong identities", () => {
    const matching = createPresenterStateMessage({
      identity,
      sentAt: 20,
      state: createPresenterSlideshowState(p0AnimationDeck),
      triggerAnimationIds: []
    });
    const wrongSession = {
      ...matching,
      sessionId: "session-other"
    };

    expect(isPresentationChannelMessage(matching)).toBe(true);
    expect(isPresentationChannelMessage(wrongSession)).toBe(true);
    expect(matchesPresentationChannelIdentity(matching, identity)).toBe(true);
    expect(matchesPresentationChannelIdentity(wrongSession, identity)).toBe(false);
    expect(
      isPresentationChannelMessage({
        ...matching,
        state: { slideId: "slide_p0_1" }
      })
    ).toBe(false);
  });

  it("creates ready and heartbeat messages for both windows", () => {
    expect(createPresenterHeartbeatMessage(identity, 30)).toEqual({
      deckId: "deck_p0_animation",
      sentAt: 30,
      sessionId: "session-presenter-1",
      type: "presenter-heartbeat"
    });
    expect(createSlideWindowReadyMessage(identity, 40)).toEqual({
      deckId: "deck_p0_animation",
      sentAt: 40,
      sessionId: "session-presenter-1",
      type: "slide-window-ready"
    });
    expect(createSlideWindowHeartbeatMessage(identity, 50)).toEqual({
      deckId: "deck_p0_animation",
      sentAt: 50,
      sessionId: "session-presenter-1",
      type: "slide-window-heartbeat"
    });
  });
});
