import type { SemanticUtteranceMatch } from "./semanticUtteranceMatcher";

export type SemanticUtteranceDebugStatus =
  | "idle"
  | "loading-model"
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

export function semanticDebugErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}
