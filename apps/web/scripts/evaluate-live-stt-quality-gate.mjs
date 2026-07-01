#!/usr/bin/env node
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, "../..", "..");

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const candidatePath = resolveFromRepo(requireArg(args, "candidate"));
  const baselinePath = args.baseline ? resolveFromRepo(args.baseline) : null;
  const candidateReport = await readJson(candidatePath);
  const baselineReport = baselinePath ? await readJson(baselinePath) : null;
  const gate = evaluateQualityGate({
    candidateReport,
    baselineReport,
    thresholds: {
      minKeywordRecall: parseOptionalNumber(args.minKeywordRecall),
      maxFalseTriggerRate: parseOptionalNumber(args.maxFalseTriggerRate),
      maxAverageLatencyMs: parseOptionalNumber(args.maxAverageLatencyMs)
    }
  });

  if (args.out) {
    await writeText(
      resolveFromRepo(args.out),
      `${JSON.stringify(gate, null, 2)}\n`
    );
  }
  if (args.markdownOut) {
    await writeText(resolveFromRepo(args.markdownOut), renderMarkdownGate(gate));
  }

  console.log(JSON.stringify(gate, null, 2));
  if (gate.status !== "go") {
    process.exitCode = 1;
  }
}

export function evaluateQualityGate(options) {
  const candidateResults = extractResults(options.candidateReport, "candidate");
  const baselineResults = options.baselineReport
    ? extractResults(options.baselineReport, "baseline")
    : [];
  const missingCriteria = getMissingCriteria({
    candidateReport: options.candidateReport,
    baselineReport: options.baselineReport,
    baselineResults,
    thresholds: options.thresholds
  });

  if (missingCriteria.length > 0) {
    return {
      status: "blocked",
      reason: formatBlockedReason(missingCriteria),
      missingCriteria,
      candidate: candidateResults[0] ?? null,
      baseline: baselineResults[0] ?? null,
      comparisons: []
    };
  }

  const comparisons = candidateResults.map((candidate) => {
    const baseline = findBaselineForCandidate(candidate, baselineResults);
    return evaluateCandidate(candidate, baseline, options.thresholds);
  });
  const status =
    comparisons.length > 0 &&
    comparisons.every((comparison) => comparison.status === "go")
      ? "go"
      : "no-go";

  return {
    status,
    candidate: comparisons[0]?.candidate ?? candidateResults[0] ?? null,
    baseline: comparisons[0]?.baseline ?? baselineResults[0] ?? null,
    gates: comparisons[0]?.gates ?? {},
    comparisons
  };
}

function formatBlockedReason(missingCriteria) {
  if (missingCriteria.includes("humanAudioSource")) {
    return "A non-synthetic human rehearsal audio candidate report is required before Moonshine can pass the cutover gate.";
  }
  if (missingCriteria.includes("matchingFixturePath")) {
    return "Moonshine candidate and sherpa baseline reports must use the same fixture path before comparison.";
  }
  if (missingCriteria.includes("matchingAudioSource")) {
    return "Moonshine candidate and sherpa baseline reports must use the same audio source before comparison.";
  }

  return "A sherpa baseline or explicit absolute thresholds are required before Moonshine can pass the cutover gate.";
}

function evaluateCandidate(candidate, baseline, thresholds) {
  const gates = {
    keywordRecall: {
      actual: candidate.summary?.keywordRecall ?? null,
      minimum: thresholds.minKeywordRecall ?? baseline?.summary?.keywordRecall,
      passed:
        candidate.status === "succeeded" &&
        isAtLeast(
          candidate.summary?.keywordRecall,
          thresholds.minKeywordRecall ?? baseline?.summary?.keywordRecall
        )
    },
    falseTriggerRate: {
      actual: candidate.summary?.falseTriggerRate ?? null,
      maximum:
        thresholds.maxFalseTriggerRate ?? baseline?.summary?.falseTriggerRate,
      passed:
        candidate.status === "succeeded" &&
        isAtMost(
          candidate.summary?.falseTriggerRate,
          thresholds.maxFalseTriggerRate ?? baseline?.summary?.falseTriggerRate
        )
    },
    averageLatencyMs: {
      actual: candidate.summary?.averageLatencyMs ?? null,
      maximum:
        thresholds.maxAverageLatencyMs ?? baseline?.summary?.averageLatencyMs,
      passed:
        candidate.status === "succeeded" &&
        isAtMost(
          candidate.summary?.averageLatencyMs,
          thresholds.maxAverageLatencyMs ?? baseline?.summary?.averageLatencyMs
        )
    }
  };
  const status = Object.values(gates).every((gate) => gate.passed)
    ? "go"
    : "no-go";

  return {
    status,
    candidate,
    baseline,
    gates
  };
}

function getMissingCriteria(options) {
  const baseline = options.baselineResults[0];
  const hasBaselineMetric = (key) => isFiniteNumber(baseline?.summary?.[key]);
  const missing = [];
  if (!isHumanAudioCandidateReport(options.candidateReport)) {
    missing.push("humanAudioSource");
  }
  if (
    options.baselineReport &&
    normalizeOptionalString(options.candidateReport?.fixturePath) !==
      normalizeOptionalString(options.baselineReport?.fixturePath)
  ) {
    missing.push("matchingFixturePath");
  }
  if (
    options.baselineReport &&
    normalizeOptionalString(options.candidateReport?.audioSource) !==
      normalizeOptionalString(options.baselineReport?.audioSource)
  ) {
    missing.push("matchingAudioSource");
  }
  if (
    !isFiniteNumber(options.thresholds.minKeywordRecall) &&
    !hasBaselineMetric("keywordRecall")
  ) {
    missing.push("keywordRecall");
  }
  if (
    !isFiniteNumber(options.thresholds.maxFalseTriggerRate) &&
    !hasBaselineMetric("falseTriggerRate")
  ) {
    missing.push("falseTriggerRate");
  }
  if (
    !isFiniteNumber(options.thresholds.maxAverageLatencyMs) &&
    !hasBaselineMetric("averageLatencyMs")
  ) {
    missing.push("averageLatencyMs");
  }

  return missing;
}

function isHumanAudioCandidateReport(report) {
  if (report?.audioInput && typeof report.audioInput === "object") {
    return report.audioInput.kind === "human-wav";
  }

  return isHumanAudioSource(report?.audioSource);
}

function isHumanAudioSource(audioSource) {
  const value = String(audioSource ?? "").toLowerCase();
  if (!value) {
    return false;
  }
  if (
    value.includes("synthetic") ||
    value.includes("macos say") ||
    value.includes("say voice")
  ) {
    return false;
  }

  return true;
}

function normalizeOptionalString(value) {
  return String(value ?? "").trim();
}

function extractResults(report, role) {
  const results = Array.isArray(report?.results) ? report.results : [];
  return results.map((result) => ({
    role,
    engine: result.engine ?? report.engine ?? inferEngine(report.modelId),
    modelId: result.modelId ?? report.modelId ?? "unknown",
    device: result.device ?? "unknown",
    status: result.status ?? "unknown",
    modelLoadMs: result.modelLoadMs ?? null,
    summary: result.summary ?? null
  }));
}

function findBaselineForCandidate(candidate, baselineResults) {
  return (
    baselineResults.find((baseline) => baseline.device === candidate.device) ??
    baselineResults[0] ??
    null
  );
}

function renderMarkdownGate(gate) {
  const rows = [];
  if (gate.baseline) {
    rows.push(renderMarkdownRow("Sherpa baseline", gate.baseline));
  }
  for (const comparison of gate.comparisons ?? []) {
    rows.push(renderMarkdownRow("Moonshine candidate", comparison.candidate));
  }

  return [
    `# Live STT Quality Gate`,
    "",
    `Status: **${gate.status}**`,
    "",
    ...renderMarkdownBlockers(gate),
    "| Role | Engine | Device | Keyword recall | False trigger | Avg latency |",
    "| --- | --- | --- | ---: | ---: | ---: |",
    ...rows,
    ""
  ].join("\n");
}

function renderMarkdownBlockers(gate) {
  const lines = [];
  if (gate.reason) {
    lines.push(`Reason: ${gate.reason}`, "");
  }
  if (Array.isArray(gate.missingCriteria) && gate.missingCriteria.length > 0) {
    lines.push("Missing criteria:", "");
    for (const criterion of gate.missingCriteria) {
      lines.push(`- \`${criterion}\``);
    }
    lines.push("");
  }

  return lines;
}

function renderMarkdownRow(role, result) {
  return [
    "|",
    role,
    "|",
    result.engine,
    "|",
    result.device,
    "|",
    formatMetric(result.summary?.keywordRecall),
    "|",
    formatMetric(result.summary?.falseTriggerRate),
    "|",
    formatMetric(result.summary?.averageLatencyMs, " ms"),
    "|"
  ].join(" ");
}

function isAtLeast(actual, minimum) {
  return isFiniteNumber(actual) && isFiniteNumber(minimum) && actual >= minimum;
}

function isAtMost(actual, maximum) {
  return isFiniteNumber(actual) && isFiniteNumber(maximum) && actual <= maximum;
}

function isFiniteNumber(value) {
  return typeof value === "number" && Number.isFinite(value);
}

function parseOptionalNumber(value) {
  if (value === undefined) {
    return undefined;
  }

  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    throw new Error(`Expected a finite number, received "${value}".`);
  }
  return parsed;
}

function formatMetric(value, suffix = "") {
  return isFiniteNumber(value) ? `${Number(value.toFixed(3))}${suffix}` : "n/a";
}

function inferEngine(modelId) {
  const value = String(modelId ?? "").toLowerCase();
  if (value.includes("moonshine")) {
    return "moonshine";
  }
  if (value.includes("sherpa")) {
    return "sherpa";
  }

  return "unknown";
}

async function readJson(path) {
  return JSON.parse(await readFile(path, "utf8"));
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
