#!/usr/bin/env node
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, "../..", "..");
const workerLogPrefix = "[orbit-live-stt-worker]";
const numericFields = [
  "segmentSamples",
  "segmentDurationMs",
  "transcribeMs",
  "realtimeFactor",
  "resultLength",
  "audioMaxAbs",
  "audioRms"
];

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const logPath = resolveFromRepo(requireArg(args, "log"));
  const report = summarizeMoonshineCanaryDebugLog(await readFile(logPath, "utf8"));

  if (args.out) {
    await writeText(
      resolveFromRepo(args.out),
      `${JSON.stringify(report, null, 2)}\n`
    );
  }

  console.log(JSON.stringify(report, null, 2));
  if (report.status !== "ok") {
    process.exitCode = 1;
  }
}

export function summarizeMoonshineCanaryDebugLog(logText) {
  const segments = parseMoonshineWorkerMetrics(logText);
  if (segments.length === 0) {
    return {
      status: "empty",
      segmentCount: 0,
      zeroResultCount: 0,
      zeroResultRate: 0,
      nonEmptyResultRate: 0,
      sequenceIdRange: null
    };
  }

  const zeroResultCount = segments.filter((segment) => segment.resultLength === 0).length;
  const sortedSequenceIds = segments
    .map((segment) => segment.sequenceId)
    .filter((sequenceId) => Number.isFinite(sequenceId))
    .sort((left, right) => left - right);
  const report = {
    status: "ok",
    segmentCount: segments.length,
    zeroResultCount,
    zeroResultRate: round(zeroResultCount / segments.length),
    nonEmptyResultRate: round((segments.length - zeroResultCount) / segments.length),
    sequenceIdRange:
      sortedSequenceIds.length === 0
        ? null
        : {
            first: sortedSequenceIds[0],
            last: sortedSequenceIds[sortedSequenceIds.length - 1]
          }
  };

  for (const field of numericFields) {
    report[field] = summarizeNumbers(
      segments
        .map((segment) => segment[field])
        .filter((value) => Number.isFinite(value))
    );
  }

  return report;
}

export function parseMoonshineWorkerMetrics(logText) {
  const metrics = [];
  for (const line of String(logText).split(/\r?\n/)) {
    const parsed = parseMoonshineWorkerMetricLine(line);
    if (parsed) {
      metrics.push(parsed);
    }
  }

  return metrics;
}

function parseMoonshineWorkerMetricLine(line) {
  const text = String(line).trim();
  if (!text.includes(workerLogPrefix)) {
    return null;
  }

  const jsonStart = text.indexOf("{");
  if (jsonStart === -1) {
    return null;
  }

  try {
    const parsed = JSON.parse(text.slice(jsonStart));
    if (!Number.isFinite(parsed.sequenceId)) {
      return null;
    }

    return parsed;
  } catch {
    return null;
  }
}

function summarizeNumbers(values) {
  if (values.length === 0) {
    return null;
  }

  const sorted = [...values].sort((left, right) => left - right);
  return {
    min: round(sorted[0]),
    avg: round(values.reduce((sum, value) => sum + value, 0) / values.length),
    p50: round(percentile(sorted, 0.5)),
    p95: round(percentile(sorted, 0.95)),
    max: round(sorted[sorted.length - 1])
  };
}

function percentile(sortedValues, percentileValue) {
  if (sortedValues.length === 1) {
    return sortedValues[0];
  }

  const index = Math.ceil(sortedValues.length * percentileValue) - 1;
  return sortedValues[Math.min(Math.max(index, 0), sortedValues.length - 1)];
}

function round(value) {
  return Math.round(value * 1000) / 1000;
}

async function writeText(path, value) {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, value);
}

function resolveFromRepo(path) {
  return isAbsolute(path) ? path : resolve(repoRoot, path);
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
    const argName = key.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`);
    throw new Error(`--${argName} is required.`);
  }

  return value;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
