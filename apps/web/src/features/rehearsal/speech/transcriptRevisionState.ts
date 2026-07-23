import type { LiveSttResult } from "../stt/liveSttPort";

export type TranscriptRevisionState = {
  committedTranscript: string;
  draftTranscript: string;
  lastRevision: number | null;
  lastUtteranceId: string | null;
};

export type TranscriptRevisionUpdate = {
  currentTranscript: string;
  isStale: boolean;
  newSegment: string;
  previousTranscript: string;
  state: TranscriptRevisionState;
};

export function createTranscriptRevisionState(): TranscriptRevisionState {
  return {
    committedTranscript: "",
    draftTranscript: "",
    lastRevision: null,
    lastUtteranceId: null
  };
}

export function applyTranscriptRevision(
  current: TranscriptRevisionState,
  result: Pick<LiveSttResult, "isFinal" | "resultRevision" | "text" | "utteranceId">
): TranscriptRevisionUpdate {
  const text = result.text.trim();
  const previousTranscript = renderTranscript(current);
  const sameUtterance = Boolean(
    result.utteranceId && result.utteranceId === current.lastUtteranceId
  );
  if (
    sameUtterance &&
    result.resultRevision !== undefined &&
    current.lastRevision !== null &&
    result.resultRevision <= current.lastRevision
  ) {
    return {
      currentTranscript: previousTranscript,
      isStale: true,
      newSegment: "",
      previousTranscript,
      state: current
    };
  }

  const newSegment = resolveNewTranscriptSegment({
    current,
    sameUtterance,
    text
  });
  const next: TranscriptRevisionState = {
    committedTranscript: result.isFinal
      ? appendTranscript(current.committedTranscript, text)
      : current.committedTranscript,
    draftTranscript: result.isFinal ? "" : text,
    lastRevision: result.resultRevision ?? (sameUtterance ? current.lastRevision : null),
    lastUtteranceId: result.utteranceId ?? current.lastUtteranceId
  };
  const currentTranscript = renderTranscript(next);
  return {
    currentTranscript,
    isStale: false,
    newSegment,
    previousTranscript,
    state: next
  };
}

function appendTranscript(previous: string, next: string) {
  if (!next || normalize(previous).endsWith(normalize(next))) return previous;
  return [previous, next].filter(Boolean).join(" ");
}

function resolveNewTranscriptSegment(args: {
  current: TranscriptRevisionState;
  sameUtterance: boolean;
  text: string;
}) {
  const normalizedText = normalize(args.text);
  if (!normalizedText) return "";

  if (args.sameUtterance && args.current.draftTranscript) {
    return getIncrementalSegment(args.current.draftTranscript, args.text);
  }

  // Engines without utterance/revision IDs may repeat a final result. Compare
  // the next final with the committed tail so those repeated words never
  // become another trigger candidate.
  return getIncrementalSegment(args.current.committedTranscript, args.text);
}

function getIncrementalSegment(previous: string, next: string) {
  const normalizedPrevious = normalize(previous);
  const normalizedNext = normalize(next);
  if (!normalizedPrevious) return normalizedNext;
  if (normalizedNext.startsWith(normalizedPrevious)) {
    return normalizedNext.slice(normalizedPrevious.length);
  }
  if (normalizedPrevious.endsWith(normalizedNext)) return "";

  const maxOverlap = Math.min(normalizedPrevious.length, normalizedNext.length);
  for (let length = maxOverlap; length > 0; length -= 1) {
    if (
      normalizedPrevious.slice(-length) === normalizedNext.slice(0, length)
    ) {
      return normalizedNext.slice(length);
    }
  }
  // A correction changed an already displayed partial. Treat the corrected
  // revision as new input; the step resolver still protects consumed steps.
  return normalizedNext;
}

function renderTranscript(state: TranscriptRevisionState) {
  return [state.committedTranscript, state.draftTranscript].filter(Boolean).join(" ");
}

function normalize(value: string) {
  return value.replace(/\s+/g, "").trim().toLocaleLowerCase();
}
