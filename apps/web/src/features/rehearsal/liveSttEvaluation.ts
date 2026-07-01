import { normalizeLiveTranscriptText } from "./liveSttTextNormalization";

export type LiveSttEvaluationFixture = {
  id: string;
  referenceTranscript: string;
  expectedKeywords: string[];
  shouldTriggerControl: boolean;
  segmentEndedAtMs?: number;
};

export type LiveSttEvaluationPrediction = {
  id: string;
  transcript: string;
  detectedKeywords?: string[];
  triggeredControl?: boolean;
  transcriptAtMs?: number;
};

export type LiveSttEvaluationItem = {
  id: string;
  cer: number;
  matchedKeywords: string[];
  missingKeywords: string[];
  falseTrigger: boolean;
  latencyMs: number | null;
};

export type LiveSttEvaluationSummary = {
  itemCount: number;
  averageCer: number;
  keywordRecall: number;
  falseTriggerRate: number;
  averageLatencyMs: number | null;
  items: LiveSttEvaluationItem[];
};

export function evaluateLiveSttPredictions(
  fixtures: LiveSttEvaluationFixture[],
  predictions: LiveSttEvaluationPrediction[]
): LiveSttEvaluationSummary {
  const predictionsById = new Map(predictions.map((prediction) => [
    prediction.id,
    prediction
  ]));
  let totalExpectedKeywords = 0;
  let totalMatchedKeywords = 0;
  let falseTriggerEligibleCount = 0;
  let falseTriggerCount = 0;
  const latencies: number[] = [];

  const items = fixtures.map((fixture) => {
    const prediction = predictionsById.get(fixture.id) ?? {
      id: fixture.id,
      transcript: ""
    };
    const matchedKeywords = fixture.expectedKeywords.filter((keyword) =>
      hasKeywordMatch(keyword, prediction)
    );
    const missingKeywords = fixture.expectedKeywords.filter(
      (keyword) => !matchedKeywords.includes(keyword)
    );
    const falseTrigger = !fixture.shouldTriggerControl &&
      Boolean(prediction.triggeredControl);
    const latencyMs = calculateLatencyMs(fixture, prediction);

    totalExpectedKeywords += fixture.expectedKeywords.length;
    totalMatchedKeywords += matchedKeywords.length;
    if (!fixture.shouldTriggerControl) {
      falseTriggerEligibleCount += 1;
      if (falseTrigger) {
        falseTriggerCount += 1;
      }
    }
    if (latencyMs !== null) {
      latencies.push(latencyMs);
    }

    return {
      id: fixture.id,
      cer: calculateCharacterErrorRate(
        fixture.referenceTranscript,
        prediction.transcript
      ),
      matchedKeywords,
      missingKeywords,
      falseTrigger,
      latencyMs
    };
  });

  return {
    itemCount: items.length,
    averageCer: average(items.map((item) => item.cer)) ?? 0,
    keywordRecall:
      totalExpectedKeywords === 0
        ? 1
        : totalMatchedKeywords / totalExpectedKeywords,
    falseTriggerRate:
      falseTriggerEligibleCount === 0
        ? 0
        : falseTriggerCount / falseTriggerEligibleCount,
    averageLatencyMs: average(latencies),
    items
  };
}

export function calculateCharacterErrorRate(
  reference: string,
  hypothesis: string
) {
  const referenceChars = Array.from(normalizeCerText(reference));
  const hypothesisChars = Array.from(normalizeCerText(hypothesis));
  if (referenceChars.length === 0) {
    return hypothesisChars.length === 0 ? 0 : 1;
  }

  return levenshteinDistance(referenceChars, hypothesisChars) / referenceChars.length;
}

function hasKeywordMatch(
  keyword: string,
  prediction: LiveSttEvaluationPrediction
) {
  const normalizedKeyword = normalizeMatchText(keyword);
  if (!normalizedKeyword) {
    return false;
  }

  const detectedKeywords = prediction.detectedKeywords ?? [];
  if (
    detectedKeywords.some(
      (detectedKeyword) => normalizeMatchText(detectedKeyword) === normalizedKeyword
    )
  ) {
    return true;
  }

  return normalizeMatchText(prediction.transcript).includes(normalizedKeyword);
}

function calculateLatencyMs(
  fixture: LiveSttEvaluationFixture,
  prediction: LiveSttEvaluationPrediction
) {
  if (
    fixture.segmentEndedAtMs === undefined ||
    prediction.transcriptAtMs === undefined
  ) {
    return null;
  }

  return Math.max(0, prediction.transcriptAtMs - fixture.segmentEndedAtMs);
}

function normalizeCerText(value: string) {
  return value
    .toLocaleLowerCase("ko-KR")
    .replace(/[^\p{L}\p{N}%]+/gu, "");
}

function normalizeMatchText(value: string) {
  return normalizeLiveTranscriptText(value).replace(/[^\p{L}\p{N}%]+/gu, "");
}

function average(values: number[]) {
  if (values.length === 0) {
    return null;
  }

  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function levenshteinDistance(left: string[], right: string[]) {
  if (left.join("") === right.join("")) {
    return 0;
  }

  let previous = Array.from({ length: right.length + 1 }, (_, index) => index);
  let current = new Array<number>(right.length + 1);

  for (let leftIndex = 1; leftIndex <= left.length; leftIndex += 1) {
    current[0] = leftIndex;
    for (let rightIndex = 1; rightIndex <= right.length; rightIndex += 1) {
      const substitutionCost =
        left[leftIndex - 1] === right[rightIndex - 1] ? 0 : 1;
      current[rightIndex] = Math.min(
        previous[rightIndex]! + 1,
        current[rightIndex - 1]! + 1,
        previous[rightIndex - 1]! + substitutionCost
      );
    }
    [previous, current] = [current, previous];
  }

  return previous[right.length] ?? 0;
}
