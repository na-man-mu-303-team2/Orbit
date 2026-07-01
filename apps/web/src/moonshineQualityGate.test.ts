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

describe("Moonshine Live STT quality gate", () => {
  it("refuses to pass a candidate when no sherpa baseline or absolute thresholds are provided", async () => {
    const tempDir = await createTempDir();
    const candidatePath = join(tempDir, "candidate.json");
    const outPath = join(tempDir, "gate.json");
    await writeJson(candidatePath, measurementReport({
      modelId: "onnx-community/moonshine-tiny-ko-ONNX",
      engine: "moonshine",
      device: "wasm",
      keywordRecall: 1,
      falseTriggerRate: 0,
      averageLatencyMs: 120
    }));

    const result = await runGate([
      "--candidate",
      candidatePath,
      "--out",
      outPath
    ]);

    expect(result.code).toBe(1);
    const gate = JSON.parse(await readFile(outPath, "utf8"));
    expect(gate).toMatchObject({
      status: "blocked",
      missingCriteria: [
        "keywordRecall",
        "falseTriggerRate",
        "averageLatencyMs"
      ]
    });
  });

  it("resolves relative report paths from the repository root", async () => {
    const tempDir = await createTempDir();
    const outPath = join(tempDir, "gate.json");

    const result = await runGate([
      "--candidate",
      "docs/spikes/moonshine-korean-asr-measurements.json",
      "--out",
      outPath
    ]);

    expect(result.code).toBe(1);
    const gate = JSON.parse(await readFile(outPath, "utf8"));
    expect(gate).toMatchObject({
      status: "blocked",
      candidate: {
        engine: "moonshine"
      }
    });
    expect(result.stderr).not.toContain("ENOENT");
  });

  it("blocks synthetic audio reports even when explicit thresholds pass", async () => {
    const tempDir = await createTempDir();
    const candidatePath = join(tempDir, "synthetic-candidate.json");
    await writeJson(candidatePath, measurementReport({
      modelId: "onnx-community/moonshine-tiny-ko-ONNX",
      engine: "moonshine",
      device: "wasm",
      keywordRecall: 1,
      falseTriggerRate: 0,
      averageLatencyMs: 80,
      audioSource: "macOS say voice Yuna"
    }));

    const result = await runGate([
      "--candidate",
      candidatePath,
      "--min-keyword-recall",
      "0.9",
      "--max-false-trigger-rate",
      "0",
      "--max-average-latency-ms",
      "120"
    ]);

    expect(result.code).toBe(1);
    const gate = JSON.parse(result.stdout);
    expect(gate).toMatchObject({
      status: "blocked",
      reason: expect.stringContaining("human rehearsal audio"),
      missingCriteria: ["humanAudioSource"]
    });
  });

  it("passes when candidate metrics meet or improve on the sherpa baseline", async () => {
    const tempDir = await createTempDir();
    const candidatePath = join(tempDir, "candidate.json");
    const baselinePath = join(tempDir, "baseline.json");
    const markdownPath = join(tempDir, "gate.md");
    await writeJson(candidatePath, measurementReport({
      modelId: "onnx-community/moonshine-tiny-ko-ONNX",
      engine: "moonshine",
      device: "wasm",
      keywordRecall: 0.9,
      falseTriggerRate: 0,
      averageLatencyMs: 260
    }));
    await writeJson(baselinePath, measurementReport({
      modelId: "sherpa-onnx-streaming-zipformer-korean-2024-06-16",
      engine: "sherpa",
      device: "wasm",
      keywordRecall: 0.8,
      falseTriggerRate: 0.1,
      averageLatencyMs: 320
    }));

    const result = await runGate([
      "--candidate",
      candidatePath,
      "--baseline",
      baselinePath,
      "--markdown-out",
      markdownPath
    ]);

    expect(result.code).toBe(0);
    const gate = JSON.parse(result.stdout);
    expect(gate).toMatchObject({
      status: "go",
      candidate: {
        engine: "moonshine",
        device: "wasm"
      },
      baseline: {
        engine: "sherpa",
        device: "wasm"
      }
    });
    expect(gate.gates.keywordRecall).toMatchObject({ passed: true });
    expect(gate.gates.falseTriggerRate).toMatchObject({ passed: true });
    expect(gate.gates.averageLatencyMs).toMatchObject({ passed: true });
    await expect(readFile(markdownPath, "utf8")).resolves.toContain(
      "| Moonshine candidate | moonshine | wasm |"
    );
  });

  it("fails when candidate recall regresses against the sherpa baseline", async () => {
    const tempDir = await createTempDir();
    const candidatePath = join(tempDir, "candidate.json");
    const baselinePath = join(tempDir, "baseline.json");
    await writeJson(candidatePath, measurementReport({
      modelId: "onnx-community/moonshine-tiny-ko-ONNX",
      engine: "moonshine",
      device: "wasm",
      keywordRecall: 0.5,
      falseTriggerRate: 0,
      averageLatencyMs: 260
    }));
    await writeJson(baselinePath, measurementReport({
      modelId: "sherpa-onnx-streaming-zipformer-korean-2024-06-16",
      engine: "sherpa",
      device: "wasm",
      keywordRecall: 0.8,
      falseTriggerRate: 0.1,
      averageLatencyMs: 320
    }));

    const result = await runGate([
      "--candidate",
      candidatePath,
      "--baseline",
      baselinePath
    ]);

    expect(result.code).toBe(1);
    const gate = JSON.parse(result.stdout);
    expect(gate.status).toBe("no-go");
    expect(gate.gates.keywordRecall).toMatchObject({
      passed: false,
      actual: 0.5,
      minimum: 0.8
    });
  });
});

async function runGate(args: string[]) {
  try {
    const result = await execFileAsync("node", [
      "scripts/evaluate-live-stt-quality-gate.mjs",
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
  const tempDir = join(tmpdir(), `orbit-moonshine-gate-${randomUUID()}`);
  await mkdir(tempDir, { recursive: true });
  return tempDir;
}

async function writeJson(path: string, value: unknown) {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`);
}

function measurementReport(options: {
  modelId: string;
  engine: string;
  device: string;
  keywordRecall: number;
  falseTriggerRate: number;
  averageLatencyMs: number;
  audioSource?: string;
}) {
  return {
    generatedAt: "2026-07-01T00:00:00.000Z",
    modelId: options.modelId,
    engine: options.engine,
    fixturePath: "apps/web/src/features/rehearsal/fixtures/live-stt-ko-evaluation.json",
    audioSource: options.audioSource ?? "human-rehearsal-fixtures",
    results: [
      {
        engine: options.engine,
        device: options.device,
        status: "succeeded",
        modelLoadMs: 100,
        summary: {
          itemCount: 3,
          averageCer: 0.2,
          keywordRecall: options.keywordRecall,
          falseTriggerRate: options.falseTriggerRate,
          averageLatencyMs: options.averageLatencyMs,
          items: []
        }
      }
    ]
  };
}
