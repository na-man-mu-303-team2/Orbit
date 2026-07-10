import type {
  RehearsalContextCoverageDecision,
  RehearsalRunMeta,
  SlideContextItem,
} from "@orbit/shared";

import type { ContextItemCoverageEvaluation } from "./contextCoverageMatcher";

export function createEmptyRehearsalRunMeta(): RehearsalRunMeta {
  return {
    slideTimeline: [],
    missedKeywords: [],
    adviceEvents: [],
    utteranceOutcomes: [],
    contextCoverageDecisions: [],
  };
}

export function appendCoveredContextDecision(
  current: readonly RehearsalContextCoverageDecision[],
  input: {
    item: Pick<SlideContextItem, "itemId" | "slideId" | "label">;
    evaluation: ContextItemCoverageEvaluation;
    at: string;
  },
): RehearsalContextCoverageDecision[] {
  if (
    current.some(
      (decision) =>
        decision.itemId === input.item.itemId && decision.status === "covered",
    )
  ) {
    return [...current];
  }

  return [
    ...current,
    {
      itemId: input.item.itemId,
      slideId: input.item.slideId,
      label: input.item.label,
      status: "covered",
      method: input.evaluation.method,
      lexicalOverlap: input.evaluation.lexicalOverlap,
      semanticSimilarity: input.evaluation.semanticSimilarity,
      strength: input.evaluation.strength,
      at: input.at,
    },
  ];
}

export function mergeRunMetaWithContextCoverage(input: {
  runMeta: RehearsalRunMeta | null;
  items: readonly SlideContextItem[];
  coveredItemIds: ReadonlySet<string>;
  decisions: readonly RehearsalContextCoverageDecision[];
  now?: () => string;
}): RehearsalRunMeta | null {
  const now = input.now ?? (() => new Date().toISOString());
  const base = input.runMeta ?? createEmptyRehearsalRunMeta();
  const decisions = [...base.contextCoverageDecisions];
  const loggedItemIds = new Set(decisions.map((decision) => decision.itemId));

  for (const decision of input.decisions) {
    if (loggedItemIds.has(decision.itemId)) {
      continue;
    }
    decisions.push(decision);
    loggedItemIds.add(decision.itemId);
  }

  for (const item of input.items) {
    if (input.coveredItemIds.has(item.itemId) || loggedItemIds.has(item.itemId)) {
      continue;
    }
    decisions.push({
      itemId: item.itemId,
      slideId: item.slideId,
      label: item.label,
      status: "missed",
      method: "none",
      lexicalOverlap: 0,
      semanticSimilarity: 0,
      strength: 0,
      at: now(),
    });
    loggedItemIds.add(item.itemId);
  }

  const merged = {
    ...base,
    contextCoverageDecisions: decisions,
  };

  return hasRunMetaContent(merged) ? merged : null;
}

function hasRunMetaContent(meta: RehearsalRunMeta) {
  return (
    meta.slideTimeline.length > 0 ||
    meta.missedKeywords.length > 0 ||
    meta.adviceEvents.length > 0 ||
    meta.utteranceOutcomes.length > 0 ||
    meta.contextCoverageDecisions.length > 0
  );
}
