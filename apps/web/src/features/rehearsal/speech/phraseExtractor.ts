import {
  defaultSpeechTrackingConfig,
  mergeSpeechTrackingConfig,
  type SpeechTrackingConfig,
  type SpeechTrackingConfigOverride
} from "./speechTrackingConfig";
import type { ExtractedSentence, PhraseCandidate } from "./speechTrackingEvents";

export type PhraseExtractorOptions = SpeechTrackingConfigOverride & {
  controlPhrases?: readonly string[];
  keywordTerms?: readonly string[];
};

export type PhraseExtractor = {
  extract: (speakerNotes: string) => ExtractedSentence[];
};

type CandidateDraft = Omit<PhraseCandidate, "candidateId"> & {
  sentenceIndex: number;
  baseScore: number;
};

export function createDefaultPhraseExtractor(
  options: PhraseExtractorOptions = {}
): PhraseExtractor {
  const config = mergeSpeechTrackingConfig(options);
  const controlPhraseKeys = new Set(
    (options.controlPhrases ?? [])
      .map((phrase) => normalizeSpeechText(phrase))
      .filter(Boolean)
  );
  const keywordKeys = new Set(
    (options.keywordTerms ?? [])
      .map((phrase) => normalizeSpeechText(phrase))
      .filter(Boolean)
  );

  return {
    extract(speakerNotes) {
      const sentenceTexts = splitSpeakerNotesIntoSentences(speakerNotes);
      const pools = sentenceTexts.map((sentence, sentenceIndex) =>
        buildCandidatePool({
          sentence,
          sentenceIndex,
          config,
          controlPhraseKeys,
          keywordKeys
        })
      );
      const selected = selectDistinctCandidates(pools, config);

      return sentenceTexts.map((sentence, sentenceIndex) => {
        const isFinalTrigger = sentenceIndex === sentenceTexts.length - 1;
        const candidates = (selected[sentenceIndex] ?? []).map(
          (candidate, candidateIndex) => ({
            ...candidate,
            candidateId: `sentence_${sentenceIndex + 1}_phrase_${candidateIndex + 1}`
          })
        );

        return {
          sentenceId: `sentence_${sentenceIndex + 1}`,
          text: sentence,
          index: sentenceIndex,
          isFinalTrigger,
          matchable: candidates.length > 0,
          candidates
        };
      });
    }
  };
}

export function splitSpeakerNotesIntoSentences(speakerNotes: string): string[] {
  const normalized = speakerNotes
    .normalize("NFC")
    .replace(/\r\n?/g, "\n")
    .replace(/…+/g, "…")
    .trim();

  if (!normalized) {
    return [];
  }

  const sentences: string[] = [];
  let current = "";

  for (let index = 0; index < normalized.length; index += 1) {
    const char = normalized[index] ?? "";
    current += char;

    if (!isSentenceBoundary(normalized, index)) {
      continue;
    }

    addSentence(sentences, current);
    current = "";
  }

  addSentence(sentences, current);
  return sentences;
}

export function normalizeSpeechText(
  value: string,
  config: Pick<SpeechTrackingConfig, "particleStopwords"> = defaultSpeechTrackingConfig
): string {
  return tokenizeWords(value)
    .map((word) => stripKoreanParticle(word, config))
    .join("")
    .normalize("NFC")
    .toLocaleLowerCase("ko-KR");
}

export function stripKoreanParticle(
  value: string,
  config: Pick<SpeechTrackingConfig, "particleStopwords"> = defaultSpeechTrackingConfig
): string {
  const normalized = normalizeToken(value);
  const stopwords = [...config.particleStopwords].sort(
    (left, right) => right.length - left.length
  );

  for (const particle of stopwords) {
    if (!normalized.endsWith(particle)) {
      continue;
    }

    const stem = normalized.slice(0, -particle.length);
    if (countMeaningfulStemCharacters(stem) >= 2) {
      return stem;
    }
  }

  return normalized;
}

function buildCandidatePool(options: {
  sentence: string;
  sentenceIndex: number;
  config: SpeechTrackingConfig;
  controlPhraseKeys: ReadonlySet<string>;
  keywordKeys: ReadonlySet<string>;
}): CandidateDraft[] {
  const words = tokenizeWords(options.sentence);
  const drafts: CandidateDraft[] = [];

  // 2~4어절 n-gram을 만든 뒤, P3-D15 필터와 P3-D17 점수화를 적용한다.
  for (let start = 0; start < words.length; start += 1) {
    for (let size = 2; size <= 4; size += 1) {
      const end = start + size;
      if (end > words.length) {
        continue;
      }

      const candidateWords = words.slice(start, end);
      const text = candidateWords.join(" ");
      const normalizedText = normalizeSpeechText(text, options.config);

      if (
        shouldFilterCandidate({
          text,
          normalizedText,
          words: candidateWords,
          config: options.config,
          controlPhraseKeys: options.controlPhraseKeys
        })
      ) {
        continue;
      }

      const baseScore = scoreCandidate({
        words: candidateWords,
        normalizedText,
        keywordKeys: options.keywordKeys,
        config: options.config
      });

      drafts.push({
        sentenceIndex: options.sentenceIndex,
        text,
        normalizedText,
        score: baseScore,
        baseScore,
        wordCount: candidateWords.length,
        startWordIndex: start,
        endWordIndex: end - 1
      });
    }
  }

  return drafts.sort(compareCandidateDrafts);
}

function selectDistinctCandidates(
  pools: CandidateDraft[][],
  config: SpeechTrackingConfig
): CandidateDraft[][] {
  const selected = pools.map((pool) =>
    pickTopCandidates(pool, config)
  );
  let changed = true;
  let guard = 0;

  while (changed && guard < 20) {
    changed = false;
    guard += 1;
    const removals = new Map<number, Set<string>>();

    for (let leftIndex = 0; leftIndex < selected.length; leftIndex += 1) {
      for (let rightIndex = leftIndex + 1; rightIndex < selected.length; rightIndex += 1) {
        for (const left of selected[leftIndex] ?? []) {
          for (const right of pools[rightIndex] ?? []) {
            if (!hasCandidateConflict(left, right)) {
              continue;
            }

            changed = true;
            const finalIndex = selected.length - 1;
            if (rightIndex === finalIndex) {
              markRemoval(removals, leftIndex, left.normalizedText);
            } else if (leftIndex === finalIndex) {
              markRemoval(removals, rightIndex, right.normalizedText);
            } else {
              markRemoval(removals, leftIndex, left.normalizedText);
              markRemoval(removals, rightIndex, right.normalizedText);
            }
          }
        }

        for (const right of selected[rightIndex] ?? []) {
          for (const left of pools[leftIndex] ?? []) {
            if (!hasCandidateConflict(left, right)) {
              continue;
            }

            changed = true;
            const finalIndex = selected.length - 1;
            if (rightIndex === finalIndex) {
              markRemoval(removals, leftIndex, left.normalizedText);
            } else if (leftIndex === finalIndex) {
              markRemoval(removals, rightIndex, right.normalizedText);
            } else {
              markRemoval(removals, leftIndex, left.normalizedText);
              markRemoval(removals, rightIndex, right.normalizedText);
            }
          }
        }
      }
    }

    if (!changed) {
      break;
    }

    for (const [sentenceIndex, normalizedTexts] of removals.entries()) {
      const blocked = new Set(normalizedTexts);
      selected[sentenceIndex] = pickTopCandidates(
        pools[sentenceIndex].filter((candidate) => !blocked.has(candidate.normalizedText)),
        config
      );
      pools[sentenceIndex] = pools[sentenceIndex].filter(
        (candidate) => !blocked.has(candidate.normalizedText)
      );
    }
  }

  return selected;
}

function pickTopCandidates(
  pool: CandidateDraft[],
  config: SpeechTrackingConfig
): CandidateDraft[] {
  const selected: CandidateDraft[] = [];

  for (const candidate of pool) {
    const hasDistinctPosition = selected.every(
      (picked) =>
        candidate.endWordIndex < picked.startWordIndex ||
        candidate.startWordIndex > picked.endWordIndex
    );
    const next = {
      ...candidate,
      score:
        candidate.baseScore +
        (hasDistinctPosition
          ? config.candidateScoring.positionDiversityBonus
          : 0)
    };

    selected.push(next);
    selected.sort(compareCandidateDrafts);
    if (selected.length > config.phraseCandidateLimit) {
      selected.pop();
    }
  }

  return selected.sort(compareCandidateDrafts);
}

function shouldFilterCandidate(options: {
  text: string;
  normalizedText: string;
  words: string[];
  config: SpeechTrackingConfig;
  controlPhraseKeys: ReadonlySet<string>;
}) {
  const strippedWords = options.words.map((word) =>
    stripKoreanParticle(word, options.config)
  );
  const discourseLeadWords = new Set([
    "첫",
    "첫번째",
    "두번째",
    "세번째",
    "마지막",
    "문장"
  ]);

  if (strippedWords.filter(Boolean).length < 2) {
    return true;
  }

  if (discourseLeadWords.has(strippedWords[0] ?? "")) {
    return true;
  }

  if (!/[A-Za-z0-9\u3131-\uD79D]/.test(options.normalizedText)) {
    return true;
  }

  if (strippedWords.every((word) => countMeaningfulStemCharacters(word) <= 1)) {
    return true;
  }

  const stopwordKeys = new Set(
    options.config.particleStopwords.map((word) => normalizeSpeechText(word, options.config))
  );
  if (strippedWords.every((word) => stopwordKeys.has(normalizeSpeechText(word, options.config)))) {
    return true;
  }

  const blacklistKeys = options.config.commonPhraseBlacklist.map((phrase) =>
    normalizeSpeechText(phrase, options.config)
  );
  if (
    blacklistKeys.some(
      (phrase) =>
        phrase &&
        (options.normalizedText === phrase ||
          options.normalizedText.includes(phrase) ||
          phrase.includes(options.normalizedText))
    )
  ) {
    return true;
  }

  return Array.from(options.controlPhraseKeys).some(
    (phrase) =>
      phrase &&
      (options.normalizedText === phrase ||
        options.normalizedText.includes(phrase) ||
        phrase.includes(options.normalizedText))
  );
}

function scoreCandidate(options: {
  words: string[];
  normalizedText: string;
  keywordKeys: ReadonlySet<string>;
  config: SpeechTrackingConfig;
}) {
  let score = 0;
  const scoring = options.config.candidateScoring;
  const hasKeywordOrNumericToken =
    options.words.some((word) => /\d/.test(word) || /[A-Z][A-Za-z0-9]+/.test(word)) ||
    Array.from(options.keywordKeys).some(
      (keyword) =>
        keyword &&
        (options.normalizedText.includes(keyword) ||
          keyword.includes(options.normalizedText))
    );

  if (hasKeywordOrNumericToken) {
    score += scoring.keywordOrNumericTokenBonus;
  }

  if (options.words.length >= 3 && options.words.length <= 4) {
    score += scoring.preferredWordCountBonus;
  }

  const averageLength =
    options.words.reduce(
      (sum, word) => sum + countMeaningfulStemCharacters(stripKoreanParticle(word, options.config)),
      0
    ) / options.words.length;
  if (averageLength >= 2) {
    score += scoring.averageSyllableLengthBonus;
  }

  return score;
}

function hasCandidateConflict(left: CandidateDraft, right: CandidateDraft) {
  return (
    left.normalizedText === right.normalizedText ||
    left.normalizedText.includes(right.normalizedText) ||
    right.normalizedText.includes(left.normalizedText)
  );
}

function markRemoval(
  removals: Map<number, Set<string>>,
  sentenceIndex: number,
  normalizedText: string
) {
  const current = removals.get(sentenceIndex) ?? new Set<string>();
  current.add(normalizedText);
  removals.set(sentenceIndex, current);
}

function compareCandidateDrafts(left: CandidateDraft, right: CandidateDraft) {
  const scoreDelta = right.score - left.score;
  if (scoreDelta !== 0) {
    return scoreDelta;
  }

  const lengthDelta = left.wordCount - right.wordCount;
  if (lengthDelta !== 0) {
    return lengthDelta;
  }

  return left.startWordIndex - right.startWordIndex;
}

function isSentenceBoundary(text: string, index: number) {
  const char = text[index] ?? "";
  const next = text[index + 1] ?? "";
  const previous = text[index - 1] ?? "";

  if (char === "\n") {
    return true;
  }

  if (char === "." && /\d/.test(previous) && /\d/.test(next)) {
    return false;
  }

  return /[.!?。！？…]/.test(char);
}

function addSentence(sentences: string[], rawSentence: string) {
  const sentence = rawSentence
    .replace(/[.!?。！？…]+$/g, "")
    .replace(/\s+/g, " ")
    .trim();
  if (sentence) {
    sentences.push(sentence);
  }
}

function tokenizeWords(value: string) {
  return value
    .normalize("NFC")
    .replace(/[^\p{L}\p{N}+#.-]+/gu, " ")
    .split(/\s+/)
    .map(normalizeToken)
    .filter(Boolean);
}

function normalizeToken(value: string) {
  return value
    .normalize("NFC")
    .replace(/^[^\p{L}\p{N}+#.-]+|[^\p{L}\p{N}+#.-]+$/gu, "")
    .trim();
}

function countMeaningfulStemCharacters(value: string) {
  return Array.from(value).filter((char) => /[A-Za-z0-9\u3131-\uD79D]/.test(char))
    .length;
}
