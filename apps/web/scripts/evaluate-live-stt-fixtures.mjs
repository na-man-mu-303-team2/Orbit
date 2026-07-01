#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const defaultFixturePath = "src/features/rehearsal/fixtures/live-stt-ko-evaluation.json";

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const fixturePath = resolve(args.fixtures ?? defaultFixturePath);
  const predictionPath = resolve(requireArg(args, "predictions"));
  const fixtures = JSON.parse(await readFile(fixturePath, "utf8"));
  const predictions = JSON.parse(await readFile(predictionPath, "utf8"));
  const summary = evaluateLiveSttPredictions(fixtures, predictions);

  console.log(JSON.stringify(summary, null, 2));
}

function evaluateLiveSttPredictions(fixtures, predictions) {
  const predictionsById = new Map(
    predictions.map((prediction) => [prediction.id, prediction])
  );
  let totalExpectedKeywords = 0;
  let totalMatchedKeywords = 0;
  let falseTriggerEligibleCount = 0;
  let falseTriggerCount = 0;
  const latencies = [];

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

function calculateCharacterErrorRate(reference, hypothesis) {
  const referenceChars = Array.from(normalizeCerText(reference));
  const hypothesisChars = Array.from(normalizeCerText(hypothesis));
  if (referenceChars.length === 0) {
    return hypothesisChars.length === 0 ? 0 : 1;
  }

  return levenshteinDistance(referenceChars, hypothesisChars) / referenceChars.length;
}

function hasKeywordMatch(keyword, prediction) {
  const normalizedKeyword = normalizeCerText(keyword);
  if (!normalizedKeyword) {
    return false;
  }

  if (
    (prediction.detectedKeywords ?? []).some(
      (detectedKeyword) => normalizeCerText(detectedKeyword) === normalizedKeyword
    )
  ) {
    return true;
  }

  return normalizeCerText(prediction.transcript).includes(normalizedKeyword);
}

function calculateLatencyMs(fixture, prediction) {
  if (
    fixture.segmentEndedAtMs === undefined ||
    prediction.transcriptAtMs === undefined
  ) {
    return null;
  }

  return Math.max(0, prediction.transcriptAtMs - fixture.segmentEndedAtMs);
}

function normalizeCerText(value) {
  return String(value)
    .toLocaleLowerCase("ko-KR")
    .replace(/[^\p{L}\p{N}%]+/gu, "");
}

function average(values) {
  if (values.length === 0) {
    return null;
  }

  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function levenshteinDistance(left, right) {
  if (left.join("") === right.join("")) {
    return 0;
  }

  let previous = Array.from({ length: right.length + 1 }, (_, index) => index);
  let current = new Array(right.length + 1);

  for (let leftIndex = 1; leftIndex <= left.length; leftIndex += 1) {
    current[0] = leftIndex;
    for (let rightIndex = 1; rightIndex <= right.length; rightIndex += 1) {
      const substitutionCost =
        left[leftIndex - 1] === right[rightIndex - 1] ? 0 : 1;
      current[rightIndex] = Math.min(
        previous[rightIndex] + 1,
        current[rightIndex - 1] + 1,
        previous[rightIndex - 1] + substitutionCost
      );
    }
    [previous, current] = [current, previous];
  }

  return previous[right.length] ?? 0;
}

function parseArgs(args) {
  const parsed = {};
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--") {
      continue;
    }

    if (!arg.startsWith("--")) {
      continue;
    }

    const key = arg.slice(2).replace(/-([a-z])/g, (_, letter) =>
      letter.toUpperCase()
    );
    const value = args[index + 1];
    if (!value || value.startsWith("--")) {
      throw new Error(`${arg} requires a value.`);
    }
    parsed[key] = value;
    index += 1;
  }

  return parsed;
}

function requireArg(args, key) {
  const value = args[key];
  if (!value) {
    throw new Error(`--${key} is required.`);
  }

  return value;
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
