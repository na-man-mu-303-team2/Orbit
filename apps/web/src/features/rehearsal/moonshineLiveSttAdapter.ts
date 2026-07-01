import {
  liveSttPartialTranscriptEventSchema,
  type LiveSttPartialTranscriptEvent
} from "@orbit/shared";
import {
  LiveSttAdapterError,
  type LiveSttAdapter,
  type LiveSttCallbacks,
  type LiveSttStartOptions
} from "./liveStt";
import { calculatePcmAudioLevel } from "./liveSttAudioLevel";
import {
  createLiveSttPcmDebugRecorder,
  isLiveSttPcmDebugEnabled
} from "./liveSttPcmDebug";
import {
  MoonshineRmsVadSegmenter,
  type MoonshineRmsVadOptions,
  type MoonshineVadSegment
} from "./moonshineVadSegmenter";
import { resampleFloat32Audio } from "./sherpaOnnxLiveSttAdapter";
import pcmCaptureWorkletUrl from "./liveSttPcmCapture.worklet.js?url&no-inline";

type MoonshineWorkerInboundMessage =
  | {
      type: "load";
      modelId: string;
      dtype: MoonshineWorkerDTypeConfig;
      preferredDevice: MoonshineWorkerDevice;
      modelOptions: MoonshineWorkerModelOptions;
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
      type: "partial" | "final";
      sessionId: string;
      sequenceId: number;
      transcript: string;
      isFinal: boolean;
      confidence: number | null;
    }
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

type MoonshineWorkerDTypeConfig = {
  encoder_model: "fp32" | "fp16" | "q8" | "q4";
  decoder_model_merged: "fp32" | "fp16" | "q8" | "q4";
};

type MoonshineWorkerDevice = "webgpu" | "wasm";
type MoonshineWorkerModelOptions = {
  localModelPath?: string;
  allowRemoteModels?: boolean;
};

type MoonshineWorker = Pick<Worker, "postMessage" | "terminate"> & {
  onmessage:
    | ((event: MessageEvent<MoonshineWorkerOutboundMessage>) => void)
    | null;
  onerror: ((event: ErrorEvent) => void) | null;
};

type AudioContextConstructor = new (options?: AudioContextOptions) => AudioContext;
type AudioWorkletNodeConstructor = new (
  context: BaseAudioContext,
  name: string,
  options?: AudioWorkletNodeOptions
) => AudioWorkletNode;
type AudioContextFactory = (sampleRate: number) => AudioContext;
type AudioWorkletNodeFactory = (
  context: AudioContext,
  name: string,
  options: AudioWorkletNodeOptions
) => AudioWorkletNode;

type PcmCaptureWorkletMessage =
  | {
      type: "audio-frame";
      sampleRate: number;
      samples: Float32Array | ArrayBuffer;
    }
  | { type: "error"; message: string };

type AudioCaptureSession = {
  context: AudioContext;
  source: MediaStreamAudioSourceNode;
  processor: AudioWorkletNode;
  output: GainNode;
};

type PendingWorkerRequest = {
  resolve: () => void;
  reject: (error: LiveSttAdapterError) => void;
  timer: ReturnType<typeof setTimeout>;
};

type PendingRequestKey = "load" | `start:${string}`;
type LiveSttPcmDebugRecorder = ReturnType<typeof createLiveSttPcmDebugRecorder>;

const defaultMoonshineModelId = "onnx-community/moonshine-tiny-ko-ONNX";
const defaultMoonshineSampleRate = 16_000;
const defaultMoonshineDType: MoonshineWorkerDTypeConfig = {
  encoder_model: "fp32",
  decoder_model_merged: "q4"
};
const defaultMoonshinePreferredDevice: MoonshineWorkerDevice = "webgpu";
const defaultAudioWorkletFrameSize = 512;
const audioLevelUpdateIntervalMs = 250;
const liveSttWorkerTimeoutMs = 30_000;
const pcmCaptureWorkletProcessorName = "orbit-live-stt-pcm-capture";
const liveSttLatencyDebugStorageKey = "orbit.liveStt.debugLatency";
const moonshineLocalModelPathStorageKey =
  "orbit.liveStt.moonshine.localModelPath";
const moonshineAllowRemoteModelsStorageKey =
  "orbit.liveStt.moonshine.allowRemoteModels";
const moonshineWorkerDebugFields: ReadonlyArray<keyof MoonshineWorkerDebugStats> = [
  "sequenceId",
  "segmentSamples",
  "segmentDurationMs",
  "transcribeMs",
  "realtimeFactor",
  "resultLength",
  "audioMaxAbs",
  "audioRms"
];

export class MoonshineLiveSttAdapter implements LiveSttAdapter {
  private worker: MoonshineWorker | null = null;
  private callbacks: LiveSttCallbacks | null = null;
  private capture: AudioCaptureSession | null = null;
  private pendingRequests = new Map<PendingRequestKey, PendingWorkerRequest>();
  private sessionId: string | null = null;
  private isDisposed = false;
  private segmenter: MoonshineRmsVadSegmenter | null = null;
  private debugPcmRecorder: LiveSttPcmDebugRecorder | null = null;
  private lastAudioLevelAtMs: number | null = null;
  private sequenceId = 0;

  constructor(
    private readonly options: {
      modelId?: string;
      dtype?: MoonshineWorkerDTypeConfig;
      preferredDevice?: MoonshineWorkerDevice;
      createWorker?: () => MoonshineWorker;
      createAudioContext?: AudioContextFactory;
      createAudioWorkletNode?: AudioWorkletNodeFactory;
      sampleRate?: number;
      bufferSize?: number;
      vad?: Omit<MoonshineRmsVadOptions, "sampleRate">;
      localModelPath?: string;
      allowRemoteModels?: boolean;
    } = {}
  ) {}

  async start(
    stream: MediaStream,
    callbacks: LiveSttCallbacks,
    _options: LiveSttStartOptions = {}
  ): Promise<void> {
    if (this.isDisposed) {
      throw new LiveSttAdapterError(
        "LIVE_STT_START_FAILED",
        "Live STT adapter has been disposed."
      );
    }

    this.stop();
    this.callbacks = callbacks;

    try {
      const sampleRate = this.options.sampleRate ?? defaultMoonshineSampleRate;
      const worker = await this.loadWorker();
      const sessionId = `live_stt_moonshine_${Date.now()}_${Math.random()
        .toString(36)
        .slice(2)}`;
      this.sessionId = sessionId;
      this.sequenceId = 0;
      this.segmenter = new MoonshineRmsVadSegmenter({
        sampleRate,
        ...this.options.vad
      });
      await this.requestWorker(
        worker,
        {
          type: "start",
          sessionId,
          sampleRate,
          debugStatsEnabled: isLiveSttLatencyDebugEnabled()
        },
        `start:${sessionId}`
      );
      this.capture = await this.startAudioCapture(
        stream,
        sampleRate,
        sessionId,
        worker
      );
    } catch (error) {
      this.stop();
      throw toLiveSttAdapterError(error);
    }
  }

  stop() {
    const sessionId = this.sessionId;
    const worker = this.worker;
    if (sessionId && worker) {
      this.flushSegments(sessionId, worker);
    }

    this.stopAudioCapture();
    this.segmenter = null;
    this.sessionId = null;
    this.lastAudioLevelAtMs = null;

    if (sessionId && worker) {
      this.postWorkerMessage(worker, { type: "stop", sessionId });
    }
  }

  updateBiasContext() {
    // Moonshine has no decoder hotword API; RehearsalWorkspace applies bias
    // after transcription when the moonshine engine is active.
  }

  dispose() {
    this.isDisposed = true;
    this.stop();

    for (const request of this.pendingRequests.values()) {
      clearTimeout(request.timer);
      request.reject(
        new LiveSttAdapterError(
          "LIVE_STT_START_FAILED",
          "Live STT adapter was disposed."
        )
      );
    }
    this.pendingRequests.clear();

    if (this.worker) {
      this.postWorkerMessage(this.worker, { type: "dispose" });
      this.worker.terminate();
      this.worker = null;
    }

    this.callbacks = null;
  }

  private async loadWorker() {
    if (this.worker) {
      return this.worker;
    }

    const worker = this.options.createWorker?.() ?? createMoonshineWorker();
    worker.onmessage = (event) => this.handleWorkerMessage(event.data);
    worker.onerror = (event) => {
      this.handleWorkerMessage({
        type: "error",
        code: "LIVE_STT_START_FAILED",
        message: event.message || "Live STT worker failed."
      });
    };
    this.worker = worker;
    await this.requestWorker(
      worker,
      {
        type: "load",
        modelId: this.options.modelId ?? defaultMoonshineModelId,
        dtype: this.options.dtype ?? defaultMoonshineDType,
        preferredDevice:
          this.options.preferredDevice ?? defaultMoonshinePreferredDevice,
        modelOptions: this.resolveModelOptions()
      },
      "load"
    );
    return worker;
  }

  private resolveModelOptions(): MoonshineWorkerModelOptions {
    const storageOptions = readMoonshineModelOptionsFromStorage();
    return {
      ...storageOptions,
      ...(this.options.localModelPath !== undefined
        ? { localModelPath: this.options.localModelPath }
        : {}),
      ...(this.options.allowRemoteModels !== undefined
        ? { allowRemoteModels: this.options.allowRemoteModels }
        : {})
    };
  }

  private async startAudioCapture(
    stream: MediaStream,
    sampleRate: number,
    sessionId: string,
    worker: MoonshineWorker
  ) {
    const context = await this.createAudioContext(sampleRate);

    try {
      await this.loadAudioWorkletModule(context);

      const frameSize = this.options.bufferSize ?? defaultAudioWorkletFrameSize;
      this.debugPcmRecorder = isLiveSttPcmDebugEnabled()
        ? createLiveSttPcmDebugRecorder(sampleRate)
        : null;

      const source = context.createMediaStreamSource(stream);
      const processor = this.createAudioWorkletNode(context, frameSize);
      const output = context.createGain();
      output.gain.value = 0;

      processor.port.onmessage = (event: MessageEvent<PcmCaptureWorkletMessage>) => {
        this.handleAudioWorkletMessage(
          event.data,
          context,
          sampleRate,
          sessionId,
          worker
        );
      };
      processor.port.start();
      processor.onprocessorerror = () => {
        const error = new LiveSttAdapterError(
          "LIVE_STT_START_FAILED",
          "Live STT audio worklet failed."
        );
        this.callbacks?.onError(error);
        this.stop();
      };

      source.connect(processor);
      processor.connect(output);
      output.connect(context.destination);

      if (context.state === "suspended") {
        await context.resume();
      }

      return { context, source, processor, output };
    } catch (error) {
      void context.close();
      throw error;
    }
  }

  private stopAudioCapture() {
    this.publishDebugPcmRecording();

    if (!this.capture) {
      return;
    }

    this.capture.processor.port.onmessage = null;
    this.capture.processor.onprocessorerror = null;
    postAudioWorkletMessage(this.capture.processor, { type: "dispose" });
    disconnectAudioNode(this.capture.source);
    disconnectAudioNode(this.capture.processor);
    disconnectAudioNode(this.capture.output);
    void this.capture.context.close();
    this.capture = null;
  }

  private publishDebugPcmRecording() {
    const recording = this.debugPcmRecorder?.finish();
    this.debugPcmRecorder = null;

    if (recording) {
      this.callbacks?.onDebugPcmAvailable?.(recording);
    }
  }

  private async createAudioContext(sampleRate: number) {
    if (this.options.createAudioContext) {
      return this.options.createAudioContext(sampleRate);
    }

    const AudioContextCtor = getAudioContextConstructor();
    if (!AudioContextCtor) {
      throw new LiveSttAdapterError(
        "LIVE_STT_MODEL_UNAVAILABLE",
        "This browser does not support AudioContext for Live STT."
      );
    }

    try {
      return new AudioContextCtor({ sampleRate });
    } catch {
      return new AudioContextCtor();
    }
  }

  private async loadAudioWorkletModule(context: AudioContext) {
    if (
      !context.audioWorklet ||
      typeof context.audioWorklet.addModule !== "function"
    ) {
      throw new LiveSttAdapterError(
        "LIVE_STT_MODEL_UNAVAILABLE",
        "This browser does not support AudioWorklet for Live STT."
      );
    }

    try {
      await context.audioWorklet.addModule(pcmCaptureWorkletUrl, {
        credentials: "same-origin"
      });
    } catch (error) {
      throw new LiveSttAdapterError(
        "LIVE_STT_START_FAILED",
        error instanceof Error
          ? `Live STT audio worklet failed to load: ${error.message}`
          : "Live STT audio worklet failed to load."
      );
    }
  }

  private createAudioWorkletNode(context: AudioContext, frameSize: number) {
    const options: AudioWorkletNodeOptions = {
      numberOfInputs: 1,
      numberOfOutputs: 1,
      outputChannelCount: [1],
      processorOptions: { frameSize }
    };

    if (this.options.createAudioWorkletNode) {
      return this.options.createAudioWorkletNode(
        context,
        pcmCaptureWorkletProcessorName,
        options
      );
    }

    const AudioWorkletNodeCtor = getAudioWorkletNodeConstructor();
    if (!AudioWorkletNodeCtor) {
      throw new LiveSttAdapterError(
        "LIVE_STT_MODEL_UNAVAILABLE",
        "This browser does not support AudioWorkletNode for Live STT."
      );
    }

    try {
      return new AudioWorkletNodeCtor(
        context,
        pcmCaptureWorkletProcessorName,
        options
      );
    } catch (error) {
      throw new LiveSttAdapterError(
        "LIVE_STT_START_FAILED",
        error instanceof Error
          ? `Live STT audio worklet failed to start: ${error.message}`
          : "Live STT audio worklet failed to start."
      );
    }
  }

  private handleAudioWorkletMessage(
    message: PcmCaptureWorkletMessage,
    context: AudioContext,
    targetSampleRate: number,
    sessionId: string,
    worker: MoonshineWorker
  ) {
    if (message.type === "error") {
      this.callbacks?.onError(
        new LiveSttAdapterError("LIVE_STT_START_FAILED", message.message)
      );
      return;
    }

    if (this.sessionId !== sessionId) {
      return;
    }

    const sourceSampleRate = Number.isFinite(message.sampleRate)
      ? message.sampleRate
      : context.sampleRate;
    const inputSamples = toFloat32Array(message.samples);
    this.publishAudioLevel(inputSamples);
    const samples = resampleFloat32Audio(
      inputSamples,
      sourceSampleRate,
      targetSampleRate
    );
    this.debugPcmRecorder?.append(samples);
    this.sendSegments(this.segmenter?.push(samples) ?? [], sessionId, worker);
  }

  private publishAudioLevel(samples: Float32Array) {
    const now = Date.now();
    if (
      this.lastAudioLevelAtMs !== null &&
      now - this.lastAudioLevelAtMs < audioLevelUpdateIntervalMs
    ) {
      return;
    }
    this.lastAudioLevelAtMs = now;

    const level = calculatePcmAudioLevel(samples);
    this.callbacks?.onAudioLevel?.(level);
  }

  private flushSegments(sessionId: string, worker: MoonshineWorker) {
    this.sendSegments(this.segmenter?.flush() ?? [], sessionId, worker);
  }

  private sendSegments(
    segments: MoonshineVadSegment[],
    sessionId: string,
    worker: MoonshineWorker
  ) {
    for (const segment of segments) {
      const sequenceId = ++this.sequenceId;
      this.postWorkerMessage(
        worker,
        {
          type: "audio-segment",
          sessionId,
          sequenceId,
          sampleRate: segment.sampleRate,
          samples: segment.samples,
          maxLength: calculateMoonshineMaxLength(
            segment.samples.length,
            segment.sampleRate
          )
        },
        [segment.samples.buffer]
      );
    }
  }

  private requestWorker(
    worker: MoonshineWorker,
    message: MoonshineWorkerInboundMessage,
    key: PendingRequestKey
  ) {
    return new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pendingRequests.delete(key);
        reject(
          new LiveSttAdapterError(
            message.type === "load"
              ? "LIVE_STT_MODEL_UNAVAILABLE"
              : "LIVE_STT_START_FAILED",
            "Live STT worker did not respond in time."
          )
        );
      }, liveSttWorkerTimeoutMs);
      this.pendingRequests.set(key, { resolve, reject, timer });
      this.postWorkerMessage(worker, message);
    });
  }

  private postWorkerMessage(
    worker: MoonshineWorker,
    message: MoonshineWorkerInboundMessage,
    transfer?: Transferable[]
  ) {
    if (transfer) {
      worker.postMessage(message, transfer);
      return;
    }

    worker.postMessage(message);
  }

  private handleWorkerMessage(message: MoonshineWorkerOutboundMessage) {
    if (message.type === "loaded") {
      this.resolvePendingRequest("load");
      return;
    }

    if (message.type === "started") {
      this.resolvePendingRequest(`start:${message.sessionId}`);
      return;
    }

    if (message.type === "debug-stats") {
      if (message.sessionId !== this.sessionId) {
        return;
      }

      logLiveSttWorkerDebug(message.stats);
      return;
    }

    if (message.type === "partial" || message.type === "final") {
      if (message.sessionId !== this.sessionId) {
        return;
      }

      this.callbacks?.onPartialTranscript(
        parsePartialTranscriptMessage(message)
      );
      return;
    }

    if (message.type === "error") {
      const error = new LiveSttAdapterError(message.code, message.message);
      this.rejectPendingRequests(error);
      this.callbacks?.onError(error);
    }
  }

  private resolvePendingRequest(key: PendingRequestKey) {
    const request = this.pendingRequests.get(key);
    if (!request) {
      return;
    }

    clearTimeout(request.timer);
    this.pendingRequests.delete(key);
    request.resolve();
  }

  private rejectPendingRequests(error: LiveSttAdapterError) {
    for (const request of this.pendingRequests.values()) {
      clearTimeout(request.timer);
      request.reject(error);
    }
    this.pendingRequests.clear();
  }
}

export function calculateMoonshineMaxLength(sampleCount: number, sampleRate: number) {
  if (!Number.isFinite(sampleCount) || sampleCount <= 0) {
    return 1;
  }

  const normalizedSampleRate =
    Number.isFinite(sampleRate) && sampleRate > 0
      ? sampleRate
      : defaultMoonshineSampleRate;
  return Math.max(1, Math.ceil((sampleCount * 13) / normalizedSampleRate));
}

function createMoonshineWorker(): MoonshineWorker {
  if (typeof Worker === "undefined") {
    throw new LiveSttAdapterError(
      "LIVE_STT_MODEL_UNAVAILABLE",
      "This browser does not support Web Workers for Live STT."
    );
  }

  return new Worker(new URL("./moonshineWorker.ts", import.meta.url));
}

function parsePartialTranscriptMessage(
  message: Extract<MoonshineWorkerOutboundMessage, { type: "partial" | "final" }>
): LiveSttPartialTranscriptEvent {
  return liveSttPartialTranscriptEventSchema.parse({
    type: "partial-transcript",
    transcript: message.transcript,
    isFinal: message.isFinal,
    confidence: message.confidence
  });
}

function logLiveSttWorkerDebug(stats: MoonshineWorkerDebugStats) {
  if (!isLiveSttLatencyDebugEnabled()) {
    return;
  }

  const payload: Record<string, number> = {};
  for (const field of moonshineWorkerDebugFields) {
    payload[field] = roundLiveSttDebugValue(stats[field]);
  }

  console.debug(`[orbit-live-stt-worker] ${JSON.stringify(payload)}`);
}

function roundLiveSttDebugValue(value: number) {
  if (Number.isInteger(value)) {
    return value;
  }

  return Math.round(value * 1000) / 1000;
}

function isLiveSttLatencyDebugEnabled() {
  if (typeof window === "undefined") {
    return false;
  }

  try {
    return window.localStorage?.getItem(liveSttLatencyDebugStorageKey) === "1";
  } catch {
    return false;
  }
}

function readMoonshineModelOptionsFromStorage(): MoonshineWorkerModelOptions {
  if (typeof window === "undefined") {
    return {};
  }

  try {
    const localModelPath = window.localStorage
      ?.getItem(moonshineLocalModelPathStorageKey)
      ?.trim();
    const allowRemoteModelsValue = window.localStorage?.getItem(
      moonshineAllowRemoteModelsStorageKey
    );
    const options: MoonshineWorkerModelOptions = {};
    if (localModelPath) {
      options.localModelPath = localModelPath;
    }
    if (allowRemoteModelsValue === "0" || allowRemoteModelsValue === "false") {
      options.allowRemoteModels = false;
    }
    if (allowRemoteModelsValue === "1" || allowRemoteModelsValue === "true") {
      options.allowRemoteModels = true;
    }

    return options;
  } catch {
    return {};
  }
}

function getAudioContextConstructor(): AudioContextConstructor | null {
  const globalWindow = window as Window &
    typeof globalThis & {
      webkitAudioContext?: AudioContextConstructor;
    };
  return globalWindow.AudioContext ?? globalWindow.webkitAudioContext ?? null;
}

function getAudioWorkletNodeConstructor(): AudioWorkletNodeConstructor | null {
  const globalWindow = window as Window &
    typeof globalThis & {
      AudioWorkletNode?: AudioWorkletNodeConstructor;
    };
  return globalWindow.AudioWorkletNode ?? null;
}

function disconnectAudioNode(node: AudioNode) {
  try {
    node.disconnect();
  } catch {
    // Some browsers throw when a node is already disconnected.
  }
}

function postAudioWorkletMessage(
  processor: AudioWorkletNode,
  message: { type: "dispose" }
) {
  try {
    processor.port.postMessage(message);
  } catch {
    // The port can already be closed while tearing down audio capture.
  }
}

function toFloat32Array(samples: Float32Array | ArrayBuffer) {
  return samples instanceof Float32Array ? samples : new Float32Array(samples);
}

function toLiveSttAdapterError(error: unknown) {
  if (error instanceof LiveSttAdapterError) {
    return error;
  }

  return new LiveSttAdapterError(
    "LIVE_STT_START_FAILED",
    error instanceof Error ? error.message : "Live STT failed to start."
  );
}
