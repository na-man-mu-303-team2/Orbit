import { afterEach, describe, expect, it, vi } from "vitest";
import { MoonshineLiveSttAdapter } from "./moonshineLiveSttAdapter";

describe("MoonshineLiveSttAdapter", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("starts a worker session, segments microphone PCM, and forwards final transcripts", async () => {
    const worker = new FakeMoonshineWorker();
    const audioContext = new FakeAudioContext(1000);
    const transcripts: string[] = [];
    const adapter = new MoonshineLiveSttAdapter({
      createWorker: () => worker,
      createAudioContext: () => audioContext as unknown as AudioContext,
      createAudioWorkletNode: (_context, _name, options) =>
        audioContext.createAudioWorkletNode(options) as unknown as AudioWorkletNode,
      bufferSize: 10,
      sampleRate: 1000,
      vad: {
        silenceThresholdDb: -40,
        preRollMs: 10,
        trailingSilenceMs: 20,
        minSegmentMs: 20,
        maxSegmentMs: 1000
      }
    });

    await adapter.start({ getTracks: () => [] } as unknown as MediaStream, {
      onPartialTranscript: (event) => transcripts.push(event.transcript),
      onError: () => undefined
    });

    audioContext.emitAudio(new Float32Array(10));
    audioContext.emitAudio(new Float32Array(30).fill(0.2));
    audioContext.emitAudio(new Float32Array(20));
    adapter.stop();
    adapter.dispose();

    expect(worker.messages.map((message) => message.type)).toEqual([
      "load",
      "start",
      "audio-segment",
      "stop",
      "dispose"
    ]);
    expect(worker.messages[1]).toMatchObject({
      type: "start",
      sampleRate: 1000
    });
    expect(worker.audioSegments).toHaveLength(1);
    expect(worker.audioSegments[0]?.sampleRate).toBe(1000);
    expect(worker.audioSegments[0]?.maxLength).toBe(1);
    expect(audioContext.audioWorklet!.moduleLoads).toHaveLength(1);
    expect(audioContext.workletNode?.processorOptions).toEqual({ frameSize: 10 });
    expect(audioContext.workletNode?.port.messages).toEqual([{ type: "dispose" }]);
    expect(audioContext.state).toBe("closed");
    expect(transcripts).toEqual(["다음 슬라이드"]);
    expect(worker.isTerminated).toBe(true);
  });

  it("ignores stale worker transcripts after a session stops", async () => {
    const worker = new FakeMoonshineWorker();
    const audioContext = new FakeAudioContext(1000);
    const transcripts: string[] = [];
    const adapter = new MoonshineLiveSttAdapter({
      createWorker: () => worker,
      createAudioContext: () => audioContext as unknown as AudioContext,
      createAudioWorkletNode: (_context, _name, options) =>
        audioContext.createAudioWorkletNode(options) as unknown as AudioWorkletNode,
      sampleRate: 1000
    });

    await adapter.start({ getTracks: () => [] } as unknown as MediaStream, {
      onPartialTranscript: (event) => transcripts.push(event.transcript),
      onError: () => undefined
    });
    const sessionId = readStartedSessionId(worker);
    adapter.stop();
    worker.emitWorkerMessage({
      type: "final",
      sessionId,
      sequenceId: 1,
      transcript: "stale",
      isFinal: true,
      confidence: null
    });
    adapter.dispose();

    expect(transcripts).toEqual([]);
  });

  it("maps worker startup failures to the live STT error callback", async () => {
    const worker = new FakeMoonshineWorker({
      loadError: {
        type: "error",
        code: "LIVE_STT_MODEL_UNAVAILABLE",
        message: "model unavailable"
      }
    });
    const adapter = new MoonshineLiveSttAdapter({
      createWorker: () => worker
    });

    await expect(
      adapter.start({ getTracks: () => [] } as unknown as MediaStream, {
        onPartialTranscript: () => undefined,
        onError: () => undefined
      })
    ).rejects.toMatchObject({
      code: "LIVE_STT_MODEL_UNAVAILABLE"
    });
  });
});

type FakeWorkerMessage = {
  type: string;
  sessionId?: string;
  sequenceId?: number;
  sampleRate?: number;
  samples?: Float32Array;
  maxLength?: number;
};

class FakeMoonshineWorker {
  onmessage: ((event: MessageEvent) => void) | null = null;
  onerror: ((event: ErrorEvent) => void) | null = null;
  messages: FakeWorkerMessage[] = [];
  audioSegments: Array<{
    sessionId: string;
    sequenceId: number;
    sampleRate: number;
    samples: Float32Array;
    maxLength: number;
  }> = [];
  isTerminated = false;

  constructor(
    private readonly options: {
      loadError?: Record<string, unknown>;
    } = {}
  ) {}

  postMessage(
    message: FakeWorkerMessage,
    _transfer?: Transferable[] | StructuredSerializeOptions
  ) {
    this.messages.push(message);

    if (message.type === "load") {
      this.emit(this.options.loadError ?? { type: "loaded" });
      return;
    }

    if (message.type === "start" && message.sessionId) {
      this.emit({ type: "started", sessionId: message.sessionId });
      return;
    }

    if (
      message.type === "audio-segment" &&
      message.sessionId &&
      message.sequenceId !== undefined &&
      typeof message.sampleRate === "number" &&
      message.samples &&
      typeof message.maxLength === "number"
    ) {
      this.audioSegments.push({
        sessionId: message.sessionId,
        sequenceId: message.sequenceId,
        sampleRate: message.sampleRate,
        samples: message.samples,
        maxLength: message.maxLength
      });
      this.emit({
        type: "final",
        sessionId: message.sessionId,
        sequenceId: message.sequenceId,
        transcript: "다음 슬라이드",
        isFinal: true,
        confidence: null
      });
    }
  }

  emitWorkerMessage(data: unknown) {
    this.emit(data);
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
  audioWorklet = new FakeAudioWorklet();
  workletNode: FakeAudioWorkletNode | null = null;

  constructor(readonly sampleRate: number) {}

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

  async addModule(url: string, options?: WorkletOptions) {
    this.moduleLoads.push({ url, options });
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

function readStartedSessionId(worker: FakeMoonshineWorker) {
  const sessionId = worker.messages.find((message) => message.type === "start")
    ?.sessionId;
  if (!sessionId) {
    throw new Error("Expected Moonshine Live STT worker session to be started.");
  }

  return sessionId;
}
