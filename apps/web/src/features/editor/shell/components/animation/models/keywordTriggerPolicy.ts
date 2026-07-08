import type { DeckAnimation, DeckElement } from "@orbit/shared";

type KeywordAnimationUsage = {
  animationIds: string[];
};

export type AnimationKeywordTriggerPolicy = {
  restrictionMessage: string | null;
  stepCount: number;
  warningMessage: string | null;
};

export function buildAnimationKeywordTriggerPolicy(args: {
  element: DeckElement | null;
  keywordId: string | null;
  slideAnimations: DeckAnimation[];
  usageByKeywordId: Record<string, KeywordAnimationUsage | undefined>;
}): AnimationKeywordTriggerPolicy {
  if (!args.keywordId || !args.element) {
    return {
      restrictionMessage: null,
      stepCount: 0,
      warningMessage: null
    };
  }

  const stepCount = countKeywordAnimationSteps(
    args.slideAnimations,
    args.usageByKeywordId[args.keywordId]
  );

  return {
    restrictionMessage: null,
    stepCount,
    warningMessage: null
  };
}

function countKeywordAnimationSteps(
  slideAnimations: DeckAnimation[],
  usage: KeywordAnimationUsage | undefined
) {
  if (!usage || usage.animationIds.length === 0) {
    return 0;
  }

  const orderByAnimationId = new Map(
    slideAnimations.map((animation) => [animation.animationId, animation.order])
  );

  return new Set(
    usage.animationIds
      .map((animationId) => orderByAnimationId.get(animationId))
      .filter((order): order is number => order !== undefined)
  ).size;
}
