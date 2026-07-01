#!/usr/bin/env node
import { chromium } from "@playwright/test";
import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { evaluateLiveSttPredictions } from "./evaluate-live-stt-fixtures.mjs";
import {
  buildSherpaMeasurementReport,
  summarizeSherpaMeasurementReport
} from "./sherpa-measurement-report.mjs";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const webRoot = resolve(scriptDir, "..");
const repoRoot = resolve(webRoot, "../..");
const defaultFixturePath = join(
  webRoot,
  "src/features/rehearsal/fixtures/live-stt-ko-evaluation.json"
);
const defaultOutPath = join(repoRoot, "docs/spikes/sherpa-korean-asr-baseline.json");
const defaultModelId = "sherpa-onnx-streaming-zipformer-korean-2024-06-16";

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const fixturesPath = resolvePathFromRepo(args.fixtures ?? defaultFixturePath);
  const outPath = resolvePathFromRepo(args.out ?? defaultOutPath);
  const voice = args.voice ?? "Yuna";
  const keepAudio = args.keepAudio === "1" || args.keepAudio === "true";
  const fixtures = JSON.parse(await readFile(fixturesPath, "utf8"));
  const tempDir = await mkdtemp(join(tmpdir(), "orbit-sherpa-eval-"));

  let viteProcess = null;
  let browser = null;
  try {
    const audioById = await prepareAudioById(fixtures, {
      voice,
      tempDir,
      audioDir: args.audioDir ? resolvePathFromRepo(args.audioDir) : null
    });
    const port = Number(args.port ?? (await findFreePort()));
    viteProcess = await startVite(port);
    browser = await chromium.launch();
    const page = await browser.newPage();
    page.on("console", (message) => {
      if (message.type() === "error") {
        console.error(`[browser] ${message.text()}`);
      }
    });
    await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: "domcontentloaded" });

    const startedAt = Date.now();
    const results = [];
    try {
      const measurement = await evaluateSherpaInBrowser(page, {
        fixtures,
        audioById,
        manifestUrl: args.manifestUrl,
        decodeBatchDurationMs: parseOptionalNumber(args.decodeBatchDurationMs)
      });
      const predictions = measurement.predictions.map((prediction) => ({
        id: prediction.id,
        transcript: prediction.transcript,
        triggeredControl: prediction.triggeredControl,
        transcriptAtMs: prediction.transcriptAtMs,
        transcribeMs: prediction.transcribeMs,
        audioDurationMs: prediction.audioDurationMs,
        sampleRate: prediction.sampleRate
      }));
      const latencyFixtures = fixtures.map((fixture) => ({
        ...fixture,
        segmentEndedAtMs: 0
      }));
      results.push({
        engine: "sherpa",
        modelId: measurement.modelId,
        device: measurement.device,
        status: "succeeded",
        elapsedMs: Date.now() - startedAt,
        modelLoadMs: measurement.modelLoadMs,
        predictions,
        summary: evaluateLiveSttPredictions(latencyFixtures, predictions)
      });
    } catch (error) {
      results.push({
        engine: "sherpa",
        modelId: defaultModelId,
        device: "wasm",
        status: "failed",
        elapsedMs: Date.now() - startedAt,
        error: error instanceof Error ? error.message : String(error)
      });
    }

    const report = buildSherpaMeasurementReport({
      modelId: results[0]?.modelId ?? defaultModelId,
      fixturePath: fixturesPath,
      audioDir: args.audioDir ? resolvePathFromRepo(args.audioDir) : null,
      audioSource: args.audioSource,
      voice,
      repoRoot,
      results
    });
    await mkdir(dirname(outPath), { recursive: true });
    await writeFile(outPath, `${JSON.stringify(report, null, 2)}\n`);
    console.log(JSON.stringify(summarizeSherpaMeasurementReport(report), null, 2));
    console.log(`Wrote sherpa measurement report to ${outPath}`);
  } finally {
    await browser?.close();
    viteProcess?.kill("SIGTERM");
    if (!keepAudio) {
      await rm(tempDir, { recursive: true, force: true });
    } else {
      console.log(`Kept generated audio fixtures at ${tempDir}`);
    }
  }
}

async function evaluateSherpaInBrowser(page, payload) {
  let lastError = null;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      return await page.evaluate(async (nextPayload) => {
        const module = await import(
          "/src/features/rehearsal/sherpaBrowserEvaluation.ts"
        );
        return module.runSherpaBrowserEvaluation(nextPayload);
      }, payload);
    } catch (error) {
      lastError = error;
      const message = error instanceof Error ? error.message : String(error);
      if (!message.includes("Execution context was destroyed")) {
        throw error;
      }
      await page.waitForLoadState("domcontentloaded");
    }
  }

  throw lastError;
}

async function prepareAudioById(fixtures, options) {
  const audioById = {};
  for (const fixture of fixtures) {
    const wavPath = options.audioDir
      ? join(options.audioDir, `${fixture.id}.wav`)
      : await synthesizeFixtureAudio(fixture, options);
    audioById[fixture.id] = (await readFile(wavPath)).toString("base64");
  }

  return audioById;
}

async function synthesizeFixtureAudio(fixture, options) {
  const aiffPath = join(options.tempDir, `${fixture.id}.aiff`);
  const wavPath = join(options.tempDir, `${fixture.id}.wav`);
  await runCommand("say", [
    "-v",
    options.voice,
    "-o",
    aiffPath,
    fixture.referenceTranscript
  ]);
  await runCommand("afconvert", [
    "-f",
    "WAVE",
    "-d",
    "LEI16@16000",
    aiffPath,
    wavPath
  ]);
  return wavPath;
}

async function startVite(port) {
  const child = spawn("corepack", ["pnpm", "--filter", "@orbit/web", "dev"], {
    cwd: repoRoot,
    env: {
      ...process.env,
      APP_ENV: process.env.APP_ENV ?? "development",
      API_BASE_URL: process.env.API_BASE_URL ?? "http://127.0.0.1:3000",
      WEB_PORT: String(port)
    },
    stdio: ["ignore", "pipe", "pipe"]
  });

  child.stdout.on("data", (chunk) => process.stdout.write(`[vite] ${chunk}`));
  child.stderr.on("data", (chunk) => process.stderr.write(`[vite] ${chunk}`));
  await waitForHttp(`http://127.0.0.1:${port}/`);
  return child;
}

async function waitForHttp(url) {
  const deadline = Date.now() + 120_000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url);
      if (response.ok) {
        return;
      }
    } catch {
      // Vite is still starting.
    }
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 500));
  }

  throw new Error(`Timed out waiting for ${url}.`);
}

function runCommand(command, args) {
  return new Promise((resolveCommand, rejectCommand) => {
    const child = spawn(command, args, { stdio: ["ignore", "pipe", "pipe"] });
    let stderr = "";
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.on("error", rejectCommand);
    child.on("close", (code) => {
      if (code === 0) {
        resolveCommand();
        return;
      }

      rejectCommand(
        new Error(`${command} exited with ${code}: ${stderr.trim()}`)
      );
    });
  });
}

function findFreePort() {
  return new Promise((resolvePort, rejectPort) => {
    const server = createServer();
    server.on("error", rejectPort);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      const port = typeof address === "object" && address ? address.port : null;
      server.close(() => {
        if (port === null) {
          rejectPort(new Error("Failed to allocate a free port."));
          return;
        }
        resolvePort(port);
      });
    });
  });
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

function resolvePathFromRepo(path) {
  return resolve(repoRoot, path);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
