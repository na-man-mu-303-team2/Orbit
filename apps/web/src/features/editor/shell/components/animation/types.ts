import type { DeckAnimation, DeckElement } from "@orbit/shared";
import type { AnimationKeywordTriggerOption } from "./models";

export type SupportedAnimationType = "fade-in" | "fade-out";
export type AnimationPanelMode = "idle" | "editing-existing" | "creating-new";

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
  keywordOptions: AnimationKeywordTriggerOption[];
  keywordTriggerRestrictionMessage?: string | null;
  keywordTriggerWarningMessage?: string | null;
  mutationDisabledReason?: string | null;
  preferredAnimationId?: string | null;
  selectedKeywordId: string | null;
  selectedKeywordLabel: string | null;
  selectedKeywordOccurrenceId?: string | null;
  slideAnimations: DeckAnimation[];
  slideElements: DeckElement[];
  onAddAnimation: (
    draft: AnimationDraftInput,
    keywordId?: string | null,
    keywordOccurrenceId?: string | null,
  ) => void;
  onDeleteAnimation: (animationId: string) => void;
  onSelectKeyword: (keywordId: string) => void;
  onSelectSlideAnimation: (animation: DeckAnimation) => void;
  onUpdateAnimation: (
    animationId: string,
    patch: Partial<DeckAnimation>,
  ) => void;
  showIds: boolean;
};
