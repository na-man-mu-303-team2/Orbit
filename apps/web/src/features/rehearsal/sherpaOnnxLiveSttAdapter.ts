import {
  liveSttPartialTranscriptEventSchema,
  type LiveSttPartialTranscriptEvent
} from "@orbit/shared";
import {
  LiveSttAdapterError,
  type LiveSttAdapter,
  type LiveSttCallbacks
} from "./liveStt";
import {
  defaultSherpaOnnxManifestUrl,
  loadSherpaOnnxModelManifest,
  type ResolvedSherpaOnnxModelManifest
} from "./sherpaOnnxManifest";

type SherpaWorkerInboundMessage =
  | { type: "load"; manifest: ResolvedSherpaOnnxModelManifest }
  | { type: "start"; sessionId: string }
  | {
      type: "audio-frame";
      sessionId: string;
      sampleRate: number;
      samples: Float32Array;
    }
  | { type: "stop"; sessionId: string }
  | { type: "dispose" };

type SherpaWorkerOutboundMessage =
  | { type: "loaded"; modelId: string; version: string }
  | { type: "started"; sessionId: string }
  | {
      type: "partial" | "final";
      sessionId: string;
      transcript: string;
      isFinal: boolean;
      confidence: number | null;
    }
  | { type: "stopped"; sessionId: string }
  | {
      type: "error";
      code: "LIVE_STT_MODEL_UNAVAILABLE" | "LIVE_STT_START_FAILED";
      message: string;
      sessionId?: string;
    };

type SherpaWorker = Pick<Worker, "postMessage" | "terminate"> & {
  onmessage: ((event: MessageEvent<SherpaWorkerOutboundMessage>) => void) | null;
  onerror: ((event: ErrorEvent) => void) | null;
};

type AudioContextConstructor = new (options?: AudioContextOptions) => AudioContext;
type AudioContextFactory = (manifest: ResolvedSherpaOnnxModelManifest) => AudioContext;

type AudioCaptureSession = {
  context: AudioContext;
  source: MediaStreamAudioSourceNode;
  processor: ScriptProcessorNode;
  output: GainNode;
};

type PendingWorkerRequest = {
  resolve: () => void;
  reject: (error: LiveSttAdapterError) => void;
  timer: ReturnType<typeof setTimeout>;
};

type PendingRequestKey = "load" | `start:${string}`;

const liveSttWorkerTimeoutMs = 30_000;
const defaultScriptProcessorBufferSize = 4096;

export class SherpaOnnxLiveSttAdapter implements LiveSttAdapter {
  private manifest: ResolvedSherpaOnnxModelManifest | null = null;
  private worker: SherpaWorker | null = null;
  private callbacks: LiveSttCallbacks | null = null;
  private capture: AudioCaptureSession | null = null;
  private pendingRequests = new Map<PendingRequestKey, PendingWorkerRequest>();
  private sessionId: string | null = null;
  private isDisposed = false;

  constructor(
    private readonly options: {
      manifestUrl?: string;
      fetcher?: typeof fetch;
      createWorker?: () => SherpaWorker;
      createAudioContext?: AudioContextFactory;
      bufferSize?: number;
    } = {}
  ) {}

  async start(stream: MediaStream, callbacks: LiveSttCallbacks): Promise<void> {
    if (this.isDisposed) {
      throw new LiveSttAdapterError(
        "LIVE_STT_START_FAILED",
        "Live STT adapter has been disposed."
      );
    }

    this.stop();
    this.callbacks = callbacks;

    try {
      const manifest = await this.loadManifest();
      const worker = await this.loadWorker(manifest);
      const sessionId = `live_stt_${Date.now()}_${Math.random()
        .toString(36)
        .slice(2)}`;
      this.sessionId = sessionId;
      await this.requestWorker(worker, { type: "start", sessionId }, `start:${sessionId}`);
      this.capture = await this.startAudioCapture(stream, manifest, sessionId, worker);
    } catch (error) {
      this.stop();
      throw toLiveSttAdapterError(error);
    }
  }

  stop() {
    const sessionId = this.sessionId;
    this.stopAudioCapture();
    this.sessionId = null;

    if (sessionId && this.worker) {
      this.postWorkerMessage(this.worker, { type: "stop", sessionId });
    }
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

  private async loadManifest() {
    if (this.manifest) {
      return this.manifest;
    }

    try {
      this.manifest = await loadSherpaOnnxModelManifest({
        manifestUrl: this.options.manifestUrl ?? defaultSherpaOnnxManifestUrl,
        fetcher: this.options.fetcher
      });
      return this.manifest;
    } catch (error) {
      throw new LiveSttAdapterError(
        "LIVE_STT_MODEL_UNAVAILABLE",
        error instanceof Error
          ? error.message
          : "Live STT model manifest is unavailable."
      );
    }
  }

  private async loadWorker(manifest: ResolvedSherpaOnnxModelManifest) {
    if (this.worker) {
      return this.worker;
    }

    const worker = this.options.createWorker?.() ?? createSherpaWorker();
    worker.onmessage = (event) => this.handleWorkerMessage(event.data);
    worker.onerror = (event) => {
      this.handleWorkerMessage({
        type: "error",
        code: "LIVE_STT_START_FAILED",
        message: event.message || "Live STT worker failed."
      });
    };
    this.worker = worker;
    await this.requestWorker(worker, { type: "load", manifest }, "load");
    return worker;
  }

  private async startAudioCapture(
    stream: MediaStream,
    manifest: ResolvedSherpaOnnxModelManifest,
    sessionId: string,
    worker: SherpaWorker
  ) {
    const context = await this.createAudioContext(manifest);
    const source = context.createMediaStreamSource(stream);
    const processor = context.createScriptProcessor(
      this.options.bufferSize ?? defaultScriptProcessorBufferSize,
      1,
      1
    );
    const output = context.createGain();
    output.gain.value = 0;

    processor.onaudioprocess = (event) => {
      if (this.sessionId !== sessionId) {
        return;
      }

      const input = event.inputBuffer.getChannelData(0);
      const samples = resampleFloat32Audio(
        input,
        context.sampleRate,
        manifest.sampleRate
      );
      this.postWorkerMessage(
        worker,
        {
          type: "audio-frame",
          sessionId,
          sampleRate: manifest.sampleRate,
          samples
        },
        [samples.buffer]
      );
    };

    source.connect(processor);
    processor.connect(output);
    output.connect(context.destination);

    if (context.state === "suspended") {
      await context.resume();
    }

    return { context, source, processor, output };
  }

  private stopAudioCapture() {
    if (!this.capture) {
      return;
    }

    this.capture.processor.onaudioprocess = null;
    disconnectAudioNode(this.capture.source);
    disconnectAudioNode(this.capture.processor);
    disconnectAudioNode(this.capture.output);
    void this.capture.context.close();
    this.capture = null;
  }

  private async createAudioContext(manifest: ResolvedSherpaOnnxModelManifest) {
    if (this.options.createAudioContext) {
      return this.options.createAudioContext(manifest);
    }

    const AudioContextCtor = getAudioContextConstructor();
    if (!AudioContextCtor) {
      throw new LiveSttAdapterError(
        "LIVE_STT_MODEL_UNAVAILABLE",
        "This browser does not support AudioContext for Live STT."
      );
    }

    try {
      return new AudioContextCtor({ sampleRate: manifest.sampleRate });
    } catch {
      return new AudioContextCtor();
    }
  }

  private requestWorker(
    worker: SherpaWorker,
    message: SherpaWorkerInboundMessage,
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
    worker: SherpaWorker,
    message: SherpaWorkerInboundMessage,
    transfer?: Transferable[]
  ) {
    if (transfer) {
      worker.postMessage(message, transfer);
      return;
    }

    worker.postMessage(message);
  }

  private handleWorkerMessage(message: SherpaWorkerOutboundMessage) {
    if (message.type === "loaded") {
      this.resolvePendingRequest("load");
      return;
    }

    if (message.type === "started") {
      this.resolvePendingRequest(`start:${message.sessionId}`);
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

export class SherpaLiveSttAdapter extends SherpaOnnxLiveSttAdapter {}

function createSherpaWorker(): SherpaWorker {
  if (typeof Worker === "undefined") {
    throw new LiveSttAdapterError(
      "LIVE_STT_MODEL_UNAVAILABLE",
      "This browser does not support Web Workers for Live STT."
    );
  }

  return new Worker(
    new URL("./sherpaOnnxWorker.ts?worker_file&type=classic", import.meta.url)
  );
}

function parsePartialTranscriptMessage(
  message: Extract<SherpaWorkerOutboundMessage, { type: "partial" | "final" }>
): LiveSttPartialTranscriptEvent {
  return liveSttPartialTranscriptEventSchema.parse({
    type: "partial-transcript",
    transcript: message.transcript,
    isFinal: message.isFinal,
    confidence: message.confidence
  });
}

export function resampleFloat32Audio(
  input: Float32Array,
  sourceSampleRate: number,
  targetSampleRate: number
) {
  if (sourceSampleRate === targetSampleRate) {
    return new Float32Array(input);
  }

  const sampleRateRatio = sourceSampleRate / targetSampleRate;
  const outputLength = Math.max(1, Math.round(input.length / sampleRateRatio));
  const output = new Float32Array(outputLength);

  for (let outputIndex = 0; outputIndex < outputLength; outputIndex += 1) {
    const sourceIndex = outputIndex * sampleRateRatio;
    const beforeIndex = Math.floor(sourceIndex);
    const afterIndex = Math.min(beforeIndex + 1, input.length - 1);
    const weight = sourceIndex - beforeIndex;
    output[outputIndex] =
      input[beforeIndex]! * (1 - weight) + input[afterIndex]! * weight;
  }

  return output;
}

function getAudioContextConstructor(): AudioContextConstructor | null {
  const globalWindow = window as Window &
    typeof globalThis & {
      webkitAudioContext?: AudioContextConstructor;
    };
  return globalWindow.AudioContext ?? globalWindow.webkitAudioContext ?? null;
}

function disconnectAudioNode(node: AudioNode) {
  try {
    node.disconnect();
  } catch {
    // Some browsers throw when a node is already disconnected.
  }
}

function toLiveSttAdapterError(error: unknown) {
  if (error instanceof LiveSttAdapterError) {
    return error;
  }

  return new LiveSttAdapterError(
    "LIVE_STT_START_FAILED",
    error instanceof Error ? error.message : "Live STT를 시작하지 못했습니다."
  );
}
