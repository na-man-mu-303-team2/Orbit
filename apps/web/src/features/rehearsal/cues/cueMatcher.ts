import type { SpeechCueAction } from "@orbit/shared";
import type { LiveSttResult } from "../stt/liveSttPort";
import { defaultSpeechTrackingConfig } from "../speech/speechTrackingConfig";
import {
  createFinalSegmentWindow,
  matchPhraseCandidate,
  type PhraseMatchMethod
} from "../speech/speechMatcher";
import type { RuntimeSpeechCue } from "./cueProvider";

export type CueMatch = {
  action: SpeechCueAction;
  atMs: number;
  cueId: string;
  matchedPhrase: string;
  method: Exclude<PhraseMatchMethod, "none">;
  score: number;
  slideId: string;
};

export type CueMatcher = {
  acceptResult: (
    result: Pick<LiveSttResult, "text" | "isFinal" | "timestampMs">,
    cues: readonly RuntimeSpeechCue[]
  ) => CueMatch[];
  reset: () => void;
};

export function createCueMatcher(options: {
  diceThreshold?: number;
  tailCharacters?: number;
} = {}): CueMatcher {
  const diceThreshold =
    options.diceThreshold ?? defaultSpeechTrackingConfig.diceThreshold;
  const tailCharacters =
    options.tailCharacters ?? defaultSpeechTrackingConfig.matchingTailCharacters;
  let previousFinalTranscript = "";

  function acceptResult(
    result: Pick<LiveSttResult, "text" | "isFinal" | "timestampMs">,
    cues: readonly RuntimeSpeechCue[]
  ): CueMatch[] {
    if (!result.isFinal) {
      return [];
    }

    const finalSegmentWindow = createFinalSegmentWindow({
      previousFinalTranscript,
      latestFinalSegment: result.text,
      tailCharacters
    });
    previousFinalTranscript = appendTranscript(previousFinalTranscript, result.text);

    const matches: CueMatch[] = [];
    for (const cue of cues) {
      const match = matchCue(cue, finalSegmentWindow, diceThreshold);
      if (match) {
        matches.push({
          action: cue.action,
          atMs: result.timestampMs[1],
          cueId: cue.cueId,
          matchedPhrase: match.phrase,
          method: match.method,
          score: match.score,
          slideId: cue.slideId
        });
      }
    }

    return matches;
  }

  return {
    acceptResult,
    reset: () => {
      previousFinalTranscript = "";
    }
  };
}

function matchCue(
  cue: RuntimeSpeechCue,
  finalSegmentWindow: string,
  diceThreshold: number
) {
  for (const phrase of cue.trigger.phrases) {
    const result = matchPhraseCandidate({
      candidateText: phrase,
      finalSegmentWindow,
      diceThreshold
    });

    if (result.matched) {
      return {
        phrase,
        method: result.method as Exclude<PhraseMatchMethod, "none">,
        score: result.score
      };
    }
  }

  return null;
}

function appendTranscript(current: string, next: string) {
  return [current.trim(), next.trim()].filter(Boolean).join(" ");
}
