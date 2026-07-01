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

describe("evaluate Live STT fixtures CLI", () => {
  it("writes a gate-compatible measurement report for manually collected predictions", async () => {
    const tempDir = await createTempDir();
    const fixturesPath = join(tempDir, "fixtures.json");
    const predictionsPath = join(tempDir, "predictions.json");
    const outPath = join(tempDir, "sherpa-report.json");
    await writeJson(fixturesPath, [
      {
        id: "control-next",
        referenceTranscript: "다음 슬라이드로 넘어가 주세요",
        expectedKeywords: ["다음 슬라이드"],
        shouldTriggerControl: true,
        segmentEndedAtMs: 1000
      },
      {
        id: "free-speech",
        referenceTranscript: "안녕하세요 다음 슬라이드는 설명 자료입니다",
        expectedKeywords: [],
        shouldTriggerControl: false,
        segmentEndedAtMs: 2000
      }
    ]);
    await writeJson(predictionsPath, [
      {
        id: "control-next",
        transcript: "다음 슬라이드로 넘어가 주세요",
        detectedKeywords: ["다음 슬라이드"],
        triggeredControl: true,
        transcriptAtMs: 1300
      },
      {
        id: "free-speech",
        transcript: "안녕하세요 다음 슬라이드는 설명 자료입니다",
        detectedKeywords: [],
        triggeredControl: false,
        transcriptAtMs: 2200
      }
    ]);

    await execFileAsync("node", [
      "scripts/evaluate-live-stt-fixtures.mjs",
      "--fixtures",
      fixturesPath,
      "--predictions",
      predictionsPath,
      "--engine",
      "sherpa",
      "--model-id",
      "sherpa-onnx-streaming-zipformer-korean-2024-06-16",
      "--audio-source",
      "human-rehearsal-fixtures",
      "--out",
      outPath
    ], { cwd: webRoot });

    const report = JSON.parse(await readFile(outPath, "utf8"));
    expect(report).toMatchObject({
      engine: "sherpa",
      modelId: "sherpa-onnx-streaming-zipformer-korean-2024-06-16",
      fixturePath: fixturesPath,
      predictionPath: predictionsPath,
      audioSource: "human-rehearsal-fixtures",
      fixtureSet: {
        count: 2,
        ids: ["control-next", "free-speech"],
        sha256: expect.any(String)
      },
      results: [
        {
          engine: "sherpa",
          status: "succeeded",
          summary: {
            itemCount: 2,
            keywordRecall: 1,
            falseTriggerRate: 0,
            averageLatencyMs: 250
          }
        }
      ]
    });
    expect(report.generatedAt).toEqual(expect.any(String));
  });

  it("requires an audio source when writing a gate-compatible report", async () => {
    const tempDir = await createTempDir();
    const fixturesPath = join(tempDir, "fixtures.json");
    const predictionsPath = join(tempDir, "predictions.json");
    await writeJson(fixturesPath, [
      {
        id: "control-next",
        referenceTranscript: "다음 슬라이드",
        expectedKeywords: ["다음 슬라이드"],
        shouldTriggerControl: true
      }
    ]);
    await writeJson(predictionsPath, [
      {
        id: "control-next",
        transcript: "다음 슬라이드"
      }
    ]);

    await expect(
      execFileAsync("node", [
        "scripts/evaluate-live-stt-fixtures.mjs",
        "--fixtures",
        fixturesPath,
        "--predictions",
        predictionsPath,
        "--out",
        join(tempDir, "report.json")
      ], { cwd: webRoot })
    ).rejects.toMatchObject({
      stderr: expect.stringContaining("--audio-source is required")
    });
  });
});

async function createTempDir() {
  const tempDir = join(tmpdir(), `orbit-live-stt-eval-${randomUUID()}`);
  await mkdir(tempDir, { recursive: true });
  return tempDir;
}

async function writeJson(path: string, value: unknown) {
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`);
}
