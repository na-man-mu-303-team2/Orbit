import { pipeline as transformersPipeline } from "@huggingface/transformers";

type MoonshineWorkerDevice = "webgpu" | "wasm";
type MoonshineWorkerDTypeConfig = {
  encoder: "fp32" | "fp16" | "q8" | "q4";
  decoder_model_merged: "fp32" | "fp16" | "q8" | "q4";
};

type MoonshineWorkerInboundMessage =
  | {
      type: "load";
      modelId: string;
      dtype: MoonshineWorkerDTypeConfig;
      preferredDevice: MoonshineWorkerDevice;
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

type PipelineOptions = {
  device: MoonshineWorkerDevice;
  dtype: MoonshineWorkerDTypeConfig;
};
type TranscribeOptions = {
  sampling_rate: number;
  max_length: number;
};
type TranscribeResult = { text?: unknown };
type MoonshineTranscriber = (
  samples: Float32Array,
  options: TranscribeOptions
) => Promise<TranscribeResult>;
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
          message.preferredDevice
        );
        post({
          type: "loaded",
          modelId: message.modelId,
          device: loadedDevice ?? message.preferredDevice
        });
        return;
      case "start":
        startSession(message.sessionId);
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
  preferredDevice: MoonshineWorkerDevice
) {
  if (transcriber && loadedModelId === modelId && loadedDevice) {
    return;
  }

  const devices: MoonshineWorkerDevice[] =
    preferredDevice === "webgpu" ? ["webgpu", "wasm"] : ["wasm"];
  let lastError: unknown = null;
  for (const device of devices) {
    try {
      const pipelineFactory = await getPipelineFactory();
      transcriber = await pipelineFactory(
        "automatic-speech-recognition",
        modelId,
        { device, dtype }
      );
      loadedModelId = modelId;
      loadedDevice = device;
      return;
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError ?? new Error("Moonshine Live STT model failed to load.");
}

async function getPipelineFactory() {
  if (workerScope.__orbitMoonshinePipelineFactory) {
    return workerScope.__orbitMoonshinePipelineFactory;
  }

  return transformersPipeline as MoonshinePipelineFactory;
}

function startSession(sessionId: string) {
  if (!transcriber) {
    throw new Error("Moonshine Live STT model has not been loaded.");
  }

  activeSessionId = sessionId;
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

  const result = await transcriber(toFloat32Array(message.samples), {
    sampling_rate: message.sampleRate,
    max_length: normalizeMaxLength(message.maxLength)
  });
  const transcript = extractTranscriptText(result);
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
  post({ type: "stopped", sessionId });
}

function disposeWorker() {
  transcriber = null;
  loadedModelId = "";
  loadedDevice = null;
  activeSessionId = null;
  workerScope.close();
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
