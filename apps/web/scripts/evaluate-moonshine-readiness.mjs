#!/usr/bin/env node
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, "../..", "..");
const evidenceRequirements = {
  qualityGate: "go",
  hosting: "pass",
  canary: "ok"
};

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const readiness = evaluateMoonshineReadiness({
    qualityGate: await readOptionalEvidence(args.qualityGate),
    hosting: await readOptionalEvidence(args.hosting),
    canary: await readOptionalEvidence(args.canary)
  });

  if (args.out) {
    await writeText(
      resolveFromRepo(args.out),
      `${JSON.stringify(readiness, null, 2)}\n`
    );
  }
  if (args.markdownOut) {
    await writeText(
      resolveFromRepo(args.markdownOut),
      renderMoonshineReadinessMarkdown(readiness)
    );
  }

  console.log(JSON.stringify(readiness, null, 2));
  if (readiness.status !== "ready") {
    process.exitCode = 1;
  }
}

export function evaluateMoonshineReadiness(evidence) {
  const checks = Object.fromEntries(
    Object.entries(evidenceRequirements).map(([name, requiredStatus]) => [
      name,
      evaluateEvidence(name, evidence?.[name] ?? null, requiredStatus)
    ])
  );
  const blockers = Object.entries(checks)
    .filter(([, check]) => check.status !== "pass")
    .map(([name, check]) =>
      check.status === "missing"
        ? `${name}: missing evidence`
        : `${name}: expected ${check.requiredStatus}, received ${
            check.actualStatus ?? "n/a"
          }`
    );

  return {
    generatedAt: new Date().toISOString(),
    status: blockers.length === 0 ? "ready" : "blocked",
    checks,
    blockers
  };
}

export function renderMoonshineReadinessMarkdown(readiness) {
  return [
    "# Moonshine Cutover Readiness",
    "",
    `Status: **${readiness.status}**`,
    "",
    ...renderBlockers(readiness.blockers),
    "| Evidence | Required | Actual | Result | Source |",
    "| --- | --- | --- | --- | --- |",
    ...Object.entries(readiness.checks).map(([name, check]) =>
      renderEvidenceRow(name, check)
    ),
    ""
  ].join("\n");
}

function evaluateEvidence(name, evidence, requiredStatus) {
  if (!evidence?.report) {
    return {
      status: "missing",
      requiredStatus,
      actualStatus: null,
      source: evidence?.source ?? null
    };
  }

  const actualStatus = evidence.report.status ?? null;
  return {
    status: actualStatus === requiredStatus ? "pass" : "fail",
    requiredStatus,
    actualStatus,
    source: evidence.source ?? null,
    summary: summarizeEvidence(name, evidence.report)
  };
}

function summarizeEvidence(name, report) {
  if (name === "qualityGate") {
    return {
      comparisons: Array.isArray(report.comparisons)
        ? report.comparisons.length
        : null,
      missingCriteria: Array.isArray(report.missingCriteria)
        ? report.missingCriteria
        : []
    };
  }

  if (name === "hosting") {
    return {
      baseUrl: report.baseUrl ?? null,
      assetCount: Array.isArray(report.assets) ? report.assets.length : null
    };
  }

  if (name === "canary") {
    return {
      segmentCount: report.segmentCount ?? null,
      zeroResultRate: report.zeroResultRate ?? null,
      nonEmptyResultRate: report.nonEmptyResultRate ?? null
    };
  }

  return null;
}

function renderBlockers(blockers) {
  if (!Array.isArray(blockers) || blockers.length === 0) {
    return [];
  }

  return ["Blockers:", "", ...blockers.map((blocker) => `- ${blocker}`), ""];
}

function renderEvidenceRow(name, check) {
  return [
    "|",
    name,
    "|",
    check.requiredStatus,
    "|",
    check.actualStatus ?? "n/a",
    "|",
    check.status,
    "|",
    check.source ?? "n/a",
    "|"
  ].join(" ");
}

async function readOptionalEvidence(path) {
  if (!path) {
    return null;
  }

  const resolvedPath = resolveFromRepo(path);
  return {
    source: path,
    report: JSON.parse(await readFile(resolvedPath, "utf8"))
  };
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

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
