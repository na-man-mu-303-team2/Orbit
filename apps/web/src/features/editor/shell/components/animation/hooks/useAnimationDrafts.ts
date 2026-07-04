import { useState } from "react";

import type { SupportedAnimationType } from "../types";

type AnimationDraftState = Record<
  SupportedAnimationType,
  {
    delayMs: number;
    durationMs: number;
  }
>;

const initialDraftState: AnimationDraftState = {
  "fade-in": {
    delayMs: 0,
    durationMs: 400
  },
  "fade-out": {
    delayMs: 0,
    durationMs: 400
  }
};

export function useAnimationDrafts() {
  const [draftByType, setDraftByType] = useState<AnimationDraftState>(initialDraftState);

  function updateDraft(
    type: SupportedAnimationType,
    patch: Partial<AnimationDraftState[SupportedAnimationType]>
  ) {
    setDraftByType((current) => ({
      ...current,
      [type]: {
        ...current[type],
        ...patch
      }
    }));
  }

  return {
    draftByType,
    updateDraft
  };
}
