import { afterEach, describe, expect, it, vi } from "vitest";
import type { LiveSttAudioLevelEvent } from "../liveStt";
import type {
  LiveSttResult,
  LiveSttSpeechActivityEvent,
} from "./liveSttPort";
import { OpenAiRealtimeLiveSttPort } from "./openAiRealtimeLiveSttPort";

describe("OpenAiRealtimeLiveSttPort", () => {
  afterEach(() => vi.useRealTimers());

  it("session 검증과 calibration clear 뒤에만 start를 완료한다", async () => {
    const harness = createHarness();
    const start = harness.start();

    await harness.waitForNegotiation();
    harness.openAndVerifySession();
    let resolved = false;
    void start.then(() => { resolved = true; });
    await Promise.resolve();
    expect(resolved).toBe(false);

    harness.calibrate();
    await start;

    expect(harness.peer.dataChannel.sentPayloads).toContainEqual({
      type: "input_audio_buffer.clear"
    });
    expect(harness.port.readDiagnosticsForTest().map((event) => event.type))
      .toContain("session.configuration_verified");
  });

  it("partial은 즉시 전달하고 final은 item/content identity와 commit 순서를 유지한다", async () => {
    const harness = createHarness();
    const results: LiveSttResult[] = [];
    harness.port.onResult((result) => results.push(result));
    await harness.ready();

    harness.speakAndCommit("item_1");
    harness.peer.dataChannel.emitMessage({
      type: "conversation.item.input_audio_transcription.delta",
      item_id: "item_1",
      content_index: 0,
      delta: "오르"
    });
    harness.peer.dataChannel.emitMessage({
      type: "conversation.item.input_audio_transcription.completed",
      item_id: "item_1",
      content_index: 0,
      transcript: "오르빗"
    });

    expect(results[0]).toMatchObject({
      text: "오르",
      isFinal: false,
      utteranceId: "item_1:0",
      resultRevision: 1
    });
    expect(results[1]).toMatchObject({
      text: "오르빗",
      isFinal: true,
      utteranceId: "item_1:0",
      resultRevision: 2,
      metadata: {
        coachingUtteranceId: "coaching-1",
        commitSequence: 1,
        contentIndex: 0,
        finalReorderTimedOut: false
      }
    });
  });

  it("VAD confirmation보다 첫 threshold crossing을 발화 onset으로 전달한다", async () => {
    const harness = createHarness();
    const events: LiveSttSpeechActivityEvent[] = [];
    harness.port.onSpeechActivity((event) => events.push(event));
    await harness.ready();

    harness.speakAndCommit("item_1");

    expect(events).toEqual([
      { type: "speech-started", utteranceId: "coaching-1", occurredAtMs: 1_550 },
      { type: "speech-ended", utteranceId: "coaching-1", occurredAtMs: 2_500, reason: "silence" },
    ]);
  });

  it("onset, first delta, commit, final latency를 transcript 없이 집계한다", async () => {
    const harness = createHarness();
    await harness.ready();
    harness.speakAndCommit("item_1");
    harness.advanceNow(100);
    harness.peer.dataChannel.emitMessage({
      type: "conversation.item.input_audio_transcription.delta",
      item_id: "item_1",
      content_index: 0,
      delta: "음",
    });
    harness.advanceNow(400);
    harness.complete("item_1", "음 결과");

    expect(harness.port.readMetricsForTest()).toEqual({
      turns: [
        {
          sequence: 1,
          speechStartedAtMs: 1_550,
          committedAtMs: 2_500,
          firstDeltaAtMs: 2_600,
          completedAtMs: 3_000,
        },
      ],
      summary: {
        completedTurns: 1,
        firstDeltaLatencyMedianMs: 1_050,
        firstDeltaLatencyP95Ms: 1_050,
        commitToFinalMedianMs: 500,
        commitToFinalP95Ms: 500,
        onsetToFinalMedianMs: 1_450,
        onsetToFinalP95Ms: 1_450,
      },
    });
    expect(JSON.stringify(harness.port.readDiagnosticsForTest())).not.toContain(
      "음 결과",
    );
  });

  it("out-of-order final을 commit sequence 순서로 방출한다", async () => {
    const harness = createHarness();
    const finals: string[] = [];
    harness.port.onResult((result) => {
      if (result.isFinal) finals.push(result.text);
    });
    await harness.ready();

    harness.speakAndCommit("item_1");
    harness.speakAndCommit("item_2");
    harness.complete("item_2", "둘째");
    harness.complete("item_1", "첫째");

    expect(finals).toEqual(["첫째", "둘째"]);
  });

  it("선행 final 누락 시 timeout metadata와 다음 final을 진행한다", async () => {
    vi.useFakeTimers();
    const harness = createHarness({ finalReorderTimeoutMs: 2000 });
    const finals: LiveSttResult[] = [];
    harness.port.onResult((result) => {
      if (result.isFinal) finals.push(result);
    });
    await harness.ready();

    harness.speakAndCommit("item_1");
    harness.speakAndCommit("item_2");
    harness.complete("item_2", "둘째");
    vi.advanceTimersByTime(2000);

    expect(finals).toHaveLength(1);
    expect(finals[0]?.metadata?.finalReorderTimedOut).toBe(true);
  });

  it("명시적으로 다른 session model/delay를 거부한다", async () => {
    const harness = createHarness();
    const start = harness.start();
    await harness.waitForNegotiation();
    harness.peer.dataChannel.emitOpen();
    harness.peer.dataChannel.emitMessage({
      type: "session.updated",
      session: {
        audio: {
          input: {
            transcription: { model: "gpt-realtime-whisper", delay: "high" }
          }
        }
      }
    });

    await expect(start).rejects.toThrow(/configuration mismatch/);
  });

  it.each([
    { readyState: "ended", enabled: true, muted: false },
    { readyState: "live", enabled: false, muted: false },
    { readyState: "live", enabled: true, muted: true }
  ] as const)("사용할 수 없는 audio track을 시작 전에 거부한다: %o", async (state) => {
    const harness = createHarness({ track: state });
    await expect(harness.start()).rejects.toMatchObject({ code: "start_failed" });
    expect(harness.fetcher).not.toHaveBeenCalled();
  });

  it("시작 후 track 종료와 data channel close를 runtime error로 전달한다", async () => {
    const harness = createHarness();
    const errors: string[] = [];
    harness.port.onError((error) => errors.push(error.message));
    await harness.ready();

    harness.track.end();
    harness.peer.dataChannel.emitClose();

    expect(errors).toHaveLength(2);
  });

  it("gpt-realtime-whisper에 prompt를 보내지 않고 bias phrase는 local matcher용으로 보존한다", async () => {
    const harness = createHarness();
    const start = harness.start([{ text: " 오르빗 ", weight: 1 }]);
    await harness.waitForNegotiation();
    harness.openAndVerifySession();
    harness.calibrate();
    await start;
    harness.port.updateBiasPhrases([{ text: "다음  슬라이드", weight: 0.7 }]);

    expect(harness.port.readBiasPhrasesForTest()).toEqual([
      { text: "다음 슬라이드", weight: 0.7 }
    ]);
    const sessionUpdate = harness.peer.dataChannel.sentPayloads[0] as Record<string, unknown>;
    expect(JSON.stringify(sessionUpdate)).not.toContain("prompt");
  });
});

function createHarness(options: {
  finalReorderTimeoutMs?: number;
  track?: { readyState: MediaStreamTrackState; enabled: boolean; muted: boolean };
} = {}) {
  let nextUtteranceId = 1;
  let now = 0;
  let meterCallback: ((event: LiveSttAudioLevelEvent) => void) | undefined;
  const peer = new FakePeerConnection();
  const track = new FakeTrack(options.track);
  const fetcher = createFetcher();
  const port = new OpenAiRealtimeLiveSttPort({
    projectId: "project_real_1",
    createAudioLevelMeter: (_stream, callback) => {
      meterCallback = callback;
      return { stop() {} };
    },
    createPeerConnection: () => peer,
    fetcher,
    createUtteranceId: () => `coaching-${nextUtteranceId++}`,
    now: () => now,
    noiseCalibrationMs: 1500,
    finalReorderTimeoutMs: options.finalReorderTimeoutMs
  });
  const audioSource = {
    getAudioTracks: () => [track as unknown as MediaStreamTrack]
  } as unknown as MediaStream;

  const emitLevel = (rmsDb: number) => meterCallback?.({
    type: "audio-level",
    rms: 0.01,
    peak: 0.02,
    rmsDb,
    peakDb: rmsDb + 3,
    isLikelySilence: rmsDb < -50
  });
  const start = (biasPhrases: Array<{ text: string; weight: number }> = []) =>
    port.start({ language: "ko", audioSource, biasPhrases });
  const waitForNegotiation = () => vi.waitFor(() => {
    expect(peer.remoteDescription).not.toBeNull();
  });
  const openAndVerifySession = () => {
    peer.dataChannel.emitOpen();
    peer.dataChannel.emitMessage({
      type: "session.updated",
      session: {
        audio: {
          input: {
            transcription: { model: "gpt-realtime-whisper", delay: "xhigh" }
          }
        }
      }
    });
  };
  const calibrate = () => {
    emitLevel(-55);
    now = 1500;
    emitLevel(-55);
  };
  const ready = async () => {
    const promise = start();
    await waitForNegotiation();
    openAndVerifySession();
    calibrate();
    await promise;
  };
  const speakAndCommit = (itemId: string) => {
    now += 50;
    emitLevel(-30);
    now += 250;
    emitLevel(-30);
    now += 700;
    emitLevel(-60);
    peer.dataChannel.emitMessage({ type: "input_audio_buffer.committed", item_id: itemId });
  };
  const complete = (itemId: string, transcript: string) => {
    peer.dataChannel.emitMessage({
      type: "conversation.item.input_audio_transcription.completed",
      item_id: itemId,
      content_index: 0,
      transcript
    });
  };

  return {
    port,
    peer,
    track,
    fetcher,
    start,
    ready,
    waitForNegotiation,
    openAndVerifySession,
    calibrate,
    speakAndCommit,
    complete,
    advanceNow: (durationMs: number) => {
      now += durationMs;
    }
  };
}

class FakeTrack {
  readyState: MediaStreamTrackState;
  enabled: boolean;
  muted: boolean;
  private readonly listeners = new Map<string, EventListener[]>();

  constructor(state?: { readyState: MediaStreamTrackState; enabled: boolean; muted: boolean }) {
    this.readyState = state?.readyState ?? "live";
    this.enabled = state?.enabled ?? true;
    this.muted = state?.muted ?? false;
  }
  addEventListener(type: string, listener: EventListener) {
    this.listeners.set(type, [...(this.listeners.get(type) ?? []), listener]);
  }
  end() {
    this.readyState = "ended";
    for (const listener of this.listeners.get("ended") ?? []) listener(new Event("ended"));
  }
}

class FakeDataChannel {
  private readonly listeners = new Map<string, EventListener[]>();
  readonly sentPayloads: unknown[] = [];
  readyState: RTCDataChannelState = "connecting";
  addEventListener(type: string, listener: EventListener) {
    this.listeners.set(type, [...(this.listeners.get(type) ?? []), listener]);
  }
  close() { this.readyState = "closed"; }
  send(data: string) { this.sentPayloads.push(JSON.parse(data)); }
  emitOpen() {
    this.readyState = "open";
    for (const listener of this.listeners.get("open") ?? []) listener(new Event("open"));
  }
  emitClose() {
    this.readyState = "closed";
    for (const listener of this.listeners.get("close") ?? []) listener(new Event("close"));
  }
  emitMessage(payload: unknown) {
    const event = { data: JSON.stringify(payload) } as MessageEvent;
    for (const listener of this.listeners.get("message") ?? []) listener(event);
  }
}

class FakePeerConnection {
  readonly dataChannel = new FakeDataChannel();
  remoteDescription: RTCSessionDescriptionInit | null = null;
  addTrack() { return {} as RTCRtpSender; }
  createDataChannel() { return this.dataChannel as unknown as RTCDataChannel; }
  async createOffer() { return { type: "offer" as const, sdp: "offer-sdp" }; }
  async setLocalDescription() {}
  async setRemoteDescription(description: RTCSessionDescriptionInit) {
    this.remoteDescription = description;
  }
  close() {}
}

function createFetcher() {
  return vi.fn(async (url: string | URL | Request) => {
    if (String(url).includes("client-secret")) {
      return new Response(JSON.stringify({
        clientSecret: "ek_test",
        expiresAt: 1790000000,
        model: "gpt-realtime-whisper",
        delay: "xhigh"
      }));
    }
    return new Response("answer-sdp");
  }) as unknown as typeof fetch;
}
