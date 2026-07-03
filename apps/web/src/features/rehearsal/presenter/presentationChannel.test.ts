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
import type { SlideshowRuntimeSnapshot } from "./slideshowRuntime";

const identity = {
  deckId: p0AnimationDeck.deckId,
  sessionId: "session-presenter-1"
};

const runtime: SlideshowRuntimeSnapshot = {
  executedAnimationIds: [],
  isComplete: false,
  stepIndex: 1,
  triggerAnimationIds: ["anim_image_zoom_in"]
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

  it("keeps only render-required slide data in the slide-window deck snapshot", () => {
    const deckWithPrivateNotes = {
      ...p0AnimationDeck,
      slides: p0AnimationDeck.slides.map((slide, index) =>
        index === 0
          ? {
              ...slide,
              aiNotes: {
                emphasisPoints: ["발표자 전용 강조점"],
                sourceEvidence: [
                  {
                    confidence: 0.9,
                    fileId: "file_private_source",
                    note: "내부 메모",
                    quote: "내부 근거 원문"
                  }
                ]
              },
              presenterOnlyMarker: "슬라이드 창으로 보내면 안 되는 필드"
            }
          : slide
      )
    };
    const snapshot = createSlideWindowDeckSnapshot(deckWithPrivateNotes);
    const serialized = JSON.stringify(snapshot);

    expect(snapshot.deckId).toBe(p0AnimationDeck.deckId);
    expect(snapshot.slides[0]?.elements).toEqual(p0AnimationDeck.slides[0]?.elements);
    expect(snapshot.slides[0]?.animations).toEqual(p0AnimationDeck.slides[0]?.animations);
    expect(snapshot.slides[0]?.speakerNotes).toBe("");
    expect(snapshot.slides[0]?.keywords).toEqual([]);
    expect(serialized).not.toContain("첫 문장입니다");
    expect(serialized).not.toContain("두 번째 슬라이드입니다");
    expect(serialized).not.toContain("발표자 전용 강조점");
    expect(serialized).not.toContain("내부 근거 원문");
    expect(serialized).not.toContain("내부 메모");
    expect(serialized).not.toContain("presenterOnlyMarker");
  });

  it("creates presenter snapshot messages without presenter-only content", () => {
    const message = createPresenterSnapshotMessage({
      deck: p0AnimationDeck,
      identity,
      runtime,
      sentAt: 10,
      state: {
        ...createPresenterSlideshowState(p0AnimationDeck),
        highlights: [{ elementId: "el_body", active: true }]
      }
    });
    const serialized = JSON.stringify(message);

    expect(message).toMatchObject({
      deckId: "deck_p0_animation",
      sessionId: "session-presenter-1",
      sentAt: 10,
      type: "presenter-snapshot",
      runtime,
      state: {
        slideId: "slide_p0_1",
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
      runtime: {
        executedAnimationIds: [],
        isComplete: true,
        stepIndex: 0,
        triggerAnimationIds: []
      },
      sentAt: 20,
      state: createPresenterSlideshowState(p0AnimationDeck)
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
