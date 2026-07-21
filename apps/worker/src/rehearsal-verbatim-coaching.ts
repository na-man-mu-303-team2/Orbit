import {
  classifyKoreanFillerUtterance,
  koreanFillerClassifierVersion,
  legacyVerbatimCoachingSource,
  type DisfluencyOccurrence,
  type FillerOccurrence,
  type RehearsalOobVerbatimResult,
  type RehearsalUtteranceBoundary,
  type VerbatimCoachingSource,
  type VerbatimCoachingTelemetry,
} from "@orbit/shared";
import type { StoragePort } from "@orbit/storage";
import {
  koreanFillerVerbatimPromptVersion,
  transcribeMiniFillerUtterances,
  type FillerVerbatimTranscriptionResult,
  type FillerVerbatimTranscriptionEvent,
  type VerbatimPronunciationTerm,
} from "./filler-verbatim-transcription";
import { extractRehearsalUtteranceAudioClips } from "./rehearsal-utterance-audio";

export const koreanFillerVerbatimOobPromptVersion =
  "korean-filler-verbatim-oob-v1" as const;

export type RehearsalVerbatimRuntimeOptions = {
  mode: "mini" | "realtime-oob" | "legacy";
  apiKey?: string;
  miniModel: string;
  oobModel?: string;
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
  telemetry: VerbatimCoachingTelemetry;
};

export async function createRehearsalVerbatimCoachingEvidence(input: {
  storage: Pick<StoragePort, "getObject">;
  storageKey: string;
  boundaries: readonly RehearsalUtteranceBoundary[];
  oobResults?: readonly RehearsalOobVerbatimResult[];
  pronunciationTerms?: readonly VerbatimPronunciationTerm[];
  runtime?: RehearsalVerbatimRuntimeOptions;
  extractClips?: typeof extractRehearsalUtteranceAudioClips;
  transcribe?: typeof transcribeMiniFillerUtterances;
}): Promise<RehearsalVerbatimCoachingEvidence> {
  const runtime = input.runtime;
  if (!runtime || runtime.mode === "legacy") {
    return emptyEvidence(legacyVerbatimCoachingSource);
  }

  const telemetry = buildTelemetry(
    runtime.mode === "realtime-oob" ? input.oobResults ?? [] : [],
  );
  const fillerOccurrences: FillerOccurrence[] = [];
  const disfluencyOccurrences: DisfluencyOccurrence[] = [];
  const completedUtteranceIds = new Set<string>();
  const boundariesById = new Map(
    input.boundaries.map((boundary) => [boundary.utteranceId, boundary]),
  );
  if (runtime.mode === "realtime-oob") {
    for (const transcription of collectAuthoritativeOobTranscripts(
      input.oobResults ?? [],
      boundariesById,
    )) {
      appendClassifiedOccurrences(
        transcription,
        fillerOccurrences,
        disfluencyOccurrences,
      );
      completedUtteranceIds.add(transcription.utteranceId);
    }
  }

  const fallbackBoundaries = input.boundaries.filter(
    (boundary) =>
      runtime.mode === "mini" ||
      !completedUtteranceIds.has(boundary.utteranceId),
  );
  let clips: Awaited<ReturnType<typeof extractRehearsalUtteranceAudioClips>> = [];
  if (runtime.apiKey && fallbackBoundaries.length > 0) {
    if (runtime.mode === "realtime-oob") {
      telemetry.miniFallbackUtterances = fallbackBoundaries.length;
    }
    try {
      const object = await input.storage.getObject(input.storageKey);
      clips = await (input.extractClips ?? extractRehearsalUtteranceAudioClips)({
        audio: object.body,
        boundaries: fallbackBoundaries,
      });
      const miniResults = await (
        input.transcribe ?? transcribeMiniFillerUtterances
      )({
        apiKey: runtime.apiKey,
        clips,
        fetcher: runtime.fetcher,
        model: runtime.miniModel,
        onEvent: runtime.onEvent,
        pronunciationTerms: input.pronunciationTerms,
      });
      for (const transcription of miniResults) {
        if (transcription.status !== "completed" || !transcription.transcript) {
          continue;
        }
        appendClassifiedOccurrences(
          transcription,
          fillerOccurrences,
          disfluencyOccurrences,
        );
        completedUtteranceIds.add(transcription.utteranceId);
      }
    } catch {
      // OOB evidence remains authoritative even when its mini fallback fails.
    } finally {
      for (const clip of clips) clip.audio.fill(0);
      clips.length = 0;
    }
  }

  const completedUtterances = completedUtteranceIds.size;
  const totalUtterances = input.boundaries.length;
  const state =
    totalUtterances > 0 && completedUtterances === totalUtterances
      ? "completed"
      : completedUtterances > 0
        ? "degraded"
        : "unavailable";
  return buildEvidence(
    sourceFor(runtime, state, completedUtterances, totalUtterances),
    fillerOccurrences,
    disfluencyOccurrences,
    telemetry,
  );
}

function buildEvidence(
  source: VerbatimCoachingSource,
  fillerOccurrences: FillerOccurrence[],
  disfluencyOccurrences: DisfluencyOccurrence[],
  telemetry: VerbatimCoachingTelemetry,
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
    telemetry,
  };
}

function appendClassifiedOccurrences(
  transcription: Pick<
    FillerVerbatimTranscriptionResult,
    "utteranceId" | "transcript" | "slideId"
  >,
  fillerOccurrences: FillerOccurrence[],
  disfluencyOccurrences: DisfluencyOccurrence[],
) {
  if (!transcription.transcript) return;
  const classified = classifyKoreanFillerUtterance({
    utteranceId: transcription.utteranceId,
    transcript: transcription.transcript,
    slideId: transcription.slideId,
  });
  fillerOccurrences.push(...classified.fillerOccurrences);
  disfluencyOccurrences.push(...classified.disfluencyOccurrences);
}

function collectAuthoritativeOobTranscripts(
  results: readonly RehearsalOobVerbatimResult[],
  boundariesById: ReadonlyMap<string, RehearsalUtteranceBoundary>,
): FillerVerbatimTranscriptionResult[] {
  const byUtterance = new Map<string, RehearsalOobVerbatimResult[]>();
  const seenResponseIds = new Set<string>();
  for (const result of results) {
    if (!boundariesById.has(result.utteranceId)) continue;
    if (result.responseId && seenResponseIds.has(result.responseId)) continue;
    if (result.responseId) seenResponseIds.add(result.responseId);
    const current = byUtterance.get(result.utteranceId) ?? [];
    current.push(result);
    byUtterance.set(result.utteranceId, current);
  }
  const transcriptions: FillerVerbatimTranscriptionResult[] = [];
  for (const [utteranceId, utteranceResults] of byUtterance) {
    if (
      utteranceResults.some((result) => result.status === "failed") ||
      !utteranceResults.some((result) => result.status === "completed")
    ) {
      continue;
    }
    const boundary = boundariesById.get(utteranceId);
    if (!boundary) continue;
    transcriptions.push({
      utteranceId,
      sequence: boundary.sequence,
      slideId: boundary.slideId,
      status: "completed",
      transcript: utteranceResults
        .filter(
          (result) => result.status === "completed" && result.transcript,
        )
        .sort((left, right) => left.fragmentSequence - right.fragmentSequence)
        .map((result) => result.transcript)
        .join(" "),
      errorCode: null,
    });
  }
  return transcriptions;
}

function buildTelemetry(
  results: readonly RehearsalOobVerbatimResult[],
): VerbatimCoachingTelemetry {
  return {
    oobAttemptedResponses: results.length,
    oobCompletedResponses: results.filter(
      (result) => result.status === "completed",
    ).length,
    oobFailedResponses: results.filter((result) => result.status === "failed")
      .length,
    oobTotalLatencyMs: results.reduce(
      (total, result) => total + result.latencyMs,
      0,
    ),
    oobMaxLatencyMs: results.reduce(
      (maximum, result) => Math.max(maximum, result.latencyMs),
      0,
    ),
    oobInputTokens: results.reduce(
      (total, result) => total + (result.inputTokens ?? 0),
      0,
    ),
    oobOutputTokens: results.reduce(
      (total, result) => total + (result.outputTokens ?? 0),
      0,
    ),
    miniFallbackUtterances: 0,
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
      runtime.mode === "realtime-oob"
        ? runtime.oobModel ?? "gpt-realtime-2.1"
        : runtime.miniModel,
    promptVersion:
      runtime.mode === "realtime-oob"
        ? koreanFillerVerbatimOobPromptVersion
        : koreanFillerVerbatimPromptVersion,
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
    telemetry: buildTelemetry([]),
  };
}
