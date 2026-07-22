import type { Deck, SlideRedesignJobResult } from "@orbit/shared";
import type { DesignProposalPreview } from "./designProposalPreview";
import { isDesignProposalStale } from "./designProposalPreview";

export const designProposalLifecycles = [
  "idle",
  "generating",
  "preview-read-only",
  "proposal-ready",
  "stale",
  "applying",
  "applied",
  "failed",
] as const;

export type DesignProposalLifecycle =
  (typeof designProposalLifecycles)[number];

export function resolveDesignProposalLifecycle(
  lifecycle: DesignProposalLifecycle,
  currentDeck: Deck,
  preview: DesignProposalPreview | null,
): DesignProposalLifecycle {
  if (preview && isDesignProposalStale(currentDeck, preview.proposal)) {
    return "stale";
  }
  return lifecycle;
}

export function canApplyDesignProposal(lifecycle: DesignProposalLifecycle) {
  return lifecycle === "proposal-ready" || lifecycle === "failed";
}

export function resolveCompletedSlideRedesignLifecycle(
  result: SlideRedesignJobResult,
  currentDeck: Deck,
  preview: DesignProposalPreview | null,
): DesignProposalLifecycle {
  if (result.stale) return "stale";
  if (!result.proposal || !preview) return "idle";
  return resolveDesignProposalLifecycle("proposal-ready", currentDeck, preview);
}

export function canRetryDesignRequest(
  lifecycle: DesignProposalLifecycle,
  hasFailedRequest: boolean,
) {
  return hasFailedRequest && (lifecycle === "failed" || lifecycle === "stale");
}
