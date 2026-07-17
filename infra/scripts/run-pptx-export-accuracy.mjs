import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { createRequire } from "node:module";

const root = path.resolve(import.meta.dirname, "../..");
const worker = path.join(root, "services/python-worker");
const prepareScript = path.join(
  root,
  "tools/pptx-accuracy/prepare_deck_pptx_export_accuracy.py",
);
const scoreScript = path.join(
  root,
  "tools/pptx-accuracy/score_deck_pptx_export_accuracy.py",
);
const defaultBaseline = path.join(
  root,
  "tools/pptx-accuracy/baselines/export-fidelity-baseline.json",
);
const e2eSpec = "tests/e2e/pptx-konva-accuracy.spec.ts";
const options = parseArgs(process.argv.slice(2));
const selectedBaseline = options.baseline ?? defaultBaseline;
const sessionRoot = path.join(
  root,
  "tmp/pptx-export-accuracy",
  `session-${Date.now()}-${process.pid}`,
);
const port = Number(process.env.PPTX_EXPORT_ACCURACY_PORT ?? "41739");
const baseURL = `http://127.0.0.1:${port}`;
let webServer = null;

try {
  const preflight = await runPreflight();
  console.log(JSON.stringify(preflight, null, 2));
  if (options.preflight) {
    process.exitCode = preflight.ready ? 0 : 2;
  } else if (!preflight.ready) {
    console.error(
      `PPTX export accuracy preflight failed: ${preflight.missing.join(", ")}`,
    );
    process.exitCode = 2;
  } else {
    fs.mkdirSync(sessionRoot, { recursive: true });
    if (!options.skipBuild) {
      await runChecked("pnpm", ["--filter", "@orbit/shared", "build"], {
        cwd: root,
      });
      await runChecked("pnpm", ["--filter", "@orbit/editor-core", "build"], {
        cwd: root,
      });
    }
    webServer = await ensureWebServer();

    const reports = [];
    for (let index = 1; index <= options.runs; index += 1) {
      const runDir = path.join(sessionRoot, `run-${index}`);
      await runPython(prepareScript, ["--run-dir", runDir]);
      const manifestPath = path.join(runDir, "manifest.json");
      const playwrightOutput = path.join(runDir, "playwright-output");
      await runChecked(
        process.execPath,
        [
          "infra/scripts/run-playwright-test.mjs",
          e2eSpec,
          "--workers=1",
          `--output=${path.relative(root, playwrightOutput)}`,
          "--reporter=list",
        ],
        {
          cwd: root,
          env: {
            ...process.env,
            PLAYWRIGHT_BASE_URL: baseURL,
            PLAYWRIGHT_BLOB_OUTPUT_DIR: path.join(
              runDir,
              "playwright-blob-report",
            ),
            PLAYWRIGHT_HTML_REPORT: path.join(runDir, "playwright-report"),
            PLAYWRIGHT_JSON_OUTPUT_NAME: path.join(
              runDir,
              "playwright-report.json",
            ),
            PLAYWRIGHT_JUNIT_OUTPUT_NAME: path.join(
              runDir,
              "playwright-report.xml",
            ),
            PPTX_EXPORT_ACCURACY_MANIFEST: path.relative(root, manifestPath),
          },
        },
      );
      const scoreArgs = ["--run-dir", runDir];
      if (options.reportOnly) {
        scoreArgs.push("--report-only");
      } else {
        scoreArgs.push("--baseline", selectedBaseline);
      }
      await runPython(scoreScript, scoreArgs);
      reports.push(
        JSON.parse(
          fs.readFileSync(
            path.join(runDir, "pptx-export-accuracy-report.json"),
            "utf8",
          ),
        ),
      );
    }

    const determinism = compareRuns(reports);
    fs.writeFileSync(
      path.join(sessionRoot, "determinism-report.json"),
      `${JSON.stringify(determinism, null, 2)}\n`,
      "utf8",
    );
    console.log(JSON.stringify(determinism, null, 2));
    if (!determinism.passed) process.exitCode = 2;
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 2;
} finally {
  if (webServer) stopServer(webServer.child);
}

function parseArgs(args) {
  const parsed = {
    baseline: null,
    preflight: false,
    reportOnly: false,
    runs: 2,
    skipBuild: false,
  };
  for (let index = 0; index < args.length; index += 1) {
    const value = args[index];
    if (value === "--preflight") {
      parsed.preflight = true;
      continue;
    }
    if (value === "--skip-build") {
      parsed.skipBuild = true;
      continue;
    }
    if (value === "--report-only") {
      parsed.reportOnly = true;
      continue;
    }
    if (value === "--baseline") {
      const baseline = args[index + 1];
      if (!baseline) throw new Error("--baseline requires a report JSON path");
      parsed.baseline = path.resolve(root, baseline);
      index += 1;
      continue;
    }
    if (value === "--runs") {
      parsed.runs = Number(args[index + 1]);
      index += 1;
      continue;
    }
    throw new Error(`unknown argument: ${value}`);
  }
  if (!Number.isInteger(parsed.runs) || parsed.runs < 2) {
    throw new Error("--runs must be an integer of at least 2");
  }
  if (parsed.reportOnly && parsed.baseline) {
    throw new Error("--report-only and --baseline are mutually exclusive");
  }
  return parsed;
}

async function runPreflight() {
  const missing = [];
  if (!options.reportOnly) {
    const baselineProblem = validateApprovedBaseline(selectedBaseline);
    if (baselineProblem) missing.push(baselineProblem);
  }
  for (const command of ["node", "pnpm", "uv"]) {
    const probe = spawnSync(command, ["--version"], {
      cwd: root,
      encoding: "utf8",
    });
    if (probe.error || probe.status !== 0) missing.push(`command:${command}`);
  }
  const require = createRequire(import.meta.url);
  try {
    require.resolve("@playwright/test/cli");
  } catch {
    missing.push("node-package:@playwright/test");
  }

  let python = null;
  if (!missing.includes("command:uv")) {
    const probe = spawnSync(
      "uv",
      ["run", "python", prepareScript, "--preflight"],
      { cwd: worker, encoding: "utf8" },
    );
    if (probe.status === 0) {
      try {
        python = JSON.parse(probe.stdout);
        missing.push(...python.missing);
      } catch {
        missing.push("python-preflight:invalid-json");
      }
    } else {
      missing.push("python-preflight:uv-run-failed");
      python = {
        code: "PPTX_EXPORT_ACCURACY_PREFLIGHT_UNAVAILABLE",
        message: (probe.stderr || probe.stdout).trim(),
      };
    }
  }
  return {
    code: "PPTX_EXPORT_ACCURACY_RUNNER_PREFLIGHT",
    ready: missing.length === 0,
    missing: [...new Set(missing)].sort(),
    python,
    mode: options.reportOnly ? "report-only" : "baseline-delta",
    baselinePath: options.reportOnly
      ? null
      : path.relative(root, selectedBaseline),
    outputRoot: "tmp/pptx-export-accuracy",
  };
}

function validateApprovedBaseline(baselinePath) {
  const label = path.relative(root, baselinePath) || baselinePath;
  if (!fs.existsSync(baselinePath)) return `baseline:${label}`;
  try {
    const payload = JSON.parse(fs.readFileSync(baselinePath, "utf8"));
    if (
      payload.kind !== "deck-pptx-export-baseline" ||
      payload.schemaVersion !== 2 ||
      payload.approval?.method !== "two-run-deterministic-report-review" ||
      !Number.isInteger(payload.approval?.runCount) ||
      payload.approval.runCount < 2
    ) {
      return `baseline-contract:${label}`;
    }
  } catch {
    return `baseline-contract:${label}`;
  }
  return null;
}

async function ensureWebServer() {
  if (await isReachable(baseURL)) {
    throw new Error(
      `dedicated accuracy server port is already in use: ${baseURL}`,
    );
  }
  const output = [];
  const child = spawn(
    "pnpm",
    [
      "--filter",
      "@orbit/web",
      "dev",
      "--host",
      "127.0.0.1",
      "--port",
      String(port),
      "--strictPort",
    ],
    {
      cwd: root,
      env: process.env,
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  for (const stream of [child.stdout, child.stderr]) {
    stream?.on("data", (chunk) => {
      output.push(String(chunk));
      if (output.length > 40) output.shift();
    });
  }
  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      throw new Error(
        `web server exited before readiness (${child.exitCode})\n${output.join("")}`,
      );
    }
    if (await isReachable(baseURL)) return { child };
    await delay(250);
  }
  stopServer(child);
  throw new Error(
    `web server was not ready within 60 seconds\n${output.join("")}`,
  );
}

async function isReachable(url) {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(1_000) });
    return response.ok;
  } catch {
    return false;
  }
}

function runPython(script, args) {
  return runChecked("uv", ["run", "python", script, ...args], { cwd: worker });
}

function runChecked(command, args, options) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      ...options,
      env: options.env ?? process.env,
      stdio: "inherit",
    });
    child.once("error", reject);
    child.once("exit", (code, signal) => {
      if (code === 0) {
        resolve();
      } else {
        reject(
          new Error(
            `${command} ${args.join(" ")} failed (${signal ?? `exit ${code}`})`,
          ),
        );
      }
    });
  });
}

function compareRuns(reports) {
  const first = reports[0];
  const checks = [];
  for (let index = 1; index < reports.length; index += 1) {
    const report = reports[index];
    checks.push(
      {
        code: "DETERMINISTIC_ARTIFACT_CHECKSUM",
        run: index + 1,
        expected: first.artifactChecksums.aggregateSha256,
        actual: report.artifactChecksums.aggregateSha256,
        passed:
          first.artifactChecksums.aggregateSha256 ===
          report.artifactChecksums.aggregateSha256,
      },
      {
        code: "DETERMINISTIC_SCORE_CHECKSUM",
        run: index + 1,
        expected: first.determinismChecksum,
        actual: report.determinismChecksum,
        passed: first.determinismChecksum === report.determinismChecksum,
      },
      {
        code: "DETERMINISTIC_METRICS",
        run: index + 1,
        expected: first.metrics,
        actual: report.metrics,
        passed:
          JSON.stringify(first.metrics) === JSON.stringify(report.metrics),
      },
    );
  }
  return {
    code: "PPTX_EXPORT_ACCURACY_DETERMINISM",
    runCount: reports.length,
    passed: checks.every((check) => check.passed),
    checks,
    sessionPath: path.relative(root, sessionRoot),
  };
}

function stopServer(child) {
  if (child && child.exitCode === null) child.kill("SIGTERM");
}

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}
