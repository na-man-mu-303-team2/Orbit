import type { LiveSttPartialTranscriptEvent } from "@orbit/shared";
import type { LiveSttBiasTerm } from "./liveStt";

export type RehearsalCommandDefinition = {
  action: string;
  phrases: string[];
  cue?: string;
};

export type RehearsalCommandCandidate = {
  action: string;
  phrase: string;
  normalizedTranscript: string;
  isFinal: boolean;
  confidence?: number;
  matchedAt: number;
  cue?: string;
};

export type RehearsalCommandConfirmationState = {
  previousCandidate: RehearsalCommandCandidate | null;
};

export const defaultRehearsalCommandConfig: RehearsalCommandDefinition[] = [
  {
    action: "advance-slide",
    phrases: ["다음 슬라이드", "다음으로", "넘어가"]
  },
  {
    action: "animation-cue",
    cue: "emphasis",
    phrases: ["강조", "강조해", "하이라이트"]
  }
];

const defaultPartialConfirmationWindowMs = 1_600;

export function createRehearsalCommandConfirmationState(): RehearsalCommandConfirmationState {
  return {
    previousCandidate: null
  };
}

export function getRehearsalCommandBiasTerms(
  config: RehearsalCommandDefinition[] = defaultRehearsalCommandConfig
): LiveSttBiasTerm[] {
  return config.flatMap((command) =>
    command.phrases.map((phrase) => ({
      text: phrase,
      source: "control-phrase" as const,
      weight: 0.88,
      canonicalText: phrase
    }))
  );
}

export function detectRehearsalCommandCandidate(
  event: Pick<
    LiveSttPartialTranscriptEvent,
    "transcript" | "isFinal" | "confidence"
  >,
  options: {
    config?: RehearsalCommandDefinition[];
    now?: () => number;
  } = {}
): RehearsalCommandCandidate | null {
  const normalizedTranscript = normalizeRehearsalCommandTranscript(
    event.transcript
  );
  if (!normalizedTranscript) {
    return null;
  }

  const segments = createCommandSegments(event.transcript);
  if (segments.length === 0) {
    return null;
  }

  const config = options.config ?? defaultRehearsalCommandConfig;
  for (const command of config) {
    for (const phrase of command.phrases) {
      const normalizedPhrase = normalizeRehearsalCommandPhrase(phrase);
      if (
        normalizedPhrase &&
        segments.some((segment) => segment.compact === normalizedPhrase)
      ) {
        return {
          action: command.action,
          phrase,
          normalizedTranscript,
          isFinal: event.isFinal,
          confidence: event.confidence ?? undefined,
          matchedAt: options.now?.() ?? Date.now(),
          cue: command.cue
        };
      }
    }
  }

  return null;
}

export function confirmRehearsalCommandCandidate(
  state: RehearsalCommandConfirmationState,
  candidate: RehearsalCommandCandidate | null,
  options: {
    partialConfirmationWindowMs?: number;
  } = {}
) {
  if (!candidate) {
    return null;
  }

  if (candidate.isFinal) {
    state.previousCandidate = null;
    return candidate;
  }

  const previous = state.previousCandidate;
  state.previousCandidate = candidate;
  if (!previous || !isSameCommandCandidate(previous, candidate)) {
    return null;
  }

  const confirmationWindowMs =
    options.partialConfirmationWindowMs ?? defaultPartialConfirmationWindowMs;
  return candidate.matchedAt - previous.matchedAt <= confirmationWindowMs
    ? candidate
    : null;
}

export function normalizeRehearsalCommandTranscript(value: string) {
  return value
    .toLocaleLowerCase("ko-KR")
    .replace(/[!"#$%&'()*+,\-./:;<=>?@[\\\]^_`{|}~·•…，。！？、]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function createCommandSegments(value: string) {
  return value
    .split(/[\n\r.!?。！？,，、;；:：]+/)
    .map(normalizeRehearsalCommandTranscript)
    .filter(Boolean)
    .map((segment) => ({
      text: segment,
      compact: removeCommandWhitespace(segment)
    }));
}

function normalizeRehearsalCommandPhrase(value: string) {
  return removeCommandWhitespace(normalizeRehearsalCommandTranscript(value));
}

function removeCommandWhitespace(value: string) {
  return value.replace(/\s+/g, "");
}

function isSameCommandCandidate(
  previous: RehearsalCommandCandidate,
  candidate: RehearsalCommandCandidate
) {
  return (
    previous.action === candidate.action &&
    previous.phrase === candidate.phrase &&
    previous.cue === candidate.cue
  );
}
