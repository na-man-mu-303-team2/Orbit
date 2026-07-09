import type { SemanticUtteranceMatch } from "./semanticUtteranceMatcher";

export type SemanticUtteranceDebugStatus =
  | "idle"
  | "loading-model"
  | "model-ready"
  | "indexing-script"
  | "matching"
  | "ready"
  | "error";

export type SemanticUtteranceDebugState = {
  status: SemanticUtteranceDebugStatus;
  slideId: string | null;
  transcript: string;
  isFinal: boolean;
  topMatches: SemanticUtteranceMatch[];
  error: string | null;
};

export function createIdleSemanticDebugState(): SemanticUtteranceDebugState {
  return {
    status: "idle",
    slideId: null,
    transcript: "",
    isFinal: false,
    topMatches: [],
    error: null
  };
}

export function createSemanticDebugState(
  override: Partial<SemanticUtteranceDebugState>
): SemanticUtteranceDebugState {
  return {
    ...createIdleSemanticDebugState(),
    ...override
  };
}

export function markSemanticModelReady(
  state: SemanticUtteranceDebugState
): SemanticUtteranceDebugState {
  if (
    state.status !== "idle" &&
    state.status !== "loading-model" &&
    state.status !== "error"
  ) {
    return state;
  }

  return {
    ...state,
    status: "model-ready",
    error: null
  };
}

export function semanticDebugErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}
