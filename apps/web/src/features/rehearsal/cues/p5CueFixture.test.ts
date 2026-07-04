import { describe, expect, it } from "vitest";

import {
  defaultAutoAdvanceConfig,
  defaultAutoAdvancePolicy
} from "../advance/autoAdvanceConfig";
import {
  createInitialAdvanceControllerState,
  evaluateAdvanceController
} from "../advance/advanceController";
import { createSlideshowAnimationPlan } from "../presenter/slideshowStepModel";
import { getNextPresenterStepState } from "../presenter/presenterStepNavigation";
import { createCueEngine } from "./cueEngine";
import { createCueMatcher } from "./cueMatcher";
import {
  createPresenterCueProvider,
  getCuePhrasesForSlide,
  getCueReferencedAnimationIds,
  hasEnabledAdvanceCue
} from "./cueProvider";
import { defaultInternalCueProvider } from "./internalCueConfig";
import { p5CueFixtureDeck } from "./__fixtures__/p5CueFixture";

describe("P5 speech cue fixture", () => {
  it("drives highlight, animation step, and advance gate from one final result", () => {
    const slide = p5CueFixtureDeck.slides[0]!;
    const provider = createPresenterCueProvider({
      deck: p5CueFixtureDeck,
      internalProvider: defaultInternalCueProvider
    });
    const triggerAnimationIds = getCueReferencedAnimationIds(
      provider,
      slide.slideId
    );
    const plan = createSlideshowAnimationPlan({
      slide,
      triggerAnimationIds
    });
    const matcher = createCueMatcher();
    const engine = createCueEngine();
    const cues = provider.getCues(slide.slideId);
    const matches = matcher.acceptResult(
      {
        text: "본문 강조 이미지 확대 다음 장으로",
        isFinal: true,
        timestampMs: [0, 1200]
      },
      cues
    );
    const commands = engine.executeMatches(matches);

    expect(cues.map((cue) => cue.cueId)).toEqual([
      "cue_p5_highlight_body",
      "cue_p5_animate_image",
      "cue_p5_advance_gate"
    ]);
    expect(cues[0]?.trigger.scriptAnchor).toEqual({ start: 0, end: 5 });
    expect(getCuePhrasesForSlide(provider, slide.slideId)).toEqual([
      "본문 강조",
      "이미지 확대",
      "다음 장으로"
    ]);
    expect(triggerAnimationIds).toEqual(["anim_image_zoom_in"]);
    expect(hasEnabledAdvanceCue(provider, slide.slideId)).toBe(true);
    expect(plan.maxStepIndex).toBe(1);
    expect(matches.map((match) => match.cueId)).toEqual([
      "cue_p5_highlight_body",
      "cue_p5_animate_image",
      "cue_p5_advance_gate"
    ]);
    expect(matches[0]).not.toHaveProperty("scriptAnchor");
    expect(matches[0]).not.toHaveProperty("transcript");
    expect(commands).toEqual([
      {
        type: "set-highlight",
        active: true,
        cueId: "cue_p5_highlight_body",
        elementId: "el_body",
        slideId: slide.slideId
      },
      {
        type: "next-step",
        animationId: "anim_image_zoom_in",
        cueId: "cue_p5_animate_image",
        slideId: slide.slideId
      },
      {
        type: "mark-advance-cue-matched",
        cueId: "cue_p5_advance_gate",
        slideId: slide.slideId
      }
    ]);
    expect(
      getNextPresenterStepState({
        currentSlideIndex: 0,
        currentStepIndex: 0,
        maxStepIndex: plan.maxStepIndex,
        slideCount: p5CueFixtureDeck.slides.length
      })
    ).toEqual({ slideIndex: 0, stepIndex: 1 });
    expect(engine.executeMatches(matches)).toEqual([]);

    engine.resetForSlideVisit();
    expect(engine.executeMatches(matches)).toHaveLength(3);
  });

  it("keeps auto advance blocked until the advance cue gate is matched", () => {
    const slide = p5CueFixtureDeck.slides[0]!;
    const blocked = evaluateAdvanceController(
      createInitialAdvanceControllerState(),
      {
        advanceCueGate: {
          matched: false,
          required: true
        },
        effectiveCoverage: 0.95,
        finalSentenceSpoken: true,
        finalSentenceSpokenAtMs: 100,
        isLastSlide: false,
        mode: "rehearsal",
        nowMs: 1000,
        pause: {
          isPaused: true,
          silenceDurationMs: 1000
        },
        policy: defaultAutoAdvancePolicy,
        remainingTriggerSteps: 0,
        slideId: slide.slideId
      },
      defaultAutoAdvanceConfig
    );
    const countdown = evaluateAdvanceController(
      blocked.state,
      {
        advanceCueGate: {
          matched: true,
          required: true
        },
        effectiveCoverage: 0.95,
        finalSentenceSpoken: true,
        finalSentenceSpokenAtMs: 100,
        isLastSlide: false,
        mode: "rehearsal",
        nowMs: 1100,
        pause: {
          isPaused: true,
          silenceDurationMs: 1100
        },
        policy: defaultAutoAdvancePolicy,
        remainingTriggerSteps: 0,
        slideId: slide.slideId
      },
      defaultAutoAdvanceConfig
    );

    expect(blocked.state.status).toBe("tracking");
    expect(blocked.commands).toEqual([]);
    expect(countdown.state.status).toBe("countdown");
  });
});
