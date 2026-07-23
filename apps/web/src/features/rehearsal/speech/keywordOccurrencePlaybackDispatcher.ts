import type { SlidePlaybackState } from "@orbit/editor-core";
import type { Slide } from "@orbit/shared";

import {
  resolveKeywordOccurrenceTriggeredActions,
  resolveQueuedKeywordOccurrencePlayback,
  type QueuedKeywordOccurrencePlaybackUpdate,
} from "../playback/triggeredActionPlayback";
import type { SlideshowAnimationPlan } from "../presenter/slideshowStepModel";
import {
  findFutureKeywordOccurrenceMatches,
  getExpectedKeywordOccurrenceStep,
  matchExpectedKeywordOccurrenceStep,
  type ExpectedKeywordOccurrenceResolution,
} from "./keywordOccurrenceStepResolver";

export type KeywordOccurrencePlaybackDispatch = {
  expectedStepOccurrenceIds: string[];
  matches: Array<{ keywordId: string; occurrenceId: string; text: string }>;
  queuedPlayback: QueuedKeywordOccurrencePlaybackUpdate;
  resolution: ExpectedKeywordOccurrenceResolution;
};

/**
 * Resolves exactly one non-stale STT increment against the current slideshow
 * state. Runtime owners apply the returned state themselves so this function
 * remains reusable by presentation and both rehearsal modes.
 */
export function dispatchKeywordOccurrencePlayback(args: {
  confidence?: number | null;
  consumedOccurrenceIds: readonly string[];
  newSegment: string;
  pendingOccurrenceIds: readonly string[];
  playbackState: SlidePlaybackState;
  presenterStepIndex: number;
  slide: Slide;
  slideAnimationPlan: SlideshowAnimationPlan;
}): KeywordOccurrencePlaybackDispatch {
  const expectedStep = getExpectedKeywordOccurrenceStep({
    presenterStepIndex: args.presenterStepIndex,
    slide: args.slide,
    slideAnimationPlan: args.slideAnimationPlan,
  });
  const resolution = matchExpectedKeywordOccurrenceStep({
    confidence: args.confidence,
    consumedOccurrenceIds: args.consumedOccurrenceIds,
    expectedStep,
    newSegment: args.newSegment,
    slide: args.slide,
  });
  const matches = [
    ...resolution.matches,
    ...findFutureKeywordOccurrenceMatches({
      confidence: args.confidence,
      consumedOccurrenceIds: args.consumedOccurrenceIds,
      newSegment: args.newSegment,
      presenterStepIndex: args.presenterStepIndex,
      slide: args.slide,
      slideAnimationPlan: args.slideAnimationPlan,
    }),
  ];
  const uniqueMatches = Array.from(
    new Map(matches.map((match) => [match.occurrenceId, match])).values(),
  );
  const actionsByOccurrenceId = new Map<string, Slide["actions"]>();
  for (const match of uniqueMatches) {
    actionsByOccurrenceId.set(
      match.occurrenceId,
      resolveKeywordOccurrenceTriggeredActions(
        args.slide,
        match.keywordId,
        match.occurrenceId,
      ),
    );
  }

  return {
    expectedStepOccurrenceIds: expectedStep?.occurrenceIds ?? [],
    matches: uniqueMatches,
    queuedPlayback: resolveQueuedKeywordOccurrencePlayback({
      actionsByOccurrenceId,
      matchedOccurrenceIds: uniqueMatches.map((match) => match.occurrenceId),
      pendingOccurrenceIds: args.pendingOccurrenceIds,
      playbackState: args.playbackState,
      presenterStepIndex: args.presenterStepIndex,
      slide: args.slide,
      slideAnimationPlan: args.slideAnimationPlan,
    }),
    resolution,
  };
}
