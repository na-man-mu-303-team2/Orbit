#!/usr/bin/env node
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import {
  assertUsableLiveSttFixtures,
  buildLiveSttFixtureSet
} from "./live-stt-fixture-utils.mjs";

const defaultFixturePath = "src/features/rehearsal/fixtures/live-stt-ko-evaluation.json";

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const fixturePath = resolve(args.fixtures ?? defaultFixturePath);
  const predictionPath = resolve(requireArg(args, "predictions"));
  const fixtures = JSON.parse(await readFile(fixturePath, "utf8"));
  assertUsableLiveSttFixtures(fixtures);
  const predictions = JSON.parse(await readFile(predictionPath, "utf8"));
  const summary = evaluateLiveSttPredictions(fixtures, predictions);
  if (args.out) {
    requireReportArg(args, "audio-source");
    await writeText(
      resolve(args.out),
      `${JSON.stringify(
        buildLiveSttEvaluationReport({
          args,
          fixturePath,
          predictionPath,
          fixtureSet: buildLiveSttFixtureSet(fixtures),
          summary
        }),
        null,
        2
      )}\n`
    );
  }

  console.log(JSON.stringify(summary, null, 2));
}

export function buildLiveSttEvaluationReport(options) {
  const engine = options.args.engine ?? "manual";
  return {
    generatedAt: new Date().toISOString(),
    engine,
    modelId: options.args.modelId ?? engine,
    fixturePath: options.fixturePath,
    fixtureSet: options.fixtureSet,
    predictionPath: options.predictionPath,
    audioSource: options.args.audioSource,
    results: [
      {
        engine,
        device: options.args.device ?? "manual",
        status: "succeeded",
        modelLoadMs: parseOptionalNumber(options.args.modelLoadMs),
        summary: options.summary
      }
    ]
  };
}

export function evaluateLiveSttPredictions(fixtures, predictions) {
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

export function calculateCharacterErrorRate(reference, hypothesis) {
  const referenceChars = Array.from(normalizeCerText(reference));
  const hypothesisChars = Array.from(normalizeCerText(hypothesis));
  if (referenceChars.length === 0) {
    return hypothesisChars.length === 0 ? 0 : 1;
  }

  return levenshteinDistance(referenceChars, hypothesisChars) / referenceChars.length;
}

function hasKeywordMatch(keyword, prediction) {
  const normalizedKeyword = normalizeMatchText(keyword);
  if (!normalizedKeyword) {
    return false;
  }

  if (
    (prediction.detectedKeywords ?? []).some(
      (detectedKeyword) => normalizeMatchText(detectedKeyword) === normalizedKeyword
    )
  ) {
    return true;
  }

  return normalizeMatchText(prediction.transcript).includes(normalizedKeyword);
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

function normalizeMatchText(value) {
  return normalizeKoreanNumberWords(
    String(value).toLocaleLowerCase("ko-KR").replace(/\s+/g, "").trim()
  ).replace(/[^\p{L}\p{N}%]+/gu, "");
}

const koreanNumberWordValues = {
  영: 0,
  공: 0,
  일: 1,
  이: 2,
  삼: 3,
  사: 4,
  오: 5,
  육: 6,
  칠: 7,
  팔: 8,
  구: 9
};
const koreanNumberWordPattern = /[영공일이삼사오육칠팔구십]+/g;
const koreanPercentNumberWordPattern = /([영공일이삼사오육칠팔구십]+)(프로|퍼센트)/g;

function normalizeKoreanNumberWords(value) {
  const withPercent = value.replace(
    koreanPercentNumberWordPattern,
    (match, word) => {
      const parsed = parseKoreanNumberWord(word);
      return parsed === null ? match : `${parsed}%`;
    }
  );

  return withPercent.replace(koreanNumberWordPattern, (word) => {
    const parsed = parseKoreanNumberWord(word);
    if (parsed === null || !shouldNormalizeStandaloneKoreanNumberWord(word)) {
      return word;
    }

    return `${parsed}`;
  });
}

function shouldNormalizeStandaloneKoreanNumberWord(word) {
  return word.includes("십");
}

function parseKoreanNumberWord(word) {
  if (word.length === 0) {
    return null;
  }

  if (word === "영" || word === "공") {
    return 0;
  }

  const tenIndex = word.indexOf("십");
  if (tenIndex === -1) {
    return koreanNumberWordValues[word] ?? null;
  }
  if (word.indexOf("십", tenIndex + 1) !== -1) {
    return null;
  }

  const tensWord = word.slice(0, tenIndex);
  const onesWord = word.slice(tenIndex + 1);
  const tens = tensWord === "" ? 1 : koreanNumberWordValues[tensWord];
  const ones = onesWord === "" ? 0 : koreanNumberWordValues[onesWord];
  if (tens === undefined || ones === undefined || tens === 0) {
    return null;
  }

  return tens * 10 + ones;
}

function average(values) {
  if (values.length === 0) {
    return null;
  }

  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function parseOptionalNumber(value) {
  if (value === undefined) {
    return null;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function requireReportArg(args, key) {
  const parsedKey = toCamelCase(key);
  const value = args[parsedKey];
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`--${key} is required when --out is used.`);
  }

  args[parsedKey] = value.trim();
}

async function writeText(path, value) {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, value);
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

    const key = toCamelCase(arg.slice(2));
    const value = args[index + 1];
    if (!value || value.startsWith("--")) {
      throw new Error(`${arg} requires a value.`);
    }
    parsed[key] = value;
    index += 1;
  }

  return parsed;
}

function toCamelCase(value) {
  return value.replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
}

function requireArg(args, key) {
  const value = args[key];
  if (!value) {
    throw new Error(`--${key} is required.`);
  }

  return value;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
