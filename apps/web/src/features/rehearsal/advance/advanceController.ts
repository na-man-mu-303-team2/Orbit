import {
  type AutoAdvanceConfig,
  type AutoAdvancePolicy,
  isAutoAdvanceEnabledForMode
} from "./autoAdvanceConfig";

export type AdvanceControllerStatus =
  | "blocked-by-builds"
  | "countdown"
  | "disabled"
  | "finish-suggested"
  | "ready"
  | "tracking";

export type AdvanceControllerCommand =
  | { type: "advance-slide"; slideId: string }
  | { type: "cancel-countdown"; reason: "manual" | "speech-resumed" }
  | { type: "show-builds-remaining"; remainingTriggerSteps: number }
  | { type: "show-manual-guidance" }
  | { type: "suggest-finish"; slideId: string };

export type AdvanceControllerState = {
  countdownStartedAtMs: number | null;
  manualGuidanceShown: boolean;
  remainingTriggerSteps: number;
  slideId: string | null;
  status: AdvanceControllerStatus;
};

export type AdvanceControllerSnapshot = {
  advanceCueGate: {
    matched: boolean;
    required: boolean;
  };
  effectiveCoverage: number;
  finalSentenceSpoken: boolean;
  finalSentenceSpokenAtMs: number | null;
  isLastSlide: boolean;
  mode: "live" | "rehearsal";
  nowMs: number;
  pause: {
    isPaused: boolean;
    silenceDurationMs: number;
  };
  policy: AutoAdvancePolicy;
  remainingTriggerSteps: number;
  slideId: string;
};

export type AdvanceControllerResult = {
  commands: AdvanceControllerCommand[];
  state: AdvanceControllerState;
};

export function createInitialAdvanceControllerState(): AdvanceControllerState {
  return {
    countdownStartedAtMs: null,
    manualGuidanceShown: false,
    remainingTriggerSteps: 0,
    slideId: null,
    status: "tracking"
  };
}

export function resetAdvanceControllerForSlide(
  slideId: string
): AdvanceControllerState {
  return {
    countdownStartedAtMs: null,
    manualGuidanceShown: false,
    remainingTriggerSteps: 0,
    slideId,
    status: "tracking"
  };
}

export function cancelAdvanceCountdown(
  state: AdvanceControllerState,
  reason: "manual" | "speech-resumed"
): AdvanceControllerResult {
  if (state.status !== "countdown") {
    return {
      commands: [],
      state: {
        ...state,
        countdownStartedAtMs: null,
        manualGuidanceShown: reason === "manual" ? false : state.manualGuidanceShown,
        remainingTriggerSteps: 0,
        status: reason === "manual" ? "tracking" : state.status
      }
    };
  }

  return {
    commands: [{ type: "cancel-countdown", reason }],
    state: {
      ...state,
      countdownStartedAtMs: null,
      manualGuidanceShown: false,
      remainingTriggerSteps: 0,
      status: reason === "manual" ? "tracking" : "ready"
    }
  };
}

export function evaluateAdvanceController(
  state: AdvanceControllerState,
  snapshot: AdvanceControllerSnapshot,
  config: AutoAdvanceConfig
): AdvanceControllerResult {
  const nextBaseState =
    state.slideId === snapshot.slideId
      ? state
      : resetAdvanceControllerForSlide(snapshot.slideId);
  const commands: AdvanceControllerCommand[] = [];

  if (!isAutoAdvanceEnabledForMode(snapshot.policy, snapshot.mode)) {
    return {
      commands,
      state: {
        ...nextBaseState,
        countdownStartedAtMs: null,
        manualGuidanceShown: false,
        remainingTriggerSteps: 0,
        status: "disabled"
      }
    };
  }

  const meetsCoverage = snapshot.effectiveCoverage >= snapshot.policy.threshold;
  const hasFinalSentence = snapshot.finalSentenceSpoken;
  const meetsAdvanceCueGate =
    !snapshot.advanceCueGate.required || snapshot.advanceCueGate.matched;
  const baseReady = meetsCoverage && hasFinalSentence && meetsAdvanceCueGate;

  if (snapshot.remainingTriggerSteps > 0 && baseReady) {
    commands.push({
      type: "show-builds-remaining",
      remainingTriggerSteps: snapshot.remainingTriggerSteps
    });
    return {
      commands: addManualGuidanceIfNeeded(
        commands,
        nextBaseState,
        snapshot,
        config
      ),
      state: {
        ...nextBaseState,
        countdownStartedAtMs: null,
        manualGuidanceShown: shouldShowManualGuidance(snapshot, config),
        remainingTriggerSteps: snapshot.remainingTriggerSteps,
        status: "blocked-by-builds"
      }
    };
  }

  if (!baseReady) {
    return {
      commands: addManualGuidanceIfNeeded(commands, nextBaseState, snapshot, config),
      state: {
        ...nextBaseState,
        countdownStartedAtMs: null,
        manualGuidanceShown: shouldShowManualGuidance(snapshot, config),
        remainingTriggerSteps: 0,
        status: "tracking"
      }
    };
  }

  if (snapshot.isLastSlide) {
    commands.push({ type: "suggest-finish", slideId: snapshot.slideId });
    return {
      commands,
      state: {
        ...nextBaseState,
        countdownStartedAtMs: null,
        manualGuidanceShown: false,
        remainingTriggerSteps: 0,
        status: "finish-suggested"
      }
    };
  }

  if (
    nextBaseState.status === "countdown" &&
    nextBaseState.countdownStartedAtMs !== null
  ) {
    if (!snapshot.pause.isPaused) {
      commands.push({ type: "cancel-countdown", reason: "speech-resumed" });
      return {
        commands,
        state: {
          ...nextBaseState,
          countdownStartedAtMs: null,
          manualGuidanceShown: false,
          remainingTriggerSteps: 0,
          status: "ready"
        }
      };
    }

    if (
      snapshot.nowMs - nextBaseState.countdownStartedAtMs >=
      snapshot.policy.countdownMs
    ) {
      commands.push({ type: "advance-slide", slideId: snapshot.slideId });
      return {
        commands,
        state: {
          ...nextBaseState,
          countdownStartedAtMs: null,
          manualGuidanceShown: false,
          remainingTriggerSteps: 0,
          status: "tracking"
        }
      };
    }

    return {
      commands,
      state: {
        ...nextBaseState,
        manualGuidanceShown: false
      }
    };
  }

  if (
    snapshot.pause.isPaused &&
    snapshot.pause.silenceDurationMs >= snapshot.policy.pauseMs
  ) {
    return {
      commands,
      state: {
        ...nextBaseState,
        countdownStartedAtMs: snapshot.nowMs,
        manualGuidanceShown: false,
        remainingTriggerSteps: 0,
        status: "countdown"
      }
    };
  }

  return {
    commands,
    state: {
      ...nextBaseState,
      countdownStartedAtMs: null,
      manualGuidanceShown: false,
      remainingTriggerSteps: 0,
      status: "ready"
    }
  };
}

function addManualGuidanceIfNeeded(
  commands: AdvanceControllerCommand[],
  state: AdvanceControllerState,
  snapshot: AdvanceControllerSnapshot,
  config: AutoAdvanceConfig
) {
  if (!state.manualGuidanceShown && shouldShowManualGuidance(snapshot, config)) {
    return [...commands, { type: "show-manual-guidance" as const }];
  }

  return commands;
}

function shouldShowManualGuidance(
  snapshot: AdvanceControllerSnapshot,
  config: AutoAdvanceConfig
) {
  return Boolean(
    snapshot.finalSentenceSpokenAtMs !== null &&
      snapshot.nowMs - snapshot.finalSentenceSpokenAtMs >=
        config.manualGuidanceDelayMs
  );
}
