import { detectRehearsalCommandCandidate } from "./rehearsalCommands";
import {
  defaultSherpaOnnxManifestUrl,
  loadSherpaOnnxModelManifest,
  type ResolvedSherpaOnnxModelManifest
} from "./sherpaOnnxManifest";

type BrowserEvaluationFixture = {
  id: string;
  referenceTranscript: string;
  expectedKeywords: string[];
  shouldTriggerControl: boolean;
};
type BrowserEvaluationOptions = {
  fixtures: BrowserEvaluationFixture[];
  audioById: Record<string, string>;
  manifestUrl?: string;
  decodeBatchDurationMs?: number;
};
type SherpaWorkerInboundMessage =
  | { type: "load"; manifest: ResolvedSherpaOnnxModelManifest }
  | {
      type: "start";
      sessionId: string;
      decodeBatchSamples: number;
      debugStatsEnabled: boolean;
      biasContext: null;
      decodingMethod: "greedy_search" | "modified_beam_search" | null;
    }
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
  | { type: "debug-stats"; sessionId: string; stats: Record<string, unknown> }
  | { type: "stopped"; sessionId: string }
  | {
      type: "error";
      code: "LIVE_STT_MODEL_UNAVAILABLE" | "LIVE_STT_START_FAILED";
      message: string;
      sessionId?: string;
    };
type SherpaEvaluationWorker = Pick<Worker, "postMessage" | "terminate"> & {
  onmessage:
    | ((event: MessageEvent<SherpaWorkerOutboundMessage>) => void)
    | null;
  onerror: ((event: ErrorEvent) => void) | null;
};
type PendingWorkerMessage = {
  matches: (message: SherpaWorkerOutboundMessage) => boolean;
  resolve: (message: SherpaWorkerOutboundMessage) => void;
  reject: (error: Error) => void;
  timer: ReturnType<typeof setTimeout>;
};
type DecodedAudio = {
  samples: Float32Array;
  sampleRate: number;
  durationMs: number;
};

const workerResponseTimeoutMs = 120_000;
const defaultDecodeBatchDurationMs = 128;

export async function runSherpaBrowserEvaluation(
  options: BrowserEvaluationOptions
) {
  const modelLoadStartedAt = performance.now();
  const manifest = await loadSherpaOnnxModelManifest({
    manifestUrl: options.manifestUrl ?? defaultSherpaOnnxManifestUrl
  });
  const worker = createSherpaWorker();
  const controller = new SherpaEvaluationWorkerController(worker);

  try {
    await controller.waitFor(
      { type: "load", manifest },
      (message) => message.type === "loaded"
    );
    const modelLoadMs = performance.now() - modelLoadStartedAt;
    const audioContext = new AudioContext({ sampleRate: manifest.sampleRate });

    try {
      const predictions = [];
      const decodeBatchSamples = durationMsToSamples(
        options.decodeBatchDurationMs ?? defaultDecodeBatchDurationMs,
        manifest.sampleRate
      );
      for (const fixture of options.fixtures) {
        const wavBase64 = options.audioById[fixture.id];
        if (!wavBase64) {
          throw new Error(`Missing wav audio for fixture ${fixture.id}.`);
        }

        const audio = await decodeAudioBase64(audioContext, wavBase64);
        const normalizedAudio =
          audio.sampleRate === manifest.sampleRate
            ? audio
            : resampleAudio(audio, manifest.sampleRate);
        const transcriptStartedAt = performance.now();
        const transcript = await controller.transcribe({
          manifest,
          samples: normalizedAudio.samples,
          sampleRate: normalizedAudio.sampleRate,
          decodeBatchSamples
        });
        const transcribeMs = performance.now() - transcriptStartedAt;

        predictions.push({
          id: fixture.id,
          transcript,
          triggeredControl: Boolean(
            detectRehearsalCommandCandidate({
              transcript,
              isFinal: true,
              confidence: null
            })
          ),
          transcriptAtMs: Math.round(transcribeMs),
          transcribeMs: Math.round(transcribeMs),
          audioDurationMs: Math.round(normalizedAudio.durationMs),
          sampleRate: normalizedAudio.sampleRate
        });
      }

      return {
        modelId: manifest.modelId,
        device: "wasm",
        modelLoadMs: Math.round(modelLoadMs),
        predictions
      };
    } finally {
      await audioContext.close();
    }
  } finally {
    try {
      worker.postMessage({ type: "dispose" });
    } finally {
      worker.terminate();
    }
  }
}

class SherpaEvaluationWorkerController {
  private readonly pending: PendingWorkerMessage[] = [];
  private readonly listeners: Array<(message: SherpaWorkerOutboundMessage) => void> = [];

  constructor(private readonly worker: SherpaEvaluationWorker) {
    worker.onmessage = (event) => this.handleMessage(event.data);
    worker.onerror = (event) => {
      this.rejectPending(
        new Error(event.message || "Live STT worker failed.")
      );
    };
  }

  async waitFor(
    message: SherpaWorkerInboundMessage,
    matches: (message: SherpaWorkerOutboundMessage) => boolean
  ) {
    const response = this.expect(matches);
    this.worker.postMessage(message);
    return response;
  }

  async transcribe(options: {
    manifest: ResolvedSherpaOnnxModelManifest;
    samples: Float32Array;
    sampleRate: number;
    decodeBatchSamples: number;
  }) {
    const sessionId = `sherpa_eval_${Date.now()}_${Math.random()
      .toString(36)
      .slice(2)}`;
    const transcripts: string[] = [];
    const unsubscribe = this.listen((message) => {
      if (
        (message.type === "partial" || message.type === "final") &&
        message.sessionId === sessionId &&
        message.transcript
      ) {
        transcripts.push(message.transcript);
      }
    });

    try {
      await this.waitFor(
        {
          type: "start",
          sessionId,
          decodeBatchSamples: options.decodeBatchSamples,
          debugStatsEnabled: false,
          biasContext: null,
          decodingMethod: options.manifest.decodingMethod ?? null
        },
        (message) =>
          message.type === "started" && message.sessionId === sessionId
      );
      for (const chunk of chunkSamples(
        options.samples,
        options.decodeBatchSamples
      )) {
        this.worker.postMessage(
          {
            type: "audio-frame",
            sessionId,
            sampleRate: options.sampleRate,
            samples: chunk
          },
          [chunk.buffer]
        );
      }
      await this.waitFor(
        { type: "stop", sessionId },
        (message) =>
          message.type === "stopped" && message.sessionId === sessionId
      );

      return transcripts.at(-1)?.trim() ?? "";
    } finally {
      unsubscribe();
    }
  }

  private listen(listener: (message: SherpaWorkerOutboundMessage) => void) {
    this.listeners.push(listener);
    return () => {
      const index = this.listeners.indexOf(listener);
      if (index >= 0) {
        this.listeners.splice(index, 1);
      }
    };
  }

  private expect(
    matches: (message: SherpaWorkerOutboundMessage) => boolean
  ) {
    return new Promise<SherpaWorkerOutboundMessage>((resolve, reject) => {
      const timer = setTimeout(() => {
        const index = this.pending.findIndex(
          (pendingMessage) => pendingMessage.timer === timer
        );
        if (index >= 0) {
          this.pending.splice(index, 1);
        }
        reject(new Error("Timed out waiting for Live STT worker response."));
      }, workerResponseTimeoutMs);
      this.pending.push({ matches, resolve, reject, timer });
    });
  }

  private handleMessage(message: SherpaWorkerOutboundMessage) {
    for (const listener of [...this.listeners]) {
      listener(message);
    }

    if (message.type === "error") {
      this.rejectPending(new Error(message.message));
      return;
    }

    const index = this.pending.findIndex((pendingMessage) =>
      pendingMessage.matches(message)
    );
    if (index < 0) {
      return;
    }

    const [pendingMessage] = this.pending.splice(index, 1);
    if (!pendingMessage) {
      return;
    }

    clearTimeout(pendingMessage.timer);
    pendingMessage.resolve(message);
  }

  private rejectPending(error: Error) {
    for (const pendingMessage of this.pending.splice(0)) {
      clearTimeout(pendingMessage.timer);
      pendingMessage.reject(error);
    }
  }
}

function createSherpaWorker(): SherpaEvaluationWorker {
  if (typeof Worker === "undefined") {
    throw new Error("This browser does not support Web Workers for Live STT.");
  }

  return new Worker(new URL("./sherpaOnnxWorker.ts", import.meta.url));
}

async function decodeAudioBase64(
  audioContext: AudioContext,
  wavBase64: string
): Promise<DecodedAudio> {
  const audioBuffer = await audioContext.decodeAudioData(
    base64ToArrayBuffer(wavBase64)
  );
  const samples = mixToMono(audioBuffer);
  return {
    samples,
    sampleRate: audioBuffer.sampleRate,
    durationMs: (samples.length / audioBuffer.sampleRate) * 1000
  };
}

function base64ToArrayBuffer(base64: string) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }

  return bytes.buffer;
}

function mixToMono(audioBuffer: AudioBuffer) {
  if (audioBuffer.numberOfChannels === 1) {
    return new Float32Array(audioBuffer.getChannelData(0));
  }

  const samples = new Float32Array(audioBuffer.length);
  for (let channelIndex = 0; channelIndex < audioBuffer.numberOfChannels; channelIndex += 1) {
    const channel = audioBuffer.getChannelData(channelIndex);
    for (let sampleIndex = 0; sampleIndex < samples.length; sampleIndex += 1) {
      samples[sampleIndex] += channel[sampleIndex] ?? 0;
    }
  }

  for (let sampleIndex = 0; sampleIndex < samples.length; sampleIndex += 1) {
    samples[sampleIndex] /= audioBuffer.numberOfChannels;
  }

  return samples;
}

function resampleAudio(audio: DecodedAudio, targetSampleRate: number): DecodedAudio {
  const samples = resampleFloat32Audio(
    audio.samples,
    audio.sampleRate,
    targetSampleRate
  );
  return {
    samples,
    sampleRate: targetSampleRate,
    durationMs: (samples.length / targetSampleRate) * 1000
  };
}

function resampleFloat32Audio(
  input: Float32Array,
  sourceSampleRate: number,
  targetSampleRate: number
) {
  if (sourceSampleRate === targetSampleRate) {
    return new Float32Array(input);
  }

  const ratio = sourceSampleRate / targetSampleRate;
  const outputLength = Math.max(1, Math.round(input.length / ratio));
  const output = new Float32Array(outputLength);
  for (let index = 0; index < outputLength; index += 1) {
    const sourceIndex = index * ratio;
    const left = Math.floor(sourceIndex);
    const right = Math.min(input.length - 1, left + 1);
    const weight = sourceIndex - left;
    output[index] = (input[left] ?? 0) * (1 - weight) + (input[right] ?? 0) * weight;
  }

  return output;
}

function chunkSamples(samples: Float32Array, chunkSize: number) {
  const chunks: Float32Array[] = [];
  for (let offset = 0; offset < samples.length; offset += chunkSize) {
    chunks.push(samples.slice(offset, offset + chunkSize));
  }
  return chunks;
}

function durationMsToSamples(durationMs: number, sampleRate: number) {
  if (!Number.isFinite(durationMs) || durationMs <= 0) {
    return 1;
  }
  if (!Number.isFinite(sampleRate) || sampleRate <= 0) {
    return 1;
  }

  return Math.max(1, Math.round((sampleRate * durationMs) / 1000));
}
