import type {
  Deck,
  DeckAnimation,
  DeckPatch,
  DeckSlideAction,
  DeckSlideActionTrigger,
  Keyword,
  Slide
} from "@orbit/shared";
import { deriveKeywordOccurrences, keywordSchema } from "@orbit/shared";

export type DerivedKeywordUsage = {
  advancesSlide: boolean;
  animationIds: string[];
  keywordId: string;
};

export type DerivedKeywordOccurrenceUsage = DerivedKeywordUsage & {
  occurrenceId: string;
};

export type DerivedKeywordActionUsage = {
  byKeywordId: Record<string, DerivedKeywordUsage>;
  byOccurrenceId: Record<string, DerivedKeywordOccurrenceUsage>;
};

export function createKeywordId(deck: Deck) {
  const existingIds = new Set(
    deck.slides.flatMap((slide) => slide.keywords.map((keyword) => keyword.keywordId))
  );

  for (let index = 1; index <= 9999; index += 1) {
    const candidate = `kw_${index}`;
    if (!existingIds.has(candidate)) {
      return candidate;
    }
  }

  return `kw_${Date.now()}`;
}

export function createSlideActionId(deck: Deck) {
  const existingIds = new Set(
    deck.slides.flatMap((slide) => slide.actions.map((action) => action.actionId))
  );

  for (let index = 1; index <= 9999; index += 1) {
    const candidate = `act_${index}`;
    if (!existingIds.has(candidate)) {
      return candidate;
    }
  }

  return `act_${Date.now()}`;
}

export function createKeyword(
  deck: Deck,
  text: string,
  options?: { required?: boolean }
): Keyword {
  return keywordSchema.parse({
    keywordId: createKeywordId(deck),
    text: text.trim(),
    synonyms: [],
    abbreviations: [],
    required: options?.required ?? true,
    requiredOccurrenceIds: []
  });
}

export function createReplaceKeywordsPatch(
  deck: Deck,
  slideId: string,
  keywords: Keyword[]
): DeckPatch {
  return {
    deckId: deck.deckId,
    baseVersion: deck.version,
    source: "user",
    operations: [
      {
        type: "replace_keywords",
        slideId,
        keywords
      }
    ]
  };
}

export function createAddAnimationWithKeywordTriggerPatch(
  deck: Deck,
  slideId: string,
  animation: DeckAnimation,
  keywordId: string,
  occurrenceId?: string | null
): DeckPatch {
  const slide = findSlide(deck, slideId);
  const insertion = slide
    ? resolveKeywordAnimationInsertion(slide, animation, occurrenceId)
    : { animation, shiftedAnimationIds: [] };
  return {
    deckId: deck.deckId,
    baseVersion: deck.version,
    source: "user",
    operations: [
      ...insertion.shiftedAnimationIds.map((animationId) => ({
        type: "update_animation" as const,
        slideId,
        animationId,
        animation: {
          order:
            (slide?.animations.find((candidate) => candidate.animationId === animationId)
              ?.order ?? 0) + 1
        }
      })),
      {
        type: "add_animation",
        slideId,
        animation: insertion.animation
      },
      {
        type: "add_slide_action",
        slideId,
        action: {
          actionId: createSlideActionId(deck),
          trigger: createKeywordActionTrigger(keywordId, occurrenceId),
          effect: {
            kind: "play-animation",
            animationId: insertion.animation.animationId
          }
        }
      }
    ]
  };
}

function resolveKeywordAnimationInsertion(
  slide: Slide,
  animation: DeckAnimation,
  occurrenceId?: string | null
) {
  if (!occurrenceId) {
    return { animation, shiftedAnimationIds: [] as string[] };
  }
  const occurrences = new Map(
    deriveKeywordOccurrences(slide).map((occurrence) => [occurrence.occurrenceId, occurrence])
  );
  const target = occurrences.get(occurrenceId);
  if (!target) {
    return { animation, shiftedAnimationIds: [] as string[] };
  }
  const linked = slide.actions.flatMap((action) =>
    action.trigger.kind === "keyword-occurrence" &&
    action.effect.kind === "play-animation"
      ? [{ animationId: action.effect.animationId, occurrenceId: action.trigger.occurrenceId }]
      : []
  );
  const sameOccurrenceIds = linked
    .filter((item) => item.occurrenceId === occurrenceId)
    .map((item) => item.animationId);
  const sameOccurrenceOrders = slide.animations
    .filter((candidate) => sameOccurrenceIds.includes(candidate.animationId))
    .map((candidate) => candidate.order);
  const nextKeywordOrder = linked
    .map((item) => ({
      animation: slide.animations.find((candidate) => candidate.animationId === item.animationId),
      occurrence: occurrences.get(item.occurrenceId)
    }))
    .filter((item): item is { animation: DeckAnimation; occurrence: NonNullable<typeof target> } =>
      Boolean(item.animation && item.occurrence && item.occurrence.start > target.start)
    )
    .sort((left, right) => left.occurrence.start - right.occurrence.start || left.animation.order - right.animation.order)[0]
    ?.animation.order;
  const insertionOrder =
    sameOccurrenceOrders.length > 0
      ? Math.max(...sameOccurrenceOrders) + 1
      : nextKeywordOrder ?? Math.max(0, ...slide.animations.map((candidate) => candidate.order)) + 1;
  return {
    animation: {
      ...animation,
      order: insertionOrder,
      startMode: sameOccurrenceOrders.length > 0 ? "with-previous" : animation.startMode
    },
    shiftedAnimationIds: slide.animations
      .filter((candidate) => candidate.order >= insertionOrder)
      .map((candidate) => candidate.animationId)
  };
}

export function createUpdateAnimationKeywordTriggerPatch(
  deck: Deck,
  slideId: string,
  animationId: string,
  keywordId: string,
  occurrenceId?: string | null
): DeckPatch {
  const slide = findSlide(deck, slideId);
  const existingAction = slide ? getAnimationTriggerAction(slide, animationId) : null;

  return {
    deckId: deck.deckId,
    baseVersion: deck.version,
    source: "user",
    operations: existingAction
      ? [
          {
            type: "update_slide_action",
            slideId,
            actionId: existingAction.actionId,
            action: {
              trigger: createKeywordActionTrigger(keywordId, occurrenceId)
            }
          }
        ]
      : [
          {
            type: "add_slide_action",
            slideId,
            action: {
              actionId: createSlideActionId(deck),
              trigger: createKeywordActionTrigger(keywordId, occurrenceId),
              effect: {
                kind: "play-animation",
                animationId
              }
            }
          }
        ]
  };
}

export function createUpsertAdvanceSlideKeywordActionPatch(
  deck: Deck,
  slideId: string,
  keywordId: string,
  enabled: boolean,
  occurrenceId?: string | null
): DeckPatch | null {
  const slide = findSlide(deck, slideId);
  const matchingActions = slide
    ? slide.actions.filter(
        (action) =>
          isSameKeywordTrigger(action, keywordId, occurrenceId) &&
          action.effect.kind === "go-to-next-slide"
      )
    : [];

  if (enabled) {
    if (matchingActions.length > 0) {
      return null;
    }

    return {
      deckId: deck.deckId,
      baseVersion: deck.version,
      source: "user",
      operations: [
        {
          type: "add_slide_action",
          slideId,
          action: {
            actionId: createSlideActionId(deck),
            trigger: createKeywordActionTrigger(keywordId, occurrenceId),
            effect: {
              kind: "go-to-next-slide"
            }
          }
        }
      ]
    };
  }

  if (matchingActions.length === 0) {
    return null;
  }

  return {
    deckId: deck.deckId,
    baseVersion: deck.version,
    source: "user",
    operations: matchingActions.map((action) => ({
      type: "delete_slide_action" as const,
      slideId,
      actionId: action.actionId
    }))
  };
}

export function getAnimationTriggerAction(
  slide: Slide,
  animationId: string
): DeckSlideAction | null {
  const matchingActions = slide.actions.filter(
    (action) =>
      action.effect.kind === "play-animation" &&
      action.effect.animationId === animationId
  );

  return matchingActions.find((action) => action.trigger.kind === "keyword") ??
    matchingActions.find((action) => action.trigger.kind === "keyword-occurrence") ??
    matchingActions[0] ??
    null;
}

export function deriveKeywordUsage(slide: Slide): Record<string, DerivedKeywordUsage> {
  return deriveKeywordActionUsage(slide).byKeywordId;
}

export function deriveKeywordActionUsage(slide: Slide): DerivedKeywordActionUsage {
  const byKeywordId = Object.fromEntries(
    slide.keywords.map((keyword) => [
      keyword.keywordId,
      {
        keywordId: keyword.keywordId,
        animationIds: [],
        advancesSlide: false
      }
    ])
  ) as Record<string, DerivedKeywordUsage>;
  const byOccurrenceId: Record<string, DerivedKeywordOccurrenceUsage> = {};

  for (const action of slide.actions) {
    if (
      action.trigger.kind !== "keyword" &&
      action.trigger.kind !== "keyword-occurrence"
    ) {
      continue;
    }

    const keywordUsage = byKeywordId[action.trigger.keywordId];
    if (!keywordUsage) {
      continue;
    }

    applyActionEffectToKeywordUsage(keywordUsage, action);

    if (action.trigger.kind === "keyword-occurrence") {
      const occurrenceUsage =
        byOccurrenceId[action.trigger.occurrenceId] ??
        {
          keywordId: action.trigger.keywordId,
          occurrenceId: action.trigger.occurrenceId,
          animationIds: [],
          advancesSlide: false
        };
      applyActionEffectToKeywordUsage(occurrenceUsage, action);
      byOccurrenceId[action.trigger.occurrenceId] = occurrenceUsage;
    }
  }

  return {
    byKeywordId,
    byOccurrenceId
  };
}

function applyActionEffectToKeywordUsage(
  usage: Pick<DerivedKeywordUsage, "animationIds" | "advancesSlide">,
  action: DeckSlideAction
) {
  if (action.effect.kind === "play-animation") {
    if (!usage.animationIds.includes(action.effect.animationId)) {
      usage.animationIds.push(action.effect.animationId);
    }
    return;
  }

  if (action.effect.kind === "go-to-next-slide") {
    usage.advancesSlide = true;
  }
}

export function findKeywordByTerm(slide: Slide, term: string): Keyword | null {
  const normalizedTerm = normalizeTerm(term);

  if (!normalizedTerm) {
    return null;
  }

  return (
    slide.keywords.find((keyword) =>
      [keyword.text, ...keyword.synonyms, ...keyword.abbreviations].some(
        (value) => normalizeTerm(value) === normalizedTerm
      )
    ) ?? null
  );
}

export function getKeywordTriggerLabel(
  slide: Slide,
  trigger: DeckSlideActionTrigger
): string {
  if (trigger.kind === "cue") {
    return `cue: ${trigger.cue}`;
  }

  const keyword = slide.keywords.find(
    (candidate) => candidate.keywordId === trigger.keywordId
  );
  return keyword ? `키워드: ${keyword.text}` : `키워드: ${trigger.keywordId}`;
}

function findSlide(deck: Deck, slideId: string) {
  return deck.slides.find((slide) => slide.slideId === slideId);
}

function createKeywordActionTrigger(
  keywordId: string,
  occurrenceId?: string | null
): DeckSlideActionTrigger {
  if (occurrenceId) {
    return {
      kind: "keyword-occurrence",
      keywordId,
      occurrenceId
    };
  }

  return {
    kind: "keyword",
    keywordId
  };
}

function isSameKeywordTrigger(
  action: DeckSlideAction,
  keywordId: string,
  occurrenceId?: string | null
) {
  if (occurrenceId) {
    return (
      action.trigger.kind === "keyword-occurrence" &&
      action.trigger.keywordId === keywordId &&
      action.trigger.occurrenceId === occurrenceId
    );
  }

  return (
    action.trigger.kind === "keyword" && action.trigger.keywordId === keywordId
  );
}

function normalizeTerm(value: string) {
  return value.trim().toLocaleLowerCase("ko-KR");
}
