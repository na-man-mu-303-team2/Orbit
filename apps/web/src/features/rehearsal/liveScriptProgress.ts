import type { Slide } from "@orbit/shared";

const sentenceMatchThreshold = 0.8;

export type LiveScriptSentenceProgress = {
  text: string;
  coverage: number;
  matched: boolean;
  isLastSentence: boolean;
};

export type LiveScriptProgressAnalysis = {
  slideId: string;
  transcript: string;
  coverage: number;
  lastSentenceMatched: boolean;
  sentences: LiveScriptSentenceProgress[];
};

export function evaluateLiveScriptProgress(
  slide: Slide,
  transcript: string
): LiveScriptProgressAnalysis {
  const sentences = extractScriptSentences(slide.speakerNotes);
  const normalizedTranscript = normalizeScriptProgressText(transcript);
  const totalLength = sentences.reduce(
    (sum, sentence) => sum + normalizeScriptProgressText(sentence).length,
    0
  );

  const evaluatedSentences = sentences.map((sentence, index) => {
    const normalizedSentence = normalizeScriptProgressText(sentence);
    const coverage = calculateSentenceCoverage(
      normalizedTranscript,
      normalizedSentence,
      extractScriptTokens(sentence)
    );

    return {
      text: sentence,
      coverage,
      matched: coverage >= sentenceMatchThreshold,
      isLastSentence: index === sentences.length - 1
    };
  });

  const coveredLength = evaluatedSentences.reduce((sum, sentence) => {
    return sum + normalizeScriptProgressText(sentence.text).length * sentence.coverage;
  }, 0);
  const lastSentenceMatched =
    evaluatedSentences[evaluatedSentences.length - 1]?.matched ?? false;

  return {
    slideId: slide.slideId,
    transcript,
    coverage:
      totalLength === 0 ? 0 : clampScriptCoverage(coveredLength / totalLength),
    lastSentenceMatched,
    sentences: evaluatedSentences
  };
}

function calculateSentenceCoverage(
  normalizedTranscript: string,
  normalizedSentence: string,
  tokens: string[]
) {
  if (!normalizedTranscript || !normalizedSentence) {
    return 0;
  }

  if (normalizedTranscript.includes(normalizedSentence)) {
    return 1;
  }

  const uniqueTokens = Array.from(new Set(tokens));
  const totalTokenLength = uniqueTokens.reduce((sum, token) => sum + token.length, 0);
  if (totalTokenLength === 0) {
    return 0;
  }

  const matchedTokenLength = uniqueTokens.reduce((sum, token) => {
    return normalizedTranscript.includes(token) ? sum + token.length : sum;
  }, 0);

  return clampScriptCoverage(matchedTokenLength / totalTokenLength);
}

function extractScriptSentences(speakerNotes: string) {
  return speakerNotes
    .split(/[\n.!?。！？]+/u)
    .map((sentence) => sentence.trim())
    .filter(Boolean);
}

function extractScriptTokens(sentence: string) {
  return sentence
    .split(/[^\p{L}\p{N}+#-]+/u)
    .map(normalizeScriptProgressText)
    .filter(Boolean);
}

function normalizeScriptProgressText(value: string) {
  return value
    .toLocaleLowerCase("ko-KR")
    .normalize("NFC")
    .replace(/[^\p{L}\p{N}]+/gu, "")
    .trim();
}

function clampScriptCoverage(value: number) {
  return Math.min(1, Math.max(0, value));
}
