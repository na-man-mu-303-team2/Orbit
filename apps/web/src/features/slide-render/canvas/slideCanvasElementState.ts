import type {
  AnimationRenderState,
  AnimationSequenceStep
} from "@orbit/editor-core";
import type { DeckElement } from "@orbit/shared";

export type SlideCanvasElementState = {
  opacity: number;
  rotationOffset: number;
  scale: number;
  visible: boolean;
};

const zoomScaleDelta = 0.08;

export function resolveSlideCanvasElementState(args: {
  activePlaybackStep?: AnimationSequenceStep | null;
  animationRenderState?: AnimationRenderState | null;
  element: DeckElement;
  playbackProgress?: number | null;
}): SlideCanvasElementState {
  const { activePlaybackStep, animationRenderState, element, playbackProgress } = args;
  const resolvedElement = animationRenderState?.elements[element.elementId];
  const state: SlideCanvasElementState = {
    opacity: resolvedElement?.opacity ?? element.opacity,
    rotationOffset: 0,
    scale: 1,
    visible: resolvedElement?.visible ?? element.visible
  };

  if (
    !activePlaybackStep ||
    activePlaybackStep.elementId !== element.elementId ||
    playbackProgress === null ||
    playbackProgress === undefined
  ) {
    return state;
  }

  const motionProgress = resolveMotionProgress(activePlaybackStep, playbackProgress);
  const hasStartedMotion = motionProgress > 0;
  const easedProgress = applyAnimationEasing(activePlaybackStep.easing, motionProgress);

  switch (activePlaybackStep.type) {
    case "appear":
      return {
        ...state,
        opacity: hasStartedMotion ? element.opacity : 0,
        visible: hasStartedMotion
      };
    case "fade-in":
      return {
        ...state,
        opacity: element.opacity * easedProgress,
        visible: true
      };
    case "zoom-in":
      return {
        ...state,
        opacity: element.opacity * easedProgress,
        scale: 1 - zoomScaleDelta + zoomScaleDelta * easedProgress,
        visible: true
      };
    case "disappear":
      return {
        ...state,
        opacity: element.opacity,
        visible: !hasStartedMotion || motionProgress < 1
      };
    case "fade-out":
      return {
        ...state,
        opacity: element.opacity * (1 - easedProgress),
        visible: true
      };
    case "zoom-out":
      return {
        ...state,
        opacity: element.opacity * (1 - easedProgress),
        scale: 1 - zoomScaleDelta * easedProgress,
        visible: true
      };
    case "rotate":
      return {
        ...state,
        rotationOffset: 360 * easedProgress,
        visible: true
      };
    default:
      return state;
  }
}

export function applyAnimationEasing(
  easing: AnimationSequenceStep["easing"],
  progress: number
) {
  const clamped = Math.min(Math.max(progress, 0), 1);

  switch (easing) {
    case "ease-in":
      return clamped * clamped;
    case "ease-out":
      return 1 - (1 - clamped) * (1 - clamped);
    case "ease-in-out":
      return clamped < 0.5
        ? 2 * clamped * clamped
        : 1 - Math.pow(-2 * clamped + 2, 2) / 2;
    case "linear":
    default:
      return clamped;
  }
}

function resolveMotionProgress(
  step: AnimationSequenceStep,
  playbackProgress: number
) {
  const totalDurationMs = step.delayMs + step.durationMs;

  if (totalDurationMs <= 0) {
    return 1;
  }

  const elapsedMs = playbackProgress * totalDurationMs;
  const motionElapsedMs = Math.max(0, elapsedMs - step.delayMs);

  return Math.min(motionElapsedMs / step.durationMs, 1);
}
