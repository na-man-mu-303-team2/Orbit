import {
  classifyKoreanFillerUtterance,
  koreanFillerClassifierVersion,
  legacyVerbatimCoachingSource,
  type DisfluencyOccurrence,
  type FillerOccurrence,
  type RehearsalUtteranceBoundary,
  type VerbatimCoachingSource,
} from "@orbit/shared";
import type { StoragePort } from "@orbit/storage";
import {
  koreanFillerVerbatimPromptVersion,
  transcribeMiniFillerUtterances,
  type FillerVerbatimTranscriptionEvent,
  type VerbatimPronunciationTerm,
} from "./filler-verbatim-transcription";
import { extractRehearsalUtteranceAudioClips } from "./rehearsal-utterance-audio";

export type RehearsalVerbatimRuntimeOptions = {
  mode: "mini" | "realtime-oob" | "legacy";
  apiKey?: string;
  miniModel: string;
  fetcher?: typeof fetch;
  onEvent?: (event: FillerVerbatimTranscriptionEvent) => void;
};

export type RehearsalVerbatimCoachingEvidence = {
  source: VerbatimCoachingSource;
  fillerOccurrences: FillerOccurrence[];
  disfluencyOccurrences: DisfluencyOccurrence[];
  fillerWordCount: number;
  fillerWordDetails: Array<{ word: string; count: number }>;
  slideFillers: Map<
    string,
    { fillerWordCount: number; fillerWordDetails: Array<{ word: string; count: number }> }
  >;
};

export async function createRehearsalVerbatimCoachingEvidence(input: {
  storage: Pick<StoragePort, "getObject">;
  storageKey: string;
  boundaries: readonly RehearsalUtteranceBoundary[];
  pronunciationTerms?: readonly VerbatimPronunciationTerm[];
  runtime?: RehearsalVerbatimRuntimeOptions;
  extractClips?: typeof extractRehearsalUtteranceAudioClips;
  transcribe?: typeof transcribeMiniFillerUtterances;
}): Promise<RehearsalVerbatimCoachingEvidence> {
  const runtime = input.runtime;
  if (!runtime || runtime.mode === "legacy") {
    return emptyEvidence(legacyVerbatimCoachingSource);
  }

  const unavailableSource = sourceFor(runtime, "unavailable", 0, input.boundaries.length);
  if (
    runtime.mode !== "mini" ||
    !runtime.apiKey ||
    input.boundaries.length === 0
  ) {
    return emptyEvidence(unavailableSource);
  }

  let clips: Awaited<ReturnType<typeof extractRehearsalUtteranceAudioClips>> = [];
  try {
    const object = await input.storage.getObject(input.storageKey);
    clips = await (input.extractClips ?? extractRehearsalUtteranceAudioClips)({
      audio: object.body,
      boundaries: input.boundaries,
    });
    const transcriptions = await (input.transcribe ?? transcribeMiniFillerUtterances)({
      apiKey: runtime.apiKey,
      clips,
      fetcher: runtime.fetcher,
      model: runtime.miniModel,
      onEvent: runtime.onEvent,
      pronunciationTerms: input.pronunciationTerms,
    });
    const completed = transcriptions.filter(
      (transcription) =>
        transcription.status === "completed" && transcription.transcript,
    );
    if (completed.length === 0) {
      return emptyEvidence(unavailableSource);
    }

    const fillerOccurrences: FillerOccurrence[] = [];
    const disfluencyOccurrences: DisfluencyOccurrence[] = [];
    for (const transcription of completed) {
      const classified = classifyKoreanFillerUtterance({
        utteranceId: transcription.utteranceId,
        transcript: transcription.transcript!,
        slideId: transcription.slideId,
      });
      fillerOccurrences.push(...classified.fillerOccurrences);
      disfluencyOccurrences.push(...classified.disfluencyOccurrences);
    }
    const sourceState =
      completed.length === input.boundaries.length ? "completed" : "degraded";
    return buildEvidence(
      sourceFor(
        runtime,
        sourceState,
        completed.length,
        input.boundaries.length,
      ),
      fillerOccurrences,
      disfluencyOccurrences,
    );
  } catch {
    return emptyEvidence(unavailableSource);
  } finally {
    for (const clip of clips) {
      clip.audio.fill(0);
    }
    clips.length = 0;
  }
}

function buildEvidence(
  source: VerbatimCoachingSource,
  fillerOccurrences: FillerOccurrence[],
  disfluencyOccurrences: DisfluencyOccurrence[],
): RehearsalVerbatimCoachingEvidence {
  const aggregate = countFillers(fillerOccurrences);
  const occurrencesBySlide = new Map<string, FillerOccurrence[]>();
  for (const occurrence of fillerOccurrences) {
    if (!occurrence.slideId) continue;
    const current = occurrencesBySlide.get(occurrence.slideId) ?? [];
    current.push(occurrence);
    occurrencesBySlide.set(occurrence.slideId, current);
  }
  const slideFillers = new Map<
    string,
    { fillerWordCount: number; fillerWordDetails: Array<{ word: string; count: number }> }
  >();
  for (const [slideId, occurrences] of occurrencesBySlide) {
    const counts = countFillers(occurrences);
    slideFillers.set(slideId, {
      fillerWordCount: counts.total,
      fillerWordDetails: counts.details,
    });
  }
  return {
    source,
    fillerOccurrences,
    disfluencyOccurrences,
    fillerWordCount: aggregate.total,
    fillerWordDetails: aggregate.details,
    slideFillers,
  };
}

function countFillers(occurrences: readonly FillerOccurrence[]) {
  const counts = new Map<string, number>();
  for (const occurrence of occurrences) {
    counts.set(
      occurrence.normalized,
      (counts.get(occurrence.normalized) ?? 0) + 1,
    );
  }
  const details = [...counts.entries()]
    .map(([word, count]) => ({ word, count }))
    .sort((left, right) => right.count - left.count || left.word.localeCompare(right.word));
  return {
    total: details.reduce((total, detail) => total + detail.count, 0),
    details,
  };
}

function sourceFor(
  runtime: RehearsalVerbatimRuntimeOptions,
  state: "completed" | "degraded" | "unavailable",
  completedUtterances: number,
  totalUtterances: number,
): VerbatimCoachingSource {
  return {
    mode: runtime.mode === "realtime-oob" ? "realtime-oob" : "mini",
    state,
    model:
      runtime.mode === "realtime-oob" ? "realtime-oob-unavailable" : runtime.miniModel,
    promptVersion: koreanFillerVerbatimPromptVersion,
    classifierVersion: koreanFillerClassifierVersion,
    completedUtterances,
    totalUtterances,
  };
}

function emptyEvidence(
  source: VerbatimCoachingSource,
): RehearsalVerbatimCoachingEvidence {
  return {
    source,
    fillerOccurrences: [],
    disfluencyOccurrences: [],
    fillerWordCount: 0,
    fillerWordDetails: [],
    slideFillers: new Map(),
  };
}
