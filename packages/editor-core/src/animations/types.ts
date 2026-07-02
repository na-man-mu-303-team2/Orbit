import type { DeckAnimation, DeckElement, Slide } from "@orbit/shared";

export type AnimationStepKind = "enter" | "exit" | "emphasis";

export type AnimationSequenceStep = {
  animationId: DeckAnimation["animationId"];
  elementId: DeckAnimation["elementId"];
  type: DeckAnimation["type"];
  order: number;
  durationMs: number;
  delayMs: number;
  easing: DeckAnimation["easing"];
  kind: AnimationStepKind;
  initialVisible: boolean;
  finalVisible: boolean;
};

export type AnimationSequence = {
  slideId: Slide["slideId"];
  steps: AnimationSequenceStep[];
};

export type AnimationRuntimeStatus = "pending" | "completed";

export type AnimationRuntimeState = {
  slideId: Slide["slideId"];
  currentStepIndex: number;
  executedAnimationIds: DeckAnimation["animationId"][];
  lastTriggeredAnimationId: DeckAnimation["animationId"] | null;
  status: AnimationRuntimeStatus;
};

export type AnimationResolvedElementState = {
  elementId: DeckElement["elementId"];
  visible: boolean;
  opacity: number;
};

export type AnimationRenderState = {
  slideId: Slide["slideId"];
  currentStepIndex: number;
  status: AnimationRuntimeStatus;
  activeStep: AnimationSequenceStep | null;
  elements: Record<DeckElement["elementId"], AnimationResolvedElementState>;
};
