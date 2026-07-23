import type {
  DesignAgentIntentPreset,
  SlideRedesignPaletteOption,
} from "@orbit/shared";

export type DesignRequestOptions = {
  intentPreset?: DesignAgentIntentPreset;
  selectedPaletteOptionId?: string | null;
  sessionId?: string;
};

export type PendingPaletteSelection = {
  content: string;
  options: SlideRedesignPaletteOption[];
  sessionId: string;
};

export function buildQuickActionDesignRequestOptions(
  intentPreset: DesignAgentIntentPreset,
): DesignRequestOptions {
  return intentPreset === "redesign-slide"
    ? { intentPreset, selectedPaletteOptionId: null }
    : { intentPreset };
}

export function buildPaletteFollowUpRequest(
  selection: PendingPaletteSelection,
  optionId: string,
): { content: string; options: DesignRequestOptions; optionName: string } | null {
  const option = selection.options.find((candidate) => candidate.optionId === optionId);
  if (!option) return null;
  return {
    content: selection.content,
    optionName: option.name,
    options: {
      intentPreset: "redesign-slide",
      selectedPaletteOptionId: option.optionId,
      sessionId: selection.sessionId,
    },
  };
}
