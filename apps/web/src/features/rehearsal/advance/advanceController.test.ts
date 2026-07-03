import { describe, expect, it } from "vitest";

import {
  defaultAutoAdvanceConfig,
  defaultAutoAdvancePolicy
} from "./autoAdvanceConfig";
import {
  cancelAdvanceCountdown,
  createInitialAdvanceControllerState,
  evaluateAdvanceController,
  type AdvanceControllerSnapshot
} from "./advanceController";

describe("advanceController", () => {
  it("starts countdown immediately when ready enters after an existing pause", () => {
    const result = evaluateAdvanceController(
      createInitialAdvanceControllerState(),
      createSnapshot({
        effectiveCoverage: 0.7,
        finalSentenceSpoken: true,
        pause: { isPaused: true, silenceDurationMs: 900 }
      }),
      defaultAutoAdvanceConfig
    );

    expect(result.commands).toEqual([]);
    expect(result.state).toMatchObject({
      countdownStartedAtMs: 1000,
      status: "countdown"
    });
  });

  it("advances only after countdown completes without resumed speech", () => {
    const first = evaluateAdvanceController(
      createInitialAdvanceControllerState(),
      createSnapshot({
        effectiveCoverage: 0.8,
        finalSentenceSpoken: true,
        nowMs: 1000,
        pause: { isPaused: true, silenceDurationMs: 900 }
      }),
      defaultAutoAdvanceConfig
    );
    const beforeComplete = evaluateAdvanceController(
      first.state,
      createSnapshot({
        effectiveCoverage: 0.8,
        finalSentenceSpoken: true,
        nowMs: 2999,
        pause: { isPaused: true, silenceDurationMs: 2899 }
      }),
      defaultAutoAdvanceConfig
    );
    const complete = evaluateAdvanceController(
      beforeComplete.state,
      createSnapshot({
        effectiveCoverage: 0.8,
        finalSentenceSpoken: true,
        nowMs: 3000,
        pause: { isPaused: true, silenceDurationMs: 2900 }
      }),
      defaultAutoAdvanceConfig
    );

    expect(beforeComplete.commands).toEqual([]);
    expect(complete.commands).toEqual([
      { type: "advance-slide", slideId: "slide-1" }
    ]);
  });

  it("cancels countdown when speech resumes", () => {
    const countdown = evaluateAdvanceController(
      createInitialAdvanceControllerState(),
      createSnapshot({
        effectiveCoverage: 0.8,
        finalSentenceSpoken: true,
        pause: { isPaused: true, silenceDurationMs: 900 }
      }),
      defaultAutoAdvanceConfig
    );
    const resumed = evaluateAdvanceController(
      countdown.state,
      createSnapshot({
        effectiveCoverage: 0.8,
        finalSentenceSpoken: true,
        nowMs: 1200,
        pause: { isPaused: false, silenceDurationMs: 0 }
      }),
      defaultAutoAdvanceConfig
    );

    expect(resumed.commands).toEqual([
      { type: "cancel-countdown", reason: "speech-resumed" }
    ]);
    expect(resumed.state.status).toBe("ready");
  });

  it("cancels countdown and returns tracking for manual next step", () => {
    const countdown = evaluateAdvanceController(
      createInitialAdvanceControllerState(),
      createSnapshot({
        effectiveCoverage: 0.8,
        finalSentenceSpoken: true,
        pause: { isPaused: true, silenceDurationMs: 900 }
      }),
      defaultAutoAdvanceConfig
    );

    expect(cancelAdvanceCountdown(countdown.state, "manual")).toEqual({
      commands: [{ type: "cancel-countdown", reason: "manual" }],
      state: {
        countdownStartedAtMs: null,
        manualGuidanceShown: false,
        slideId: "slide-1",
        status: "tracking"
      }
    });
  });

  it("blocks auto advance while trigger steps remain", () => {
    const result = evaluateAdvanceController(
      createInitialAdvanceControllerState(),
      createSnapshot({
        effectiveCoverage: 0.95,
        finalSentenceSpoken: true,
        remainingTriggerSteps: 2
      }),
      defaultAutoAdvanceConfig
    );

    expect(result.commands).toContainEqual({
      type: "show-builds-remaining",
      remainingTriggerSteps: 2
    });
    expect(result.state.status).toBe("blocked-by-builds");
  });

  it("suggests finish on the last slide without countdown", () => {
    const result = evaluateAdvanceController(
      createInitialAdvanceControllerState(),
      createSnapshot({
        effectiveCoverage: 0.95,
        finalSentenceSpoken: true,
        isLastSlide: true,
        pause: { isPaused: true, silenceDurationMs: 2000 }
      }),
      defaultAutoAdvanceConfig
    );

    expect(result.commands).toEqual([
      { type: "suggest-finish", slideId: "slide-1" }
    ]);
    expect(result.state).toMatchObject({
      countdownStartedAtMs: null,
      status: "finish-suggested"
    });
  });

  it("shows manual guidance after the final sentence remains ineligible", () => {
    const result = evaluateAdvanceController(
      createInitialAdvanceControllerState(),
      createSnapshot({
        effectiveCoverage: 0.4,
        finalSentenceSpoken: true,
        finalSentenceSpokenAtMs: 1000,
        nowMs: 6000
      }),
      defaultAutoAdvanceConfig
    );

    expect(result.commands).toEqual([{ type: "show-manual-guidance" }]);
    expect(result.state.manualGuidanceShown).toBe(true);
  });

  it("respects mode-specific disabled policy", () => {
    const result = evaluateAdvanceController(
      createInitialAdvanceControllerState(),
      createSnapshot({
        effectiveCoverage: 1,
        finalSentenceSpoken: true,
        policy: {
          ...defaultAutoAdvancePolicy,
          rehearsal: false
        }
      }),
      defaultAutoAdvanceConfig
    );

    expect(result.commands).toEqual([]);
    expect(result.state.status).toBe("disabled");
  });
});

function createSnapshot(
  overrides: Partial<AdvanceControllerSnapshot> = {}
): AdvanceControllerSnapshot {
  return {
    effectiveCoverage: 0,
    finalSentenceSpoken: false,
    finalSentenceSpokenAtMs: null,
    isLastSlide: false,
    mode: "rehearsal",
    nowMs: 1000,
    pause: {
      isPaused: false,
      silenceDurationMs: 0
    },
    policy: defaultAutoAdvancePolicy,
    remainingTriggerSteps: 0,
    slideId: "slide-1",
    ...overrides
  };
}
