import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";

const execFileAsync = promisify(execFile);
const webRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

describe("Moonshine canary debug summary", () => {
  it("summarizes worker debug log metrics for staging canary review", async () => {
    const tempDir = await createTempDir();
    const logPath = join(tempDir, "moonshine-console.log");
    const outPath = join(tempDir, "moonshine-canary-summary.json");
    await writeFile(logPath, [
      "[vite] connected",
      '[orbit-live-stt-worker] {"sequenceId":1,"segmentSamples":16000,"segmentDurationMs":1000,"transcribeMs":125,"realtimeFactor":0.125,"resultLength":5,"audioMaxAbs":0.25,"audioRms":0.1}',
      '[orbit-live-stt-worker] {"sequenceId":2,"segmentSamples":8000,"segmentDurationMs":500,"transcribeMs":250,"realtimeFactor":0.5,"resultLength":0,"audioMaxAbs":0.05,"audioRms":0.02}',
      "[orbit-live-stt-latency] ignored"
    ].join("\n"));

    const result = await runSummary([
      "--log",
      logPath,
      "--out",
      outPath
    ]);

    expect(result.code).toBe(0);
    const report = JSON.parse(await readFile(outPath, "utf8"));
    expect(report).toMatchObject({
      status: "ok",
      segmentCount: 2,
      zeroResultCount: 1,
      sequenceIdRange: { first: 1, last: 2 },
      transcribeMs: {
        avg: 187.5,
        max: 250,
        p95: 250
      },
      realtimeFactor: {
        avg: 0.313,
        max: 0.5,
        p95: 0.5
      },
      audioRms: {
        min: 0.02,
        max: 0.1
      }
    });
  });

  it("fails when no Moonshine worker debug metrics are present", async () => {
    const tempDir = await createTempDir();
    const logPath = join(tempDir, "empty.log");
    await writeFile(logPath, "no worker metrics here\n");

    const result = await runSummary(["--log", logPath]);

    expect(result.code).toBe(1);
    const report = JSON.parse(result.stdout);
    expect(report).toMatchObject({
      status: "empty",
      segmentCount: 0
    });
  });
});

async function runSummary(args: string[]) {
  try {
    const result = await execFileAsync("node", [
      "scripts/summarize-moonshine-canary-debug.mjs",
      ...args
    ], { cwd: webRoot });
    return {
      code: 0,
      stdout: result.stdout,
      stderr: result.stderr
    };
  } catch (error) {
    const failed = error as {
      code?: number;
      stdout?: string;
      stderr?: string;
    };
    return {
      code: failed.code ?? 1,
      stdout: failed.stdout ?? "",
      stderr: failed.stderr ?? ""
    };
  }
}

async function createTempDir() {
  const tempDir = join(tmpdir(), `orbit-moonshine-canary-${randomUUID()}`);
  await mkdir(tempDir, { recursive: true });
  return tempDir;
}
