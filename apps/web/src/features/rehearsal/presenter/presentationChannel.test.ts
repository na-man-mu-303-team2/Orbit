import { describe, expect, it } from "vitest";
import { p0AnimationDeck } from "./__fixtures__/animationDeck";
import { createPresenterSlideshowState } from "./presenterStateStore";
import {
  createPresenterCommandMessage,
  createPresenterHeartbeatMessage,
  createPresenterRemoteHeartbeatMessage,
  createPresenterRemoteReadyMessage,
  createPresenterSnapshotMessage,
  createPresenterStateMessage,
  createSlideWindowDeckSnapshot,
  createSlideWindowHeartbeatMessage,
  createSlideWindowReadyMessage,
  getPresentationChannelName,
  isPresentationChannelMessage,
  matchesPresentationChannelIdentity,
} from "./presentationChannel";

const identity = {
  deckId: p0AnimationDeck.deckId,
  sessionId: "session-presenter-1",
};

describe("presentationChannel", () => {
  it("creates deterministic session-scoped channel names", () => {
    expect(getPresentationChannelName(identity)).toBe(
      "orbit:presenter-screen:deck_p0_animation:session-presenter-1",
    );
    expect(
      getPresentationChannelName({
        ...identity,
        sessionId: "session-presenter-2",
      }),
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
                    quote: "내부 근거 원문",
                  },
                ],
              },
              actions: [
                ...slide.actions,
                {
                  actionId: "act_private_occurrence",
                  trigger: {
                    kind: "keyword-occurrence" as const,
                    keywordId: "kw_private_ai",
                    occurrenceId: "kwo_slide_p0_1_kw_private_ai_32_34",
                  },
                  effect: {
                    kind: "play-animation" as const,
                    animationId: "anim_image_zoom_in",
                  },
                },
              ],
              presenterOnlyMarker: "슬라이드 창으로 보내면 안 되는 필드",
            }
          : slide,
      ),
    };
    const snapshot = createSlideWindowDeckSnapshot(deckWithPrivateNotes);
    const serialized = JSON.stringify(snapshot);

    expect(snapshot.deckId).toBe(p0AnimationDeck.deckId);
    expect(snapshot.slides[0]?.elements).toEqual(
      p0AnimationDeck.slides[0]?.elements,
    );
    expect(snapshot.slides[0]?.animations).toEqual(
      p0AnimationDeck.slides[0]?.animations,
    );
    expect(snapshot.slides[0]?.speakerNotes).toBe("");
    expect(snapshot.slides[0]?.keywords).toEqual([]);
    expect(snapshot.slides[0]?.actions).toEqual([]);
    expect(serialized).not.toContain("첫 문장입니다");
    expect(serialized).not.toContain("두 번째 슬라이드입니다");
    expect(serialized).not.toContain("kwo_slide_p0_1_kw_private_ai_32_34");
    expect(serialized).not.toContain("act_private_occurrence");
    expect(serialized).not.toContain("발표자 전용 강조점");
    expect(serialized).not.toContain("내부 근거 원문");
    expect(serialized).not.toContain("내부 메모");
    expect(serialized).not.toContain("presenterOnlyMarker");
  });

  it("creates presenter snapshot messages without presenter-only content", () => {
    const message = createPresenterSnapshotMessage({
      deck: p0AnimationDeck,
      identity,
      sentAt: 10,
      state: {
        ...createPresenterSlideshowState(p0AnimationDeck),
        highlights: [{ elementId: "el_body", active: true }],
        stepIndex: 1,
      },
      triggerAnimationIds: ["anim_image_zoom_in"],
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
        highlights: [{ elementId: "el_body", active: true }],
      },
    });
    expect(serialized).not.toContain('speakerNotes":"첫');
    expect(serialized).not.toContain("transcript");
    expect(serialized).not.toContain("rawAudio");
    expect(serialized).not.toContain("runId");
    expect(serialized).not.toContain("autoAdvance");
    expect(serialized).not.toContain("countdownStartedAtMs");
    expect(serialized).not.toContain("manualGuidance");
    expect(serialized).not.toContain("remainingTriggerSteps");
    expect(serialized).not.toContain("finish-suggested");
  });

  it("creates presenter state messages without P4 presenter-only status", () => {
    const message = createPresenterStateMessage({
      identity,
      sentAt: 20,
      state: createPresenterSlideshowState(p0AnimationDeck),
      triggerAnimationIds: ["anim_image_zoom_in"],
    });
    const serialized = JSON.stringify(message);

    expect(message).toMatchObject({
      state: {
        slideId: "slide_p0_1",
        stepIndex: 0,
      },
      triggerAnimationIds: ["anim_image_zoom_in"],
      type: "presenter-state",
    });
    expect(serialized).not.toContain("autoAdvance");
    expect(serialized).not.toContain("countdownStartedAtMs");
    expect(serialized).not.toContain("manualGuidance");
    expect(serialized).not.toContain("remainingTriggerSteps");
    expect(serialized).not.toContain("finish-suggested");
  });

  it("creates and validates presenter messages with presenter-only speech state", () => {
    const state = {
      ...createPresenterSlideshowState(p0AnimationDeck),
      speech: createPresenterSpeechState(),
    };
    const snapshotMessage = createPresenterSnapshotMessage({
      deck: p0AnimationDeck,
      identity,
      sentAt: 21,
      state,
      triggerAnimationIds: [],
    });
    const stateMessage = createPresenterStateMessage({
      identity,
      sentAt: 22,
      state,
      triggerAnimationIds: [],
    });

    expect(isPresentationChannelMessage(snapshotMessage)).toBe(true);
    expect(isPresentationChannelMessage(stateMessage)).toBe(true);
    expect(snapshotMessage.state.speech).toMatchObject({
      coveredSentenceIds: ["sentence_1"],
      semanticMatchingEnabled: true,
      semanticDebug: {
        transcript: "비공개 final transcript",
        topMatches: [
          expect.objectContaining({
            sentenceId: "sentence_1",
            text: "비공개 speaker note sentence",
          }),
        ],
      },
    });
    expect(JSON.stringify(snapshotMessage.deck)).not.toContain(
      "비공개 final transcript",
    );
    expect(JSON.stringify(snapshotMessage.deck)).not.toContain(
      "비공개 speaker note sentence",
    );
  });

  it("validates channel messages and ignores wrong identities", () => {
    const matching = createPresenterStateMessage({
      identity,
      sentAt: 20,
      state: createPresenterSlideshowState(p0AnimationDeck),
      triggerAnimationIds: [],
    });
    const wrongSession = {
      ...matching,
      sessionId: "session-other",
    };

    expect(isPresentationChannelMessage(matching)).toBe(true);
    expect(isPresentationChannelMessage(wrongSession)).toBe(true);
    expect(matchesPresentationChannelIdentity(matching, identity)).toBe(true);
    expect(matchesPresentationChannelIdentity(wrongSession, identity)).toBe(
      false,
    );
    expect(
      isPresentationChannelMessage({
        ...matching,
        state: { slideId: "slide_p0_1" },
      }),
    ).toBe(false);
  });

  it("creates ready and heartbeat messages for both windows", () => {
    expect(createPresenterHeartbeatMessage(identity, 30)).toEqual({
      deckId: "deck_p0_animation",
      sentAt: 30,
      sessionId: "session-presenter-1",
      type: "presenter-heartbeat",
    });
    expect(createSlideWindowReadyMessage(identity, 40)).toEqual({
      deckId: "deck_p0_animation",
      sentAt: 40,
      sessionId: "session-presenter-1",
      type: "slide-window-ready",
    });
    expect(createSlideWindowHeartbeatMessage(identity, 50)).toEqual({
      deckId: "deck_p0_animation",
      sentAt: 50,
      sessionId: "session-presenter-1",
      type: "slide-window-heartbeat",
    });
    expect(createPresenterRemoteReadyMessage(identity, 60)).toEqual({
      deckId: "deck_p0_animation",
      sentAt: 60,
      sessionId: "session-presenter-1",
      type: "presenter-remote-ready",
    });
    expect(createPresenterRemoteHeartbeatMessage(identity, 70)).toEqual({
      deckId: "deck_p0_animation",
      sentAt: 70,
      sessionId: "session-presenter-1",
      type: "presenter-remote-heartbeat",
    });
  });

  it("creates and validates presenter remote command messages", () => {
    const message = createPresenterCommandMessage({
      command: { action: "goto", slideIndex: 2, stepIndex: 1 },
      identity,
      sentAt: 80,
    });

    expect(message).toEqual({
      command: { action: "goto", slideIndex: 2, stepIndex: 1 },
      deckId: "deck_p0_animation",
      sentAt: 80,
      sessionId: "session-presenter-1",
      type: "presenter-command",
    });
    expect(isPresentationChannelMessage(message)).toBe(true);
    expect(
      isPresentationChannelMessage({
        ...message,
        command: { action: "goto", slideIndex: "2" },
      }),
    ).toBe(false);
    for (const command of [
      { action: "goto", slideIndex: Number.NaN },
      { action: "goto", slideIndex: Number.POSITIVE_INFINITY },
      { action: "goto", slideIndex: -1 },
      { action: "goto", slideIndex: 1.2 },
      { action: "goto", slideIndex: 1, stepIndex: Number.NaN },
      { action: "goto", slideIndex: 1, stepIndex: Number.POSITIVE_INFINITY },
      { action: "goto", slideIndex: 1, stepIndex: -1 },
      { action: "goto", slideIndex: 1, stepIndex: 0.5 },
    ]) {
      expect(
        isPresentationChannelMessage({
          ...message,
          command,
        }),
      ).toBe(false);
    }
  });

  it("validates presenter remote timer command messages", () => {
    const message = createPresenterCommandMessage({
      command: { action: "timer-start" },
      identity,
      sentAt: 90,
    });

    expect(isPresentationChannelMessage(message)).toBe(true);
    expect(
      isPresentationChannelMessage({
        ...message,
        command: { action: "timer-finish" },
      }),
    ).toBe(false);
  });
});

function createPresenterSpeechState() {
  return {
    coveredSentenceIds: ["sentence_1"],
    matchableSentenceCount: 2,
    semanticDebug: {
      status: "ready" as const,
      slideId: "slide_p0_1",
      transcript: "비공개 final transcript",
      isFinal: true,
      topMatches: [
        {
          rank: 1,
          sentenceId: "sentence_1",
          sentenceIndex: 0,
          text: "비공개 speaker note sentence",
          similarity: 0.91,
          covered: true,
        },
      ],
      error: null,
    },
    semanticMatchingEnabled: true,
    snapshot: {
      slideId: "slide_p0_1",
      coveredSentenceIds: ["sentence_1"],
      matchableSentenceCount: 2,
      sentenceCoverage: 0.5,
      wordCoverage: 0.1,
      effectiveCoverage: 0.5,
      finalSentenceSpoken: false,
      hitKeywordIds: [],
      provisionalMissingKeywordIds: [],
    },
  };
}
