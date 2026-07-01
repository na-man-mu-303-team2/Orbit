import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import * as vm from "node:vm";
import { createServer, type ViteDevServer } from "vite";
import { afterEach, describe, expect, it, vi } from "vitest";

const webRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const workerFilePath =
  "/src/features/rehearsal/moonshineWorker.ts?worker_file&type=classic";

describe("moonshineWorker", () => {
  let server: ViteDevServer | null = null;

  afterEach(async () => {
    await server?.close();
    server = null;
    vi.restoreAllMocks();
  });

  it("loads a Transformers.js ASR pipeline and transcribes audio segments", async () => {
    server = await createWorkerTransformServer();
    const context = await createWorkerContext(server, {
      pipelineFactory: async (task, modelId, options) => {
        context.pipelineCalls.push({ task, modelId, options });
        return async (samples, transcribeOptions) => {
          context.transcribeCalls.push({ samples, options: transcribeOptions });
          return { text: "다음 슬라이드" };
        };
      }
    });

    await sendWorkerMessage(context, {
      type: "load",
      modelId: "onnx-community/moonshine-tiny-ko-ONNX",
      dtype: { encoder: "fp32", decoder_model_merged: "q4" },
      preferredDevice: "webgpu"
    });
    await sendWorkerMessage(context, {
      type: "start",
      sessionId: "session-1",
      sampleRate: 16000,
      debugStatsEnabled: false
    });
    const samples = new Float32Array(3200);
    await sendWorkerMessage(context, {
      type: "audio-segment",
      sessionId: "session-1",
      sequenceId: 7,
      sampleRate: 16000,
      samples,
      maxLength: 3
    });

    expect(context.pipelineCalls).toEqual([
      {
        task: "automatic-speech-recognition",
        modelId: "onnx-community/moonshine-tiny-ko-ONNX",
        options: {
          device: "webgpu",
          dtype: { encoder: "fp32", decoder_model_merged: "q4" }
        }
      }
    ]);
    expect(context.transcribeCalls).toHaveLength(1);
    expect(context.transcribeCalls[0]?.samples).toBe(samples);
    expect(context.transcribeCalls[0]?.options).toMatchObject({
      sampling_rate: 16000,
      max_length: 3
    });
    expect(context.posted).toContainEqual(
      expect.objectContaining({
        type: "loaded",
        modelId: "onnx-community/moonshine-tiny-ko-ONNX",
        device: "webgpu"
      })
    );
    expect(context.posted).toContainEqual({
      type: "final",
      sessionId: "session-1",
      sequenceId: 7,
      transcript: "다음 슬라이드",
      isFinal: true,
      confidence: null
    });
  });

  it("falls back to WASM when WebGPU pipeline loading fails", async () => {
    server = await createWorkerTransformServer();
    const attemptedDevices: string[] = [];
    const context = await createWorkerContext(server, {
      pipelineFactory: async (_task, _modelId, options) => {
        attemptedDevices.push(String(options.device));
        if (options.device === "webgpu") {
          throw new Error("webgpu unavailable");
        }
        return async () => ({ text: "오르빗" });
      }
    });

    await sendWorkerMessage(context, {
      type: "load",
      modelId: "onnx-community/moonshine-tiny-ko-ONNX",
      dtype: { encoder: "fp32", decoder_model_merged: "q4" },
      preferredDevice: "webgpu"
    });

    expect(attemptedDevices).toEqual(["webgpu", "wasm"]);
    expect(context.posted).toContainEqual(
      expect.objectContaining({
        type: "loaded",
        device: "wasm"
      })
    );
  });

  it("maps transcription failures to LIVE_STT_START_FAILED", async () => {
    server = await createWorkerTransformServer();
    const context = await createWorkerContext(server, {
      pipelineFactory: async () => async () => {
        throw new Error("inference failed");
      }
    });

    await sendWorkerMessage(context, {
      type: "load",
      modelId: "onnx-community/moonshine-tiny-ko-ONNX",
      dtype: { encoder: "fp32", decoder_model_merged: "q4" },
      preferredDevice: "wasm"
    });
    await sendWorkerMessage(context, {
      type: "start",
      sessionId: "session-1",
      sampleRate: 16000,
      debugStatsEnabled: false
    });
    await sendWorkerMessage(context, {
      type: "audio-segment",
      sessionId: "session-1",
      sequenceId: 1,
      sampleRate: 16000,
      samples: new Float32Array(1600),
      maxLength: 2
    });

    expect(context.posted).toContainEqual(
      expect.objectContaining({
        type: "error",
        code: "LIVE_STT_START_FAILED",
        message: "inference failed",
        sessionId: "session-1"
      })
    );
  });

  it("ignores stale audio segments from stopped sessions", async () => {
    server = await createWorkerTransformServer();
    const context = await createWorkerContext(server, {
      pipelineFactory: async () => async () => {
        context.transcribeCalls.push({
          samples: new Float32Array(),
          options: {}
        });
        return { text: "stale" };
      }
    });

    await sendWorkerMessage(context, {
      type: "load",
      modelId: "onnx-community/moonshine-tiny-ko-ONNX",
      dtype: { encoder: "fp32", decoder_model_merged: "q4" },
      preferredDevice: "wasm"
    });
    await sendWorkerMessage(context, {
      type: "start",
      sessionId: "session-1",
      sampleRate: 16000,
      debugStatsEnabled: false
    });
    await sendWorkerMessage(context, { type: "stop", sessionId: "session-1" });
    await sendWorkerMessage(context, {
      type: "audio-segment",
      sessionId: "session-1",
      sequenceId: 1,
      sampleRate: 16000,
      samples: new Float32Array(1600),
      maxLength: 2
    });

    expect(context.transcribeCalls).toEqual([]);
    expect(context.posted).not.toContainEqual(
      expect.objectContaining({ type: "final", transcript: "stale" })
    );
  });
});

type PipelineOptions = {
  device: string;
  dtype: Record<string, string>;
};
type TranscribeOptions = Record<string, unknown>;
type PipelineFactory = (
  task: string,
  modelId: string,
  options: PipelineOptions
) => Promise<
  (samples: Float32Array, options: TranscribeOptions) => Promise<{ text: string }>
>;
type WorkerTestContext = {
  Float32Array: Float32ArrayConstructor;
  console: Console;
  performance: { now: () => number };
  postMessage: (message: Record<string, unknown>) => void;
  close: () => void;
  queueMicrotask: (callback: () => void) => void;
  importScripts: (...urls: string[]) => void;
  __orbitMoonshinePipelineFactory: PipelineFactory;
  onmessage?: (event: { data: Record<string, unknown> }) => void;
  posted: Array<Record<string, unknown>>;
  pipelineCalls: Array<{
    task: string;
    modelId: string;
    options: PipelineOptions;
  }>;
  transcribeCalls: Array<{
    samples: Float32Array;
    options: TranscribeOptions;
  }>;
};

async function createWorkerTransformServer() {
  return createServer({
    configFile: false,
    root: webRoot,
    logLevel: "silent",
    worker: { format: "iife" },
    plugins: []
  });
}

async function createWorkerContext(
  server: ViteDevServer | null,
  options: { pipelineFactory: PipelineFactory }
) {
  if (!server) {
    throw new Error("Expected Vite server to be initialized.");
  }
  const result = await server.transformRequest(workerFilePath);
  const executableCode = replaceTransformersImportForVm(
    stripInlineSourceMap(result?.code ?? "")
  );
  const posted: Array<Record<string, unknown>> = [];
  const context: WorkerTestContext = {
    Float32Array,
    console,
    performance: { now: () => 0 },
    postMessage: (message: Record<string, unknown>) => {
      posted.push(message);
    },
    close: vi.fn(),
    queueMicrotask: (callback: () => void) => queueMicrotask(callback),
    importScripts: vi.fn(),
    __orbitMoonshinePipelineFactory: options.pipelineFactory,
    posted,
    pipelineCalls: [],
    transcribeCalls: []
  };

  vm.runInNewContext(executableCode, context);
  return context;
}

async function sendWorkerMessage(
  context: WorkerTestContext,
  message: Record<string, unknown>
) {
  context.onmessage?.({ data: message });
  await new Promise((resolve) => setTimeout(resolve, 0));
  await new Promise((resolve) => setTimeout(resolve, 0));
}

function stripInlineSourceMap(source: string) {
  return source.replace(/\n?\/\/# sourceMappingURL=data:application\/json[^\\n]*/g, "");
}

function replaceTransformersImportForVm(source: string) {
  return source.replace(
    /import\s*\{\s*pipeline\s+as\s+transformersPipeline\s*\}\s*from\s*["'][^"']+["'];/,
    "const transformersPipeline = __orbitMoonshinePipelineFactory;"
  );
}
