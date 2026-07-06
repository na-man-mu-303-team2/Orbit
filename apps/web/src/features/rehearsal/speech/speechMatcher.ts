import { defaultSpeechTrackingConfig } from "./speechTrackingConfig";
import { normalizeSpeechText } from "./phraseExtractor";

export type PhraseMatchMethod = "substring" | "dice" | "none";

export type PhraseMatchResult = {
  matched: boolean;
  method: PhraseMatchMethod;
  score: number;
};

export type KeywordAliasInput = {
  keywordId: string;
  aliases: readonly string[];
  noteOccurrence?: number;
  text?: string;
};

export type KeywordAliasMatch = {
  keywordId: string;
  matchedAlias: string;
};

export function createFinalSegmentWindow(options: {
  previousFinalTranscript: string;
  latestFinalSegment: string;
  tailCharacters?: number;
}) {
  const tailCharacters =
    options.tailCharacters ?? defaultSpeechTrackingConfig.matchingTailCharacters;
  const previousTail = Array.from(options.previousFinalTranscript)
    .slice(-tailCharacters)
    .join("")
    .trim();
  return [previousTail, options.latestFinalSegment.trim()]
    .filter(Boolean)
    .join(" ");
}

export function matchPhraseCandidate(options: {
  candidateText: string;
  finalSegmentWindow: string;
  diceThreshold?: number;
}): PhraseMatchResult {
  const candidate = normalizeSpeechText(options.candidateText);
  const transcript = normalizeSpeechText(options.finalSegmentWindow);
  if (!candidate || !transcript) {
    return { matched: false, method: "none", score: 0 };
  }

  if (transcript.includes(candidate)) {
    return { matched: true, method: "substring", score: 1 };
  }

  const score = bestDiceScore(candidate, transcript);
  const threshold = options.diceThreshold ?? defaultSpeechTrackingConfig.diceThreshold;
  if (score >= threshold) {
    return { matched: true, method: "dice", score };
  }

  return { matched: false, method: "none", score: 0 };
}

export function matchKeywordAliases(options: {
  transcript: string;
  keywords: readonly KeywordAliasInput[];
}): KeywordAliasMatch[] {
  const normalizedTranscript = normalizeSpeechText(options.transcript);
  if (!normalizedTranscript) {
    return [];
  }

  const orderedKeywords = options.keywords
    .map((keyword, index) => ({ ...keyword, originalIndex: index }))
    .sort(compareKeywordAliasInputOrder);
  const aliasMatchCountCache = new Map<string, number>();

  const matches: KeywordAliasMatch[] = [];

  for (const keyword of orderedKeywords) {
    const aliases = keyword.aliases.map((alias) => alias.trim()).filter(Boolean);
    if (aliases.length === 0) {
      continue;
    }

    const matchedAlias = aliases.find((alias) => {
      const occurrenceCount = countAliasMatches(
        options.transcript,
        normalizedTranscript,
        alias,
        aliasMatchCountCache
      );

      if (keyword.noteOccurrence !== undefined) {
        return occurrenceCount > keyword.noteOccurrence;
      }

      if (occurrenceCount <= 0) {
        return false;
      }
      return true;
    });

    if (matchedAlias) {
      matches.push({ keywordId: keyword.keywordId, matchedAlias });
    }
  }

  return matches;
}

function compareKeywordAliasInputOrder(
  left: KeywordAliasInput & { originalIndex: number },
  right: KeywordAliasInput & { originalIndex: number }
) {
  const leftOccurrence = left.noteOccurrence ?? Number.MAX_SAFE_INTEGER;
  const rightOccurrence = right.noteOccurrence ?? Number.MAX_SAFE_INTEGER;

  if (leftOccurrence !== rightOccurrence) {
    return leftOccurrence - rightOccurrence;
  }

  return left.originalIndex - right.originalIndex;
}

function countAliasMatches(
  transcript: string,
  normalizedTranscript: string,
  alias: string,
  cache: Map<string, number>
) {
  const trimmedAlias = alias.trim();
  const normalizedAlias = normalizeSpeechText(trimmedAlias);
  if (!normalizedAlias) {
    return 0;
  }

  const cacheKey = requiresEnglishWordBoundary(trimmedAlias)
    ? `boundary:${trimmedAlias.toLocaleLowerCase("ko-KR")}`
    : `normalized:${normalizedAlias}`;
  const cached = cache.get(cacheKey);
  if (cached !== undefined) {
    return cached;
  }

  const count = requiresEnglishWordBoundary(trimmedAlias)
    ? countEnglishWordBoundaryMatches(transcript, trimmedAlias)
    : countSubstringOccurrences(normalizedTranscript, normalizedAlias);
  cache.set(cacheKey, count);
  return count;
}

export function calculateWordMultisetRecall(options: {
  scriptText: string;
  transcriptText: string;
}) {
  const scriptWords = tokenizeRecallWords(options.scriptText);
  if (scriptWords.length === 0) {
    return 0;
  }

  const transcriptCounts = countWords(tokenizeRecallWords(options.transcriptText));
  let matched = 0;

  for (const [word, scriptCount] of countWords(scriptWords).entries()) {
    matched += Math.min(scriptCount, transcriptCounts.get(word) ?? 0);
  }

  return matched / scriptWords.length;
}

function bestDiceScore(candidate: string, transcript: string) {
  const candidateLength = Array.from(candidate).length;
  const transcriptChars = Array.from(transcript);
  if (transcriptChars.length <= candidateLength + 2) {
    return diceCoefficient(candidate, transcript);
  }

  let best = 0;
  const minLength = Math.max(2, candidateLength - 2);
  const maxLength = candidateLength + 2;

  for (let start = 0; start < transcriptChars.length; start += 1) {
    for (let length = minLength; length <= maxLength; length += 1) {
      const window = transcriptChars.slice(start, start + length).join("");
      if (window.length < minLength) {
        continue;
      }
      best = Math.max(best, diceCoefficient(candidate, window));
    }
  }

  return best;
}

function diceCoefficient(left: string, right: string) {
  const leftBigrams = toBigramCounts(left);
  const rightBigrams = toBigramCounts(right);
  const leftTotal = sumCounts(leftBigrams);
  const rightTotal = sumCounts(rightBigrams);
  if (leftTotal === 0 || rightTotal === 0) {
    return left === right ? 1 : 0;
  }

  let overlap = 0;
  for (const [bigram, leftCount] of leftBigrams.entries()) {
    overlap += Math.min(leftCount, rightBigrams.get(bigram) ?? 0);
  }

  return (2 * overlap) / (leftTotal + rightTotal);
}

function toBigramCounts(value: string) {
  const chars = Array.from(value);
  const counts = new Map<string, number>();
  if (chars.length < 2) {
    counts.set(value, 1);
    return counts;
  }

  for (let index = 0; index < chars.length - 1; index += 1) {
    const bigram = `${chars[index]}${chars[index + 1]}`;
    counts.set(bigram, (counts.get(bigram) ?? 0) + 1);
  }

  return counts;
}

function sumCounts(counts: Map<string, number>) {
  return Array.from(counts.values()).reduce((sum, count) => sum + count, 0);
}

function requiresEnglishWordBoundary(alias: string) {
  return /^[A-Za-z]{1,2}$/.test(alias.trim());
}

function countEnglishWordBoundaryMatches(transcript: string, alias: string) {
  const escapedAlias = alias.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const matches = transcript.match(
    new RegExp(`(^|[^A-Za-z0-9])${escapedAlias}($|[^A-Za-z0-9])`, "gi")
  );
  return matches?.length ?? 0;
}

function countSubstringOccurrences(text: string, needle: string) {
  if (!needle) {
    return 0;
  }

  let count = 0;
  let cursor = 0;

  while (cursor <= text.length - needle.length) {
    const matchIndex = text.indexOf(needle, cursor);
    if (matchIndex === -1) {
      break;
    }

    count += 1;
    cursor = matchIndex + needle.length;
  }

  return count;
}

function tokenizeRecallWords(value: string) {
  return value
    .normalize("NFC")
    .replace(/[^\p{L}\p{N}+#.-]+/gu, " ")
    .split(/\s+/)
    .map((word) => normalizeSpeechText(word))
    .filter(Boolean);
}

function countWords(words: string[]) {
  const counts = new Map<string, number>();
  for (const word of words) {
    counts.set(word, (counts.get(word) ?? 0) + 1);
  }
  return counts;
}
