import type {
  DeckAnimationType,
  DeckElement,
  Slide,
} from "@orbit/shared";

import type {
  AnimationRenderState,
  AnimationResolvedElementState,
  AnimationRuntimeState,
  AnimationSequence,
  AnimationSequenceStep,
  AnimationStepKind,
} from "./types";

const enterAnimationTypes = new Set<DeckAnimationType>([
  "appear",
  "fade-in",
  "zoom-in",
]);

const exitAnimationTypes = new Set<DeckAnimationType>([
  "disappear",
  "fade-out",
  "zoom-out",
]);

export function buildAnimationSequence(slide: Slide): AnimationSequence {
  const elementsById = new Map<string, DeckElement>(
    slide.elements.map((element: DeckElement) => [element.elementId, element]),
  );

  const steps = [...slide.animations]
    .sort(
      (left, right) =>
        left.order - right.order ||
        left.delayMs - right.delayMs ||
        left.animationId.localeCompare(right.animationId),
    )
    .map((animation) => {
      const targetElement = elementsById.get(animation.elementId);
      const kind = getAnimationStepKind(animation.type);
      const targetVisible = targetElement?.visible ?? true;

      return {
        animationId: animation.animationId,
        elementId: animation.elementId,
        type: animation.type,
        order: animation.order,
        durationMs: animation.durationMs,
        delayMs: animation.delayMs,
        easing: animation.easing,
        kind,
        initialVisible: kind === "enter" ? false : targetVisible,
        finalVisible: kind === "exit" ? false : targetVisible,
      };
    });

  return {
    slideId: slide.slideId,
    steps,
  };
}

export function getAnimationStepKind(
  type: DeckAnimationType,
): AnimationStepKind {
  if (enterAnimationTypes.has(type)) {
    return "enter";
  }

  if (exitAnimationTypes.has(type)) {
    return "exit";
  }

  return "emphasis";
}

export function createInitialAnimationRuntimeState(
  sequence: AnimationSequence,
): AnimationRuntimeState {
  return {
    slideId: sequence.slideId,
    currentStepIndex: 0,
    executedAnimationIds: [],
    lastTriggeredAnimationId: null,
    status: sequence.steps.length === 0 ? "completed" : "pending",
  };
}

export function advanceAnimationRuntimeState(
  sequence: AnimationSequence,
  state: AnimationRuntimeState,
): AnimationRuntimeState {
  if (state.currentStepIndex >= sequence.steps.length) {
    return {
      ...state,
      currentStepIndex: sequence.steps.length,
      lastTriggeredAnimationId: null,
      status: "completed",
    };
  }

  const nextStep = sequence.steps[state.currentStepIndex];
  const nextExecutedAnimationIds = state.executedAnimationIds.includes(
    nextStep.animationId,
  )
    ? state.executedAnimationIds
    : [...state.executedAnimationIds, nextStep.animationId];
  const nextStepIndex = state.currentStepIndex + 1;

  return {
    slideId: state.slideId,
    currentStepIndex: nextStepIndex,
    executedAnimationIds: nextExecutedAnimationIds,
    lastTriggeredAnimationId: nextStep.animationId,
    status: nextStepIndex >= sequence.steps.length ? "completed" : "pending",
  };
}

export function resetAnimationRuntimeState(
  sequence: AnimationSequence,
): AnimationRuntimeState {
  return createInitialAnimationRuntimeState(sequence);
}

export function completeAnimationRuntimeState(
  sequence: AnimationSequence,
): AnimationRuntimeState {
  return {
    slideId: sequence.slideId,
    currentStepIndex: sequence.steps.length,
    executedAnimationIds: sequence.steps.map((step) => step.animationId),
    lastTriggeredAnimationId: null,
    status: "completed",
  };
}

export function getActiveAnimationStep(
  sequence: AnimationSequence,
  state: AnimationRuntimeState,
): AnimationSequenceStep | null {
  if (!state.lastTriggeredAnimationId) {
    return null;
  }

  return (
    sequence.steps.find(
      (step) => step.animationId === state.lastTriggeredAnimationId,
    ) ?? null
  );
}

export function resolveAnimationRenderState(
  slide: Slide,
  sequence: AnimationSequence,
  state: AnimationRuntimeState,
): AnimationRenderState {
  const firstStepByElementId = new Map<string, AnimationSequenceStep>();

  for (const step of sequence.steps) {
    if (!firstStepByElementId.has(step.elementId)) {
      firstStepByElementId.set(step.elementId, step);
    }
  }

  const elements = createInitialResolvedElementState(
    slide.elements,
    firstStepByElementId,
  );
  const executedAnimationIds = new Set(state.executedAnimationIds);

  for (const step of sequence.steps) {
    if (!executedAnimationIds.has(step.animationId)) {
      continue;
    }

    const element = slide.elements.find(
      (candidate: DeckElement) => candidate.elementId === step.elementId,
    );
    const resolvedElement = elements[step.elementId];

    if (!element || !resolvedElement) {
      continue;
    }

    switch (step.kind) {
      case "enter":
        resolvedElement.visible = true;
        resolvedElement.opacity = element.opacity;
        break;
      case "exit":
        resolvedElement.visible = false;
        resolvedElement.opacity = 0;
        break;
      case "emphasis":
        break;
    }
  }

  return {
    slideId: slide.slideId,
    currentStepIndex: state.currentStepIndex,
    status: state.status,
    activeStep: getActiveAnimationStep(sequence, state),
    elements,
  };
}

function createInitialResolvedElementState(
  elements: DeckElement[],
  firstStepByElementId: Map<string, AnimationSequenceStep>,
): Record<string, AnimationResolvedElementState> {
  const resolvedElementState: Record<string, AnimationResolvedElementState> = {};

  for (const element of elements) {
    const firstStep = firstStepByElementId.get(element.elementId);
    const initiallyVisible = firstStep?.kind === "enter" ? false : element.visible;

    resolvedElementState[element.elementId] = {
      elementId: element.elementId,
      visible: initiallyVisible,
      opacity: initiallyVisible ? element.opacity : 0,
    };
  }

  return resolvedElementState;
}
