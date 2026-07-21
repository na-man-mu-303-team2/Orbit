import type { Slide } from "@orbit/shared";

import { deriveKeywordOccurrences } from "../../../../../../packages/editor-core/src/index";
import {
  normalizeSpeechText,
  splitSpeakerNotesIntoSentences
} from "./phraseExtractor";

export type KeywordOccurrenceRuntimeMatch = {
  keywordId: string;
  occurrenceId: string;
  text: string;
  currentCharOffset: number;
};

export type KeywordOccurrenceRuntimeWindow = {
  beforeChars: number;
  afterChars: number;
};

const defaultOccurrenceTriggerWindow: KeywordOccurrenceRuntimeWindow = {
  beforeChars: 24,
  afterChars: 36
};

const defaultProgressConfidenceThreshold = 0.7;

export function matchKeywordOccurrenceTriggers(options: {
  slide: Pick<Slide, "slideId" | "speakerNotes" | "keywords">;
  targetOccurrenceIds: readonly string[];
  transcript: string;
  latestTranscript: string;
  confidence?: number | null;
  confirmedOccurrenceIds?: readonly string[];
  window?: KeywordOccurrenceRuntimeWindow;
}): KeywordOccurrenceRuntimeMatch[] {
  const confidence = options.confidence ?? 1;
  if (confidence < defaultProgressConfidenceThreshold) {
    return [];
  }

  const targetOccurrenceIds = new Set(options.targetOccurrenceIds);
  if (targetOccurrenceIds.size === 0) {
    return [];
  }

  const confirmedOccurrenceIds = new Set(options.confirmedOccurrenceIds ?? []);
  const currentCharOffset = estimateScriptProgressOffset(
    options.slide.speakerNotes,
    options.transcript
  );
  const window = options.window ?? defaultOccurrenceTriggerWindow;
  const latestTranscript = normalizeSpeechText(options.latestTranscript);

  return deriveKeywordOccurrences(options.slide).flatMap((occurrence) => {
    if (
      !targetOccurrenceIds.has(occurrence.occurrenceId) ||
      confirmedOccurrenceIds.has(occurrence.occurrenceId)
    ) {
      return [];
    }

    if (
      currentCharOffset < Math.max(0, occurrence.start - window.beforeChars) ||
      currentCharOffset > occurrence.end + window.afterChars
    ) {
      return [];
    }

    const keyword = options.slide.keywords.find(
      (candidate) => candidate.keywordId === occurrence.keywordId
    );
    if (!keyword || !doesTranscriptContainKeyword(latestTranscript, keyword)) {
      return [];
    }

    return [
      {
        keywordId: occurrence.keywordId,
        occurrenceId: occurrence.occurrenceId,
        text: occurrence.text,
        currentCharOffset
      }
    ];
  });
}

export function estimateScriptProgressOffset(
  speakerNotes: string,
  transcript: string
): number {
  const normalizedTranscript = normalizeSpeechText(transcript);
  if (!normalizedTranscript) {
    return 0;
  }

  let cursor = 0;
  let currentCharOffset = 0;

  for (const sentence of splitSpeakerNotesIntoSentences(speakerNotes)) {
    const start = speakerNotes.indexOf(sentence, cursor);
    if (start === -1) {
      continue;
    }

    const end = start + sentence.length;
    const matchedEnd = findMatchedSentencePrefixEnd({
      normalizedTranscript,
      sentence,
      sentenceStart: start
    });

    if (matchedEnd > currentCharOffset) {
      currentCharOffset = matchedEnd;
    }

    cursor = end;
  }

  return currentCharOffset;
}

function findMatchedSentencePrefixEnd(options: {
  normalizedTranscript: string;
  sentence: string;
  sentenceStart: number;
}): number {
  for (let end = options.sentence.length; end > 0; end -= 1) {
    const normalizedPrefix = normalizeSpeechText(options.sentence.slice(0, end));
    if (
      normalizedPrefix.length >= 2 &&
      options.normalizedTranscript.includes(normalizedPrefix)
    ) {
      return options.sentenceStart + end;
    }
  }

  return 0;
}

function doesTranscriptContainKeyword(
  normalizedTranscript: string,
  keyword: Pick<Slide["keywords"][number], "text" | "synonyms" | "abbreviations">
) {
  return [keyword.text, ...keyword.synonyms, ...keyword.abbreviations].some(
    (term) => {
      const normalizedTerm = normalizeSpeechText(term);
      return normalizedTerm && normalizedTranscript.includes(normalizedTerm);
    }
  );
}
