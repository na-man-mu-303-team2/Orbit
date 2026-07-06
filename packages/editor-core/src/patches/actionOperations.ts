import type {
  Deck,
  DeckAnimation,
  DeckPatch,
  DeckSlideAction,
  DeckSlideActionTrigger,
  Keyword,
  Slide
} from "@orbit/shared";
import { keywordSchema } from "@orbit/shared";

export type DerivedKeywordUsage = {
  advancesSlide: boolean;
  animationIds: string[];
  keywordId: string;
};

type AnchoredKeyword = Keyword & {
  noteOccurrence?: number;
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
  options?: { noteOccurrence?: number; required?: boolean }
): Keyword {
  return keywordSchema.parse({
    keywordId: createKeywordId(deck),
    text: text.trim(),
    synonyms: [],
    abbreviations: [],
    noteOccurrence: options?.noteOccurrence,
    required: options?.required ?? true
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
  keywordId: string
): DeckPatch {
  return {
    deckId: deck.deckId,
    baseVersion: deck.version,
    source: "user",
    operations: [
      {
        type: "add_animation",
        slideId,
        animation
      },
      {
        type: "add_slide_action",
        slideId,
        action: {
          actionId: createSlideActionId(deck),
          trigger: {
            kind: "keyword",
            keywordId
          },
          effect: {
            kind: "play-animation",
            animationId: animation.animationId
          }
        }
      }
    ]
  };
}

export function createUpdateAnimationKeywordTriggerPatch(
  deck: Deck,
  slideId: string,
  animationId: string,
  keywordId: string
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
              trigger: {
                kind: "keyword",
                keywordId
              }
            }
          }
        ]
      : [
          {
            type: "add_slide_action",
            slideId,
            action: {
              actionId: createSlideActionId(deck),
              trigger: {
                kind: "keyword",
                keywordId
              },
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
  enabled: boolean
): DeckPatch | null {
  const slide = findSlide(deck, slideId);
  const matchingActions = slide
    ? slide.actions.filter(
        (action) =>
          action.trigger.kind === "keyword" &&
          action.trigger.keywordId === keywordId &&
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
            trigger: {
              kind: "keyword",
              keywordId
            },
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
    matchingActions[0] ??
    null;
}

export function deriveKeywordUsage(slide: Slide): Record<string, DerivedKeywordUsage> {
  const usage = Object.fromEntries(
    slide.keywords.map((keyword) => [
      keyword.keywordId,
      {
        keywordId: keyword.keywordId,
        animationIds: [],
        advancesSlide: false
      }
    ])
  ) as Record<string, DerivedKeywordUsage>;

  for (const action of slide.actions) {
    if (action.trigger.kind !== "keyword") {
      continue;
    }

    const keywordUsage = usage[action.trigger.keywordId];
    if (!keywordUsage) {
      continue;
    }

    if (action.effect.kind === "play-animation") {
      if (!keywordUsage.animationIds.includes(action.effect.animationId)) {
        keywordUsage.animationIds.push(action.effect.animationId);
      }
      continue;
    }

    if (action.effect.kind === "go-to-next-slide") {
      keywordUsage.advancesSlide = true;
    }
  }

  return usage;
}

export function findKeywordByTerm(
  slide: Slide,
  term: string,
  noteOccurrence?: number
): Keyword | null {
  const normalizedTerm = normalizeTerm(term);

  if (!normalizedTerm) {
    return null;
  }

  const anchoredPrimaryMatches = (slide.keywords as AnchoredKeyword[]).filter(
    (keyword) =>
      keyword.noteOccurrence !== undefined &&
      normalizeTerm(keyword.text) === normalizedTerm
  );

  if (noteOccurrence !== undefined) {
    const exactOccurrenceMatch = anchoredPrimaryMatches.find(
      (keyword) => keyword.noteOccurrence === noteOccurrence
    );

    if (exactOccurrenceMatch) {
      return exactOccurrenceMatch;
    }

    if (anchoredPrimaryMatches.length > 0) {
      return null;
    }
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

function normalizeTerm(value: string) {
  return value.trim().toLocaleLowerCase("ko-KR");
}
