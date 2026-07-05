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
    warningMessage: buildKeywordTriggerWarningMessage(
      stepCount,
      null
    )
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

function buildKeywordTriggerWarningMessage(
  stepCount: number,
  restrictionMessage: string | null
) {
  if (restrictionMessage || stepCount <= 0) {
    return null;
  }

  return stepCount === 1
    ? "선택된 키워드는 이미 다른 애니메이션 스텝에 연결되어 있습니다. 지금 추가하면 한 키워드가 여러 스텝을 순서대로 실행할 수 있습니다."
    : `선택된 키워드는 이미 ${stepCount}개 스텝에 연결되어 있습니다. 지금 추가하면 한 키워드가 여러 스텝을 한 번에 건너뛸 수 있습니다.`;
}
