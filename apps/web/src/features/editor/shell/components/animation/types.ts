import type { DeckAnimation, DeckElement } from "@orbit/shared";

export type SupportedAnimationType = "fade-in" | "fade-out";
export type AnimationPanelMode =
  | "idle"
  | "editing-existing"
  | "creating-new";

export type AnimationDraftInput = {
  delayMs: number;
  durationMs: number;
  type: DeckAnimation["type"];
};

export type AnimationTimingDraft = Omit<AnimationDraftInput, "type">;

export type AnimationEditorPanelProps = {
  animations: DeckAnimation[];
  canCreateAnimation: boolean;
  element: DeckElement | null;
  preferredAnimationId?: string | null;
  slideAnimations: DeckAnimation[];
  slideElements: DeckElement[];
  onAddAnimation: (draft: AnimationDraftInput) => void;
  onDeleteAnimation: (animationId: string) => void;
  onSelectSlideAnimation: (animation: DeckAnimation) => void;
  onUpdateAnimation: (
    animationId: string,
    patch: Partial<DeckAnimation>
  ) => void;
  showIds: boolean;
};
