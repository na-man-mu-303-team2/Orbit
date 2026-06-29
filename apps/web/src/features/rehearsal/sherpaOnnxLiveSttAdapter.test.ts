import { describe, expect, it, vi } from "vitest";
import {
  SherpaOnnxLiveSttAdapter,
  resampleFloat32Audio
} from "./sherpaOnnxLiveSttAdapter";
import type { SherpaOnnxModelManifest } from "./sherpaOnnxManifest";

describe("SherpaOnnxLiveSttAdapter", () => {
  it("loads the manifest, starts a worker session, and forwards partial transcript events", async () => {
    const calls: string[] = [];
    const worker = new FakeSherpaWorker();
    const audioContext = new FakeAudioContext(48000);
    const partials: string[] = [];
    const errors: string[] = [];
    const adapter = new SherpaOnnxLiveSttAdapter({
      manifestUrl: "/models/live-stt/korean/manifest.json",
      fetcher: vi.fn(async (input: RequestInfo | URL) => {
        calls.push(String(input));
        return jsonResponse(manifestFixture());
      }) as typeof fetch,
      createWorker: () => worker,
      createAudioContext: () => audioContext as unknown as AudioContext,
      createAudioWorkletNode: (_context, _name, options) =>
        audioContext.createAudioWorkletNode(options) as unknown as AudioWorkletNode,
      bufferSize: 4
    });

    await adapter.start({ getTracks: () => [] } as unknown as MediaStream, {
      onPartialTranscript: (event) => partials.push(event.transcript),
      onError: (error) => errors.push(error.code)
    });

    audioContext.emitAudio(new Float32Array([0, 0.5, 1, 0]));
    adapter.stop();
    adapter.dispose();

    expect(calls).toEqual(["/models/live-stt/korean/manifest.json"]);
    expect(worker.messages.map((message) => message.type)).toEqual([
      "load",
      "start",
      "audio-frame",
      "stop",
      "dispose"
    ]);
    expect(worker.audioFrames).toHaveLength(1);
    expect(worker.audioFrames[0]?.sampleRate).toBe(16000);
    expect(audioContext.audioWorklet!.moduleLoads).toHaveLength(1);
    expect(audioContext.audioWorklet!.moduleLoads[0]?.options).toEqual({
      credentials: "same-origin"
    });
    expect(audioContext.workletNode?.processorOptions).toEqual({ frameSize: 4 });
    expect(audioContext.workletNode?.port.messages).toEqual([{ type: "dispose" }]);
    expect(audioContext.state).toBe("closed");
    expect(partials).toEqual(["오르빗 실시간 음성 인식"]);
    expect(errors).toEqual([]);
    expect(worker.isTerminated).toBe(true);
  });

  it("maps an unavailable manifest to the live STT model unavailable error", async () => {
    const adapter = new SherpaOnnxLiveSttAdapter({
      manifestUrl: "/missing-manifest.json",
      fetcher: vi.fn(async () => new Response("missing", { status: 404 })) as typeof fetch,
      createWorker: () => new FakeSherpaWorker()
    });

    await expect(
      adapter.start({ getTracks: () => [] } as unknown as MediaStream, {
        onPartialTranscript: () => undefined,
        onError: () => undefined
      })
    ).rejects.toMatchObject({ code: "LIVE_STT_MODEL_UNAVAILABLE" });
  });

  it("maps unsupported AudioWorklet capture to the live STT model unavailable error", async () => {
    const audioContext = new FakeAudioContext(48000, {
      supportsAudioWorklet: false
    });
    const adapter = new SherpaOnnxLiveSttAdapter({
      manifestUrl: "/models/live-stt/korean/manifest.json",
      fetcher: vi.fn(async () => jsonResponse(manifestFixture())) as typeof fetch,
      createWorker: () => new FakeSherpaWorker(),
      createAudioContext: () => audioContext as unknown as AudioContext
    });

    await expect(
      adapter.start({ getTracks: () => [] } as unknown as MediaStream, {
        onPartialTranscript: () => undefined,
        onError: () => undefined
      })
    ).rejects.toMatchObject({ code: "LIVE_STT_MODEL_UNAVAILABLE" });
    expect(audioContext.state).toBe("closed");
  });

  it("maps AudioWorklet module load failures to the live STT start failed error", async () => {
    const audioContext = new FakeAudioContext(48000, {
      addModuleError: new Error("module failed")
    });
    const adapter = new SherpaOnnxLiveSttAdapter({
      manifestUrl: "/models/live-stt/korean/manifest.json",
      fetcher: vi.fn(async () => jsonResponse(manifestFixture())) as typeof fetch,
      createWorker: () => new FakeSherpaWorker(),
      createAudioContext: () => audioContext as unknown as AudioContext
    });

    await expect(
      adapter.start({ getTracks: () => [] } as unknown as MediaStream, {
        onPartialTranscript: () => undefined,
        onError: () => undefined
      })
    ).rejects.toMatchObject({ code: "LIVE_STT_START_FAILED" });
    expect(audioContext.state).toBe("closed");
  });

  it("reports AudioWorklet processor failures through the live STT error callback", async () => {
    const worker = new FakeSherpaWorker();
    const audioContext = new FakeAudioContext(48000);
    const errors: string[] = [];
    const adapter = new SherpaOnnxLiveSttAdapter({
      manifestUrl: "/models/live-stt/korean/manifest.json",
      fetcher: vi.fn(async () => jsonResponse(manifestFixture())) as typeof fetch,
      createWorker: () => worker,
      createAudioContext: () => audioContext as unknown as AudioContext,
      createAudioWorkletNode: (_context, _name, options) =>
        audioContext.createAudioWorkletNode(options) as unknown as AudioWorkletNode
    });

    await adapter.start({ getTracks: () => [] } as unknown as MediaStream, {
      onPartialTranscript: () => undefined,
      onError: (error) => errors.push(error.code)
    });

    audioContext.workletNode?.emitProcessorError();

    expect(errors).toEqual(["LIVE_STT_START_FAILED"]);
    expect(worker.messages.map((message) => message.type)).toEqual([
      "load",
      "start",
      "stop"
    ]);
    expect(audioContext.state).toBe("closed");
  });

  it("resamples microphone PCM to the model sample rate", () => {
    const output = resampleFloat32Audio(new Float32Array([0, 0.5, 1, 0]), 4, 2);

    expect(Array.from(output)).toEqual([0, 1]);
  });
});

class FakeSherpaWorker {
  onmessage: ((event: MessageEvent) => void) | null = null;
  onerror: ((event: ErrorEvent) => void) | null = null;
  messages: Array<{ type: string }> = [];
  audioFrames: Array<{ sampleRate: number; samples: Float32Array }> = [];
  isTerminated = false;

  postMessage(
    message: {
      type: string;
      sessionId?: string;
      sampleRate?: number;
      samples?: Float32Array;
    },
    _transfer?: Transferable[] | StructuredSerializeOptions
  ) {
    this.messages.push(message);

    if (message.type === "load") {
      this.emit({ type: "loaded", modelId: "korean", version: "2024-06-16" });
      return;
    }

    if (message.type === "start" && message.sessionId) {
      this.emit({ type: "started", sessionId: message.sessionId });
      return;
    }

    if (
      message.type === "audio-frame" &&
      message.sessionId &&
      typeof message.sampleRate === "number" &&
      message.samples
    ) {
      this.audioFrames.push({
        sampleRate: message.sampleRate,
        samples: message.samples
      });
      this.emit({
        type: "partial",
        sessionId: message.sessionId,
        transcript: "오르빗 실시간 음성 인식",
        isFinal: false,
        confidence: 0.91
      });
    }
  }

  terminate() {
    this.isTerminated = true;
  }

  private emit(data: unknown) {
    this.onmessage?.({ data } as MessageEvent);
  }
}

class FakeAudioContext {
  state: AudioContextState = "running";
  destination = new FakeAudioNode();
  audioWorklet?: FakeAudioWorklet;
  workletNode: FakeAudioWorkletNode | null = null;

  constructor(
    readonly sampleRate: number,
    options: { supportsAudioWorklet?: boolean; addModuleError?: Error } = {}
  ) {
    if (options.supportsAudioWorklet !== false) {
      this.audioWorklet = new FakeAudioWorklet(options.addModuleError);
    }
  }

  createMediaStreamSource(_stream: MediaStream) {
    return new FakeAudioNode();
  }

  createAudioWorkletNode(options: AudioWorkletNodeOptions) {
    this.workletNode = new FakeAudioWorkletNode(options.processorOptions);
    return this.workletNode;
  }

  createGain() {
    return new FakeGainNode();
  }

  async resume() {
    this.state = "running";
  }

  async close() {
    this.state = "closed";
  }

  emitAudio(samples: Float32Array) {
    this.workletNode?.port.emit({
      type: "audio-frame",
      sampleRate: this.sampleRate,
      samples
    });
  }
}

class FakeAudioWorklet {
  moduleLoads: Array<{ url: string; options?: WorkletOptions }> = [];

  constructor(private readonly addModuleError?: Error) {}

  async addModule(url: string, options?: WorkletOptions) {
    this.moduleLoads.push({ url, options });

    if (this.addModuleError) {
      throw this.addModuleError;
    }
  }
}

class FakeAudioNode {
  connect(_node?: unknown) {
    return _node;
  }

  disconnect() {}
}

class FakeGainNode extends FakeAudioNode {
  gain = { value: 1 };
}

class FakeAudioWorkletNode extends FakeAudioNode {
  port = new FakeMessagePort();
  onprocessorerror: ((event: Event) => void) | null = null;

  constructor(readonly processorOptions: unknown) {
    super();
  }

  emitProcessorError() {
    this.onprocessorerror?.(new Event("processorerror"));
  }
}

class FakeMessagePort {
  onmessage: ((event: MessageEvent) => void) | null = null;
  messages: unknown[] = [];

  postMessage(message: unknown) {
    this.messages.push(message);
  }

  start() {}

  emit(data: unknown) {
    this.onmessage?.({ data } as MessageEvent);
  }
}

function manifestFixture(): SherpaOnnxModelManifest {
  return {
    provider: "sherpa-onnx",
    modelId: "sherpa-onnx-streaming-zipformer-korean-2024-06-16",
    version: "2024-06-16",
    baseUrl: ".",
    sampleRate: 16000,
    runtime: {
      script: "sherpa-onnx-wasm-main-asr.js",
      wasm: "sherpa-onnx-wasm-main-asr.wasm",
      data: "sherpa-onnx-wasm-main-asr.data"
    },
    model: {
      encoder: "encoder.onnx",
      decoder: "decoder.onnx",
      joiner: "joiner.onnx",
      tokens: "tokens.txt"
    }
  };
}

function jsonResponse(payload: unknown) {
  return new Response(JSON.stringify(payload), {
    headers: { "content-type": "application/json" }
  });
}
