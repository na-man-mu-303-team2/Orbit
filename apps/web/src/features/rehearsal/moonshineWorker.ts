import {
  env as transformersEnv,
  pipeline as transformersPipeline
} from "@huggingface/transformers";

type MoonshineWorkerDevice = "webgpu" | "wasm";
type MoonshineWorkerDTypeConfig = {
  encoder_model: "fp32" | "fp16" | "q8" | "q4";
  decoder_model_merged: "fp32" | "fp16" | "q8" | "q4";
};
type MoonshineWorkerModelOptions = {
  localModelPath?: string;
  allowRemoteModels?: boolean;
};

type MoonshineWorkerInboundMessage =
  | {
      type: "load";
      modelId: string;
      dtype: MoonshineWorkerDTypeConfig;
      preferredDevice: MoonshineWorkerDevice;
      modelOptions?: MoonshineWorkerModelOptions;
    }
  | {
      type: "start";
      sessionId: string;
      sampleRate: number;
      debugStatsEnabled: boolean;
    }
  | {
      type: "audio-segment";
      sessionId: string;
      sequenceId: number;
      sampleRate: number;
      samples: Float32Array;
      maxLength: number;
    }
  | { type: "stop"; sessionId: string }
  | { type: "dispose" };

type MoonshineWorkerOutboundMessage =
  | { type: "loaded"; modelId: string; device: MoonshineWorkerDevice }
  | { type: "started"; sessionId: string }
  | {
      type: "debug-stats";
      sessionId: string;
      stats: MoonshineWorkerDebugStats;
    }
  | {
      type: "final";
      sessionId: string;
      sequenceId: number;
      transcript: string;
      isFinal: true;
      confidence: number | null;
    }
  | { type: "stopped"; sessionId: string }
  | {
      type: "error";
      code: "LIVE_STT_MODEL_UNAVAILABLE" | "LIVE_STT_START_FAILED";
      message: string;
      sessionId?: string;
    };
type MoonshineWorkerDebugStats = {
  sequenceId: number;
  segmentSamples: number;
  segmentDurationMs: number;
  transcribeMs: number;
  realtimeFactor: number;
  resultLength: number;
  audioMaxAbs: number;
  audioRms: number;
};

type PipelineOptions = {
  device: MoonshineWorkerDevice;
  dtype: MoonshineWorkerDTypeConfig;
};
type TranscribeOptions = {
  sampling_rate: number;
  max_length: number;
};
type TranscribeResult = { text?: unknown };
type MoonshineTranscriber = {
  (samples: Float32Array, options: TranscribeOptions): Promise<TranscribeResult>;
  processor?: {
    components?: Record<string, unknown>;
  };
  tokenizer?: unknown;
};
type MoonshinePipelineFactory = (
  task: "automatic-speech-recognition",
  modelId: string,
  options: PipelineOptions
) => Promise<MoonshineTranscriber>;
type WorkerScope = typeof globalThis & {
  onmessage:
    | ((event: MessageEvent<MoonshineWorkerInboundMessage>) => void)
    | null;
  postMessage: (message: MoonshineWorkerOutboundMessage) => void;
  close: () => void;
  __orbitMoonshinePipelineFactory?: MoonshinePipelineFactory;
};

const workerScope = globalThis as unknown as WorkerScope;
let transcriber: MoonshineTranscriber | null = null;
let loadedModelId = "";
let loadedDevice: MoonshineWorkerDevice | null = null;
let activeSessionId: string | null = null;
let shouldPostDebugStats = false;

workerScope.onmessage = (event: MessageEvent<MoonshineWorkerInboundMessage>) => {
  void handleMessage(event.data);
};

async function handleMessage(message: MoonshineWorkerInboundMessage) {
  try {
    switch (message.type) {
      case "load":
        await loadTranscriber(
          message.modelId,
          message.dtype,
          message.preferredDevice,
          message.modelOptions ?? {}
        );
        post({
          type: "loaded",
          modelId: message.modelId,
          device: loadedDevice ?? message.preferredDevice
        });
        return;
      case "start":
        startSession(message.sessionId, message.debugStatsEnabled);
        return;
      case "audio-segment":
        await transcribeSegment(message);
        return;
      case "stop":
        stopSession(message.sessionId);
        return;
      case "dispose":
        disposeWorker();
        return;
    }
  } catch (error) {
    post({
      type: "error",
      code:
        message.type === "load"
          ? "LIVE_STT_MODEL_UNAVAILABLE"
          : "LIVE_STT_START_FAILED",
      message: describeWorkerError(error),
      sessionId: "sessionId" in message ? message.sessionId : undefined
    });
  }
}

async function loadTranscriber(
  modelId: string,
  dtype: MoonshineWorkerDTypeConfig,
  preferredDevice: MoonshineWorkerDevice,
  modelOptions: MoonshineWorkerModelOptions
) {
  if (transcriber && loadedModelId === modelId && loadedDevice) {
    return;
  }

  const devices: MoonshineWorkerDevice[] =
    preferredDevice === "webgpu" ? ["webgpu", "wasm"] : ["wasm"];
  let lastError: unknown = null;
  for (const device of devices) {
    try {
      applyModelOptions(modelOptions);
      const pipelineFactory = await getPipelineFactory();
      transcriber = await pipelineFactory(
        "automatic-speech-recognition",
        modelId,
        { device, dtype }
      );
      patchMoonshineProcessorTokenizer(transcriber);
      loadedModelId = modelId;
      loadedDevice = device;
      return;
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError ?? new Error("Moonshine Live STT model failed to load.");
}

function patchMoonshineProcessorTokenizer(nextTranscriber: MoonshineTranscriber) {
  if (
    nextTranscriber.tokenizer &&
    nextTranscriber.processor?.components &&
    !nextTranscriber.processor.components.tokenizer
  ) {
    nextTranscriber.processor.components.tokenizer = nextTranscriber.tokenizer;
  }
}

function applyModelOptions(modelOptions: MoonshineWorkerModelOptions) {
  if (modelOptions.localModelPath) {
    transformersEnv.localModelPath = modelOptions.localModelPath;
    transformersEnv.allowLocalModels = true;
  }

  if (modelOptions.allowRemoteModels !== undefined) {
    transformersEnv.allowRemoteModels = modelOptions.allowRemoteModels;
  }
}

async function getPipelineFactory() {
  if (workerScope.__orbitMoonshinePipelineFactory) {
    return workerScope.__orbitMoonshinePipelineFactory;
  }

  return transformersPipeline as MoonshinePipelineFactory;
}

function startSession(sessionId: string, debugStatsEnabled: boolean) {
  if (!transcriber) {
    throw new Error("Moonshine Live STT model has not been loaded.");
  }

  activeSessionId = sessionId;
  shouldPostDebugStats = debugStatsEnabled;
  post({ type: "started", sessionId });
}

async function transcribeSegment(
  message: Extract<MoonshineWorkerInboundMessage, { type: "audio-segment" }>
) {
  if (activeSessionId !== message.sessionId) {
    return;
  }

  if (!transcriber) {
    throw new Error("Moonshine Live STT model has not been loaded.");
  }

  const samples = toFloat32Array(message.samples);
  const transcribeStartedAt = performance.now();
  const result = await transcriber(samples, {
    sampling_rate: message.sampleRate,
    max_length: normalizeMaxLength(message.maxLength)
  });
  const transcribeMs = performance.now() - transcribeStartedAt;
  const transcript = extractTranscriptText(result);
  if (shouldPostDebugStats) {
    post({
      type: "debug-stats",
      sessionId: message.sessionId,
      stats: buildDebugStats(message, samples, transcript, transcribeMs)
    });
  }
  if (!transcript) {
    return;
  }

  post({
    type: "final",
    sessionId: message.sessionId,
    sequenceId: message.sequenceId,
    transcript,
    isFinal: true,
    confidence: null
  });
}

function stopSession(sessionId: string) {
  if (activeSessionId !== sessionId) {
    return;
  }

  activeSessionId = null;
  shouldPostDebugStats = false;
  post({ type: "stopped", sessionId });
}

function disposeWorker() {
  transcriber = null;
  loadedModelId = "";
  loadedDevice = null;
  activeSessionId = null;
  shouldPostDebugStats = false;
  workerScope.close();
}

function buildDebugStats(
  message: Extract<MoonshineWorkerInboundMessage, { type: "audio-segment" }>,
  samples: Float32Array,
  transcript: string,
  transcribeMs: number
): MoonshineWorkerDebugStats {
  const segmentDurationMs =
    samples.length > 0 && Number.isFinite(message.sampleRate) && message.sampleRate > 0
      ? (samples.length / message.sampleRate) * 1000
      : 0;
  const amplitude = measureSamplesAmplitude(samples);

  return {
    sequenceId: message.sequenceId,
    segmentSamples: samples.length,
    segmentDurationMs,
    transcribeMs,
    realtimeFactor: segmentDurationMs > 0 ? transcribeMs / segmentDurationMs : 0,
    resultLength: transcript.length,
    audioMaxAbs: amplitude.maxAbs,
    audioRms: amplitude.rms
  };
}

function measureSamplesAmplitude(samples: Float32Array) {
  if (samples.length === 0) {
    return { maxAbs: 0, rms: 0 };
  }

  let maxAbs = 0;
  let sumSquares = 0;
  for (const sample of samples) {
    const abs = Math.abs(sample);
    maxAbs = Math.max(maxAbs, abs);
    sumSquares += sample * sample;
  }

  return {
    maxAbs,
    rms: Math.sqrt(sumSquares / samples.length)
  };
}

function toFloat32Array(samples: Float32Array | ArrayBuffer) {
  return samples instanceof Float32Array ? samples : new Float32Array(samples);
}

function normalizeMaxLength(maxLength: number) {
  return Number.isFinite(maxLength) && maxLength > 0
    ? Math.max(1, Math.round(maxLength))
    : 1;
}

function extractTranscriptText(result: TranscribeResult) {
  return typeof result.text === "string" ? result.text.trim() : "";
}

function describeWorkerError(error: unknown) {
  if (error instanceof Error && error.message) {
    return error.message;
  }

  if (
    error &&
    typeof error === "object" &&
    "message" in error &&
    typeof error.message === "string" &&
    error.message
  ) {
    return error.message;
  }

  const text = typeof error === "string" ? error : String(error ?? "");
  return text && text !== "[object Object]" ? text : "Moonshine Live STT failed.";
}

function post(message: MoonshineWorkerOutboundMessage) {
  workerScope.postMessage(message);
}
