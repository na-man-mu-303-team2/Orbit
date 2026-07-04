import {
  speechCueSchema,
  type Deck,
  type SpeechCue,
  type SpeechCueAction
} from "@orbit/shared";

export type RuntimeSpeechCue = SpeechCue & {
  slideId: string;
};

export type CueProvider = {
  getCues: (slideId: string) => readonly RuntimeSpeechCue[];
};

export type InternalSpeechCueConfig = Omit<RuntimeSpeechCue, "enabled"> & {
  enabled?: boolean;
};

const emptyCueProvider: CueProvider = {
  getCues: () => []
};

export function createDeckCueProvider(deck: Deck): CueProvider {
  const cuesBySlideId = new Map<string, RuntimeSpeechCue[]>();

  for (const slide of deck.slides) {
    const cues = (slide.speechCues ?? [])
      .filter((cue) => cue.enabled)
      .map((cue) => ({ ...cue, slideId: slide.slideId }));
    cuesBySlideId.set(slide.slideId, cues);
  }

  return {
    getCues: (slideId) => cuesBySlideId.get(slideId) ?? []
  };
}

export function createInternalCueProvider(
  config: readonly InternalSpeechCueConfig[] = []
): CueProvider {
  if (config.length === 0) {
    return emptyCueProvider;
  }

  const cuesBySlideId = new Map<string, RuntimeSpeechCue[]>();
  for (const cue of config) {
    const parsedCue = parseInternalCue(cue);
    if (!parsedCue.enabled) {
      continue;
    }

    const slideCues = cuesBySlideId.get(parsedCue.slideId) ?? [];
    slideCues.push(parsedCue);
    cuesBySlideId.set(parsedCue.slideId, slideCues);
  }

  return {
    getCues: (slideId) => cuesBySlideId.get(slideId) ?? []
  };
}

export function createPresenterCueProvider(options: {
  deck: Deck;
  internalProvider?: CueProvider;
}): CueProvider {
  const deckProvider = createDeckCueProvider(options.deck);
  const internalProvider = options.internalProvider ?? emptyCueProvider;

  return {
    getCues: (slideId) => {
      const deckCues = deckProvider.getCues(slideId);
      return deckCues.length > 0 ? deckCues : internalProvider.getCues(slideId);
    }
  };
}

export function getCuePhrasesForSlide(provider: CueProvider, slideId: string) {
  return provider
    .getCues(slideId)
    .flatMap((cue) => cue.trigger.phrases);
}

export function getCueReferencedAnimationIds(
  provider: CueProvider,
  slideId: string
) {
  return provider
    .getCues(slideId)
    .flatMap((cue) =>
      cue.action.type === "animation" ? [cue.action.animationId] : []
    );
}

export function hasEnabledAdvanceCue(provider: CueProvider, slideId: string) {
  return provider
    .getCues(slideId)
    .some((cue) => cue.action.type === "advance-slide");
}

export function isAnimationCueAction(
  action: SpeechCueAction
): action is Extract<SpeechCueAction, { type: "animation" }> {
  return action.type === "animation";
}

function parseInternalCue(cue: InternalSpeechCueConfig): RuntimeSpeechCue {
  if (!cue.slideId.trim()) {
    throw new Error("내부 발화 큐 설정에는 slideId가 필요합니다.");
  }

  const parsedCue = speechCueSchema.parse(cue);
  return {
    ...parsedCue,
    slideId: cue.slideId
  };
}
