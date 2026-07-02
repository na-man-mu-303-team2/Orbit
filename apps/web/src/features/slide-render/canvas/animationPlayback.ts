import {
  advanceAnimationRuntimeState,
  buildAnimationSequence,
  createInitialAnimationRuntimeState,
  findFirstPendingKeywordAnimationStep,
  getNextPendingAnimationStep,
  resolveAnimationRenderState,
  triggerAnimationRuntimeState,
  type AnimationRenderState,
  type AnimationRuntimeState,
  type AnimationSequence,
  type AnimationSequenceStep
} from "@orbit/editor-core";
import type { DeckAnimationId, Slide } from "@orbit/shared";
import { useEffect, useMemo, useRef, useState } from "react";

export type SlideAnimationAdvanceAction =
  | "advance-animation-step"
  | "advance-slide"
  | "complete-playing-step";

type PlaybackStepState = {
  progress: number;
  step: AnimationSequenceStep;
};

export type SlideAnimationKeywordTriggerResult =
  | {
      status: "triggered" | "queued";
      step: AnimationSequenceStep;
    }
  | {
      status: "ignored";
      step: AnimationSequenceStep | null;
    };

export function getSlideAnimationAdvanceAction(options: {
  isPlaying: boolean;
  runtimeState: AnimationRuntimeState | null;
  sequence: AnimationSequence | null;
}): SlideAnimationAdvanceAction {
  const { isPlaying, runtimeState, sequence } = options;

  if (isPlaying) {
    return "complete-playing-step";
  }

  if (!sequence || !runtimeState || runtimeState.currentStepIndex >= sequence.steps.length) {
    return "advance-slide";
  }

  return "advance-animation-step";
}

export function useSlideAnimationPlayback(slide: Slide | null) {
  const sequence = useMemo(
    () => (slide ? buildAnimationSequence(slide) : null),
    [slide]
  );
  const [runtimeState, setRuntimeState] = useState<AnimationRuntimeState | null>(() =>
    sequence ? createInitialAnimationRuntimeState(sequence) : null
  );
  const [playbackStepState, setPlaybackStepState] = useState<PlaybackStepState | null>(
    null
  );
  const [queuedAnimationIds, setQueuedAnimationIds] = useState<DeckAnimationId[]>([]);
  const playbackFrameRef = useRef<number | null>(null);

  useEffect(() => {
    if (!sequence) {
      setRuntimeState(null);
      setPlaybackStepState(null);
      setQueuedAnimationIds([]);
      return;
    }

    setRuntimeState(createInitialAnimationRuntimeState(sequence));
    setPlaybackStepState(null);
    setQueuedAnimationIds([]);
  }, [sequence]);

  useEffect(() => {
    return () => {
      if (playbackFrameRef.current !== null) {
        window.cancelAnimationFrame(playbackFrameRef.current);
      }
    };
  }, []);

  const renderState = useMemo<AnimationRenderState | null>(() => {
    if (!slide || !sequence || !runtimeState) {
      return null;
    }

    return resolveAnimationRenderState(slide, sequence, runtimeState);
  }, [runtimeState, sequence, slide]);

  function stopPlayback() {
    if (playbackFrameRef.current !== null) {
      window.cancelAnimationFrame(playbackFrameRef.current);
      playbackFrameRef.current = null;
    }

    setPlaybackStepState(null);
  }

  function startPlayback(step: AnimationSequenceStep) {
    if (typeof window === "undefined") {
      setPlaybackStepState(null);
      return;
    }

    stopPlayback();

    const totalDurationMs = step.delayMs + step.durationMs;

    if (totalDurationMs <= 0) {
      setPlaybackStepState(null);
      return;
    }

    const startTime = window.performance.now();

    const tick = () => {
      const elapsedMs = window.performance.now() - startTime;
      const nextProgress = Math.min(elapsedMs / totalDurationMs, 1);

      setPlaybackStepState({
        progress: nextProgress,
        step
      });

      if (nextProgress >= 1) {
        playbackFrameRef.current = null;
        window.setTimeout(() => {
          setPlaybackStepState((current) =>
            current?.step.animationId === step.animationId ? null : current
          );
        }, 0);
        return;
      }

      playbackFrameRef.current = window.requestAnimationFrame(tick);
    };

    playbackFrameRef.current = window.requestAnimationFrame(tick);
  }

  function advance() {
    if (!sequence || !runtimeState) {
      return false;
    }

    const nextAction = getSlideAnimationAdvanceAction({
      isPlaying: playbackStepState !== null,
      runtimeState,
      sequence
    });

    if (nextAction === "complete-playing-step") {
      stopPlayback();
      return true;
    }

    if (nextAction === "advance-slide") {
      return false;
    }

    const nextStep = getNextPendingAnimationStep(sequence, runtimeState);
    const nextRuntimeState = advanceAnimationRuntimeState(sequence, runtimeState);

    setRuntimeState(nextRuntimeState);

    if (nextStep) {
      startPlayback(nextStep);
    }

    return true;
  }

  function reset() {
    if (!sequence) {
      return;
    }

    stopPlayback();
    setQueuedAnimationIds([]);
    setRuntimeState(createInitialAnimationRuntimeState(sequence));
  }

  function triggerKeyword(keywordId: string): SlideAnimationKeywordTriggerResult {
    if (!sequence || !runtimeState) {
      return {
        status: "ignored",
        step: null
      };
    }

    const nextStep = findFirstPendingKeywordAnimationStep(
      sequence,
      runtimeState,
      keywordId
    );
    if (!nextStep) {
      return {
        status: "ignored",
        step: null
      };
    }

    if (
      playbackStepState?.step.animationId === nextStep.animationId ||
      queuedAnimationIds.includes(nextStep.animationId)
    ) {
      return {
        status: "ignored",
        step: nextStep
      };
    }

    if (playbackStepState) {
      setQueuedAnimationIds((current) =>
        current.includes(nextStep.animationId)
          ? current
          : [...current, nextStep.animationId]
      );
      return {
        status: "queued",
        step: nextStep
      };
    }

    const nextRuntimeState = triggerAnimationRuntimeState(
      sequence,
      runtimeState,
      nextStep.animationId
    );
    setRuntimeState(nextRuntimeState);
    startPlayback(nextStep);

    return {
      status: "triggered",
      step: nextStep
    };
  }

  useEffect(() => {
    if (playbackStepState || queuedAnimationIds.length === 0 || !sequence || !runtimeState) {
      return;
    }

    const [nextAnimationId, ...rest] = queuedAnimationIds;
    if (!nextAnimationId) {
      return;
    }

    const nextStep =
      sequence.steps.find((step) => step.animationId === nextAnimationId) ?? null;
    const nextRuntimeState = triggerAnimationRuntimeState(
      sequence,
      runtimeState,
      nextAnimationId
    );

    setQueuedAnimationIds(rest);

    if (!nextStep || nextRuntimeState === runtimeState) {
      return;
    }

    setRuntimeState(nextRuntimeState);
    startPlayback(nextStep);
  }, [playbackStepState, queuedAnimationIds, runtimeState, sequence]);

  return {
    advance,
    currentStepIndex: runtimeState?.currentStepIndex ?? 0,
    isPlaying: playbackStepState !== null,
    playbackProgress: playbackStepState?.progress ?? null,
    playbackStep: playbackStepState?.step ?? null,
    queuedAnimationIds,
    renderState,
    reset,
    runtimeState,
    sequence,
    triggerKeyword
  };
}
