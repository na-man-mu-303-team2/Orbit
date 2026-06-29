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
  processor: FakeScriptProcessorNode | null = null;

  constructor(readonly sampleRate: number) {}

  createMediaStreamSource(_stream: MediaStream) {
    return new FakeAudioNode();
  }

  createScriptProcessor(_bufferSize: number, _inputChannels: number, _outputChannels: number) {
    this.processor = new FakeScriptProcessorNode();
    return this.processor;
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
    this.processor?.onaudioprocess?.({
      inputBuffer: {
        getChannelData: () => samples
      }
    } as unknown as AudioProcessingEvent);
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

class FakeScriptProcessorNode extends FakeAudioNode {
  onaudioprocess: ((event: AudioProcessingEvent) => void) | null = null;
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
