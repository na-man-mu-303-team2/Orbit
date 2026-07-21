import { classifyKoreanFillerUtterance } from "@orbit/shared";
import type { LiveSttSpeechActivityEvent } from "./stt/liveSttPort";

export type ProvisionalFillerEvent = {
  utteranceId: string;
  kind: "lexical-filler-candidate" | "acoustic-hesitation-candidate";
  surface?: string;
  detectedAtMs: number;
  status: "provisional" | "retracted" | "confirmed";
};

type ActiveUtterance = {
  utteranceId: string;
  startedAtMs: number;
  hasScriptAlignedLexicalEvidence: boolean;
};

export type ProvisionalFillerDetector = {
  acceptSpeechActivity: (
    event: LiveSttSpeechActivityEvent,
    recordingAtMs: number,
  ) => ProvisionalFillerEvent[];
  acceptPartial: (input: {
    utteranceId?: string;
    transcript: string;
    detectedAtMs: number;
    hasScriptAlignedLexicalEvidence: boolean;
    scriptText?: string;
  }) => ProvisionalFillerEvent[];
  confirmVerbatim: (input: {
    utteranceId: string;
    transcript: string;
    detectedAtMs: number;
    scriptText?: string;
  }) => ProvisionalFillerEvent[];
  reset: () => void;
  snapshot: () => ProvisionalFillerEvent[];
};

const minimumAcousticHesitationMs = 350;
const maximumAcousticHesitationMs = 1_500;

export function hasScriptAlignedLexicalEvidence(
  transcript: string,
  scriptText: string,
) {
  const scriptTokens = new Set(tokenizeLexicalEvidence(scriptText));
  return tokenizeLexicalEvidence(transcript).some(
    (token) => token.length >= 2 && scriptTokens.has(token),
  );
}

export function createProvisionalFillerDetector(): ProvisionalFillerDetector {
  const events: ProvisionalFillerEvent[] = [];
  const utterances = new Map<string, ActiveUtterance>();
  let active: ActiveUtterance | null = null;

  function transition(
    event: ProvisionalFillerEvent,
    status: ProvisionalFillerEvent["status"],
    detectedAtMs: number,
  ) {
    if (event.status === status) return null;
    event.status = status;
    event.detectedAtMs = detectedAtMs;
    return { ...event };
  }

  function retractAcousticCandidate(
    utteranceId: string,
    detectedAtMs: number,
  ) {
    return events
      .filter(
        (event) =>
          event.utteranceId === utteranceId &&
          event.kind === "acoustic-hesitation-candidate" &&
          event.status === "provisional",
      )
      .map((event) => transition(event, "retracted", detectedAtMs))
      .filter((event): event is ProvisionalFillerEvent => event !== null);
  }

  return {
    acceptSpeechActivity: (event, recordingAtMs) => {
      if (event.type === "speech-started") {
        active = {
          utteranceId: event.utteranceId,
          startedAtMs: recordingAtMs,
          hasScriptAlignedLexicalEvidence: false,
        };
        utterances.set(event.utteranceId, active);
        return [];
      }
      if (event.type === "speech-fragment-committed") {
        return [];
      }
      if (!active || active.utteranceId !== event.utteranceId) {
        return [];
      }
      const durationMs = recordingAtMs - active.startedAtMs;
      const shouldEmit =
        event.reason === "silence" &&
        durationMs >= minimumAcousticHesitationMs &&
        durationMs <= maximumAcousticHesitationMs &&
        !active.hasScriptAlignedLexicalEvidence &&
        !events.some(
          (candidate) =>
            candidate.utteranceId === event.utteranceId &&
            candidate.kind === "lexical-filler-candidate" &&
            candidate.status !== "retracted",
        );
      active = null;
      if (!shouldEmit) return [];
      const candidate: ProvisionalFillerEvent = {
        utteranceId: event.utteranceId,
        kind: "acoustic-hesitation-candidate",
        detectedAtMs: recordingAtMs,
        status: "provisional",
      };
      events.push(candidate);
      return [{ ...candidate }];
    },
    acceptPartial: ({
      utteranceId,
      transcript,
      detectedAtMs,
      hasScriptAlignedLexicalEvidence,
      scriptText,
    }) => {
      const target = utteranceId
        ? utterances.get(utteranceId) ?? null
        : active;
      if (!target) return [];
      if (hasScriptAlignedLexicalEvidence) {
        target.hasScriptAlignedLexicalEvidence = true;
      }
      const changes = hasScriptAlignedLexicalEvidence
        ? retractAcousticCandidate(target.utteranceId, detectedAtMs)
        : [];
      const classified = classifyKoreanFillerUtterance({
        utteranceId: target.utteranceId,
        transcript,
        slideId: null,
        scriptText,
      });
      for (const occurrence of classified.fillerOccurrences) {
        if (!occurrence.evidenceKinds.includes("standalone-token")) continue;
        const duplicate = events.some(
          (event) =>
            event.utteranceId === target.utteranceId &&
            event.kind === "lexical-filler-candidate" &&
            event.surface?.normalize("NFC") === occurrence.surface.normalize("NFC") &&
            event.status !== "retracted",
        );
        if (duplicate) continue;
        const candidate: ProvisionalFillerEvent = {
          utteranceId: target.utteranceId,
          kind: "lexical-filler-candidate",
          surface: occurrence.surface,
          detectedAtMs,
          status: "provisional",
        };
        events.push(candidate);
        changes.push({ ...candidate });
      }
      return changes;
    },
    confirmVerbatim: ({ utteranceId, transcript, detectedAtMs, scriptText }) => {
      const classified = classifyKoreanFillerUtterance({
        utteranceId,
        transcript,
        slideId: null,
        scriptText,
      });
      const normalizedSurfaces = new Set(
        classified.fillerOccurrences.map((occurrence) =>
          occurrence.surface.normalize("NFC"),
        ),
      );
      const changes: ProvisionalFillerEvent[] = [];
      for (const event of events) {
        if (event.utteranceId !== utteranceId || event.status !== "provisional") {
          continue;
        }
        const confirmed =
          event.kind === "acoustic-hesitation-candidate"
            ? normalizedSurfaces.size > 0
            : Boolean(
                event.surface &&
                  normalizedSurfaces.has(event.surface.normalize("NFC")),
              );
        const changed = transition(
          event,
          confirmed ? "confirmed" : "retracted",
          detectedAtMs,
        );
        if (changed) changes.push(changed);
      }
      return changes;
    },
    reset: () => {
      events.length = 0;
      utterances.clear();
      active = null;
    },
    snapshot: () => events.map((event) => ({ ...event })),
  };
}

function tokenizeLexicalEvidence(value: string) {
  return value
    .normalize("NFC")
    .toLocaleLowerCase("ko-KR")
    .match(/[\p{L}\p{N}]+/gu) ?? [];
}
