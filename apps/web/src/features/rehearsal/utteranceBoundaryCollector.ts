import type { RehearsalUtteranceBoundary } from "@orbit/shared";
import type { LiveSttSpeechActivityEvent } from "./stt/liveSttPort";

type BoundaryContext = {
  slideId: string | null;
  deckRevision: number;
};

type ActiveUtterance = BoundaryContext & {
  utteranceId: string;
  segmentIndex: number;
  onsetMs: number;
  clipStartMs: number;
};

export type UtteranceBoundaryCollector = {
  accept: (
    event: LiveSttSpeechActivityEvent,
    recordingAtMs: number,
    context: BoundaryContext,
  ) => void;
  finish: (
    recordingAtMs: number,
    reason?: "stopped" | "silence",
  ) => void;
  reset: () => void;
  snapshot: () => RehearsalUtteranceBoundary[];
};

const defaultPreRollMs = 300;
const defaultMaximumGroupMs = 60_000;

export function createUtteranceBoundaryCollector(options: {
  maximumGroupMs?: number;
  preRollMs?: number;
} = {}): UtteranceBoundaryCollector {
  const boundaries: RehearsalUtteranceBoundary[] = [];
  const maximumGroupMs = options.maximumGroupMs ?? defaultMaximumGroupMs;
  const preRollMs = options.preRollMs ?? defaultPreRollMs;
  let active: ActiveUtterance | null = null;
  let nextSequence = 1;

  function appendBoundary(
    startMs: number,
    endMs: number,
    reason: RehearsalUtteranceBoundary["commitReason"],
    context: ActiveUtterance,
  ) {
    if (endMs <= startMs) {
      return;
    }
    const sequence = nextSequence++;
    boundaries.push({
      utteranceId: createSegmentId(context.utteranceId, context.segmentIndex),
      sequence,
      startMs: Math.round(startMs),
      endMs: Math.round(endMs),
      commitReason: reason,
      slideId: context.slideId,
      deckRevision: context.deckRevision,
    });
  }

  function splitLongGroup(recordingAtMs: number, context: BoundaryContext) {
    if (!active || recordingAtMs - active.onsetMs <= maximumGroupMs) {
      return;
    }

    while (active && recordingAtMs - active.clipStartMs > maximumGroupMs) {
      const current: ActiveUtterance = active;
      const splitAtMs: number = current.clipStartMs + maximumGroupMs;
      appendBoundary(current.clipStartMs, splitAtMs, "max-duration", current);
      active = {
        utteranceId: current.utteranceId,
        segmentIndex: current.segmentIndex + 1,
        onsetMs: splitAtMs,
        clipStartMs: splitAtMs,
        slideId: context.slideId,
        deckRevision: context.deckRevision,
      };
    }
  }

  function finish(
    recordingAtMs: number,
    reason: "stopped" | "silence" = "stopped",
  ) {
    if (!active) {
      return;
    }
    splitLongGroup(recordingAtMs, active);
    appendBoundary(active.clipStartMs, recordingAtMs, reason, active);
    active = null;
  }

  return {
    accept: (event, recordingAtMs, context) => {
      if (event.type === "speech-started") {
        if (!active) {
          active = {
            utteranceId: event.utteranceId,
            segmentIndex: 0,
            onsetMs: recordingAtMs,
            clipStartMs: Math.max(recordingAtMs - preRollMs, 0),
            ...context,
          };
        }
        return;
      }
      if (event.type === "speech-fragment-committed") {
        splitLongGroup(recordingAtMs, context);
        return;
      }
      finish(recordingAtMs, event.reason === "silence" ? "silence" : "stopped");
    },
    finish,
    reset: () => {
      boundaries.length = 0;
      active = null;
      nextSequence = 1;
    },
    snapshot: () => boundaries.map((boundary) => ({ ...boundary })),
  };
}

function createSegmentId(utteranceId: string, segmentIndex: number) {
  if (segmentIndex === 0) {
    return utteranceId;
  }
  const suffix = `:segment-${segmentIndex + 1}`;
  return `${utteranceId.slice(0, 128 - suffix.length)}${suffix}`;
}
