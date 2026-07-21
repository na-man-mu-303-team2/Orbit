import { afterEach, describe, expect, it, vi } from "vitest";
import {
  koreanFillerVerbatimOobPromptVersion,
  OpenAiRealtimeOobFillerPort,
  type RealtimeOobFillerResult,
} from "./openAiRealtimeOobFillerPort";

describe("OpenAiRealtimeOobFillerPort", () => {
  afterEach(() => vi.useRealTimers());

  it("latest audio item만 conversation:none OOB response로 요청한다", async () => {
    const harness = createHarness();
    await harness.ready();

    harness.port.commit("utterance-1");
    harness.peer.dataChannel.emitMessage({
      type: "input_audio_buffer.committed",
      item_id: "audio-item-1",
    });

    expect(harness.peer.dataChannel.sentPayloads).toContainEqual({
      type: "response.create",
      response: {
        conversation: "none",
        output_modalities: ["text"],
        instructions: expect.stringContaining(koreanFillerVerbatimOobPromptVersion),
        metadata: {
          purpose: "filler-verbatim",
          utteranceId: "utterance-1",
          fragmentSequence: 1,
        },
        input: [{ type: "item_reference", id: "audio-item-1" }],
      },
    });
  });

  it("response_id와 utterance metadata로 out-of-order 결과를 correlation한다", async () => {
    const harness = createHarness();
    const results: RealtimeOobFillerResult[] = [];
    harness.port.onResult((result) => results.push(result));
    await harness.ready();

    harness.commit("utterance-1", "audio-1");
    harness.commit("utterance-2", "audio-2");
    harness.responseCreated("response-1", "utterance-1", 1);
    harness.responseCreated("response-2", "utterance-2", 1);
    harness.complete("response-2", "utterance-2", 1, "어 둘째");
    harness.complete("response-1", "utterance-1", 1, "음 첫째");

    expect(results.map((result) => [result.utteranceId, result.transcript])).toEqual([
      ["utterance-2", "어 둘째"],
      ["utterance-1", "음 첫째"],
    ]);
  });

  it("12초 timeout을 안전한 실패 결과로 변환한다", async () => {
    vi.useFakeTimers();
    const harness = createHarness({ responseTimeoutMs: 12_000 });
    const results: RealtimeOobFillerResult[] = [];
    harness.port.onResult((result) => results.push(result));
    await harness.ready();

    harness.commit("utterance-1", "audio-1");
    harness.responseCreated("response-1", "utterance-1", 1);
    harness.advanceNow(12_000);
    vi.advanceTimersByTime(12_000);

    expect(results).toEqual([
      {
        utteranceId: "utterance-1",
        fragmentSequence: 1,
        responseId: "response-1",
        status: "failed",
        latencyMs: 12_000,
        failureCode: "timeout",
      },
    ]);
  });

  it("session model mismatch를 fail-closed 처리한다", async () => {
    const harness = createHarness();
    const start = harness.start();
    await harness.waitForNegotiation();
    harness.peer.dataChannel.emitMessage({
      type: "session.created",
      session: { model: "different-model" },
    });

    await expect(start).rejects.toThrow(/model mismatch/);
  });
});

function createHarness(options: { responseTimeoutMs?: number } = {}) {
  let now = 1_000;
  const peer = new FakePeerConnection();
  const port = new OpenAiRealtimeOobFillerPort({
    projectId: "project_1",
    createPeerConnection: () => peer,
    fetcher: createFetcher(),
    now: () => now,
    responseTimeoutMs: options.responseTimeoutMs,
  });
  const audioSource = {
    getAudioTracks: () => [{ readyState: "live" } as MediaStreamTrack],
  } as unknown as MediaStream;
  const start = () => port.start(audioSource);
  const waitForNegotiation = () =>
    vi.waitFor(() => expect(peer.remoteDescription).not.toBeNull());
  const ready = async () => {
    const promise = start();
    await waitForNegotiation();
    peer.dataChannel.emitMessage({
      type: "session.created",
      session: { model: "gpt-realtime-2.1" },
    });
    await promise;
  };
  const commit = (utteranceId: string, itemId: string) => {
    port.commit(utteranceId);
    peer.dataChannel.emitMessage({
      type: "input_audio_buffer.committed",
      item_id: itemId,
    });
  };
  const responseCreated = (
    responseId: string,
    utteranceId: string,
    fragmentSequence: number,
  ) => {
    peer.dataChannel.emitMessage({
      type: "response.created",
      response: {
        id: responseId,
        metadata: { utteranceId, fragmentSequence },
      },
    });
  };
  const complete = (
    responseId: string,
    utteranceId: string,
    fragmentSequence: number,
    transcript: string,
  ) => {
    peer.dataChannel.emitMessage({
      type: "response.output_text.delta",
      response_id: responseId,
      delta: transcript,
    });
    peer.dataChannel.emitMessage({
      type: "response.done",
      response: {
        id: responseId,
        status: "completed",
        metadata: { utteranceId, fragmentSequence },
        usage: { input_tokens: 12, output_tokens: 3 },
      },
    });
  };

  return {
    port,
    peer,
    start,
    ready,
    waitForNegotiation,
    commit,
    responseCreated,
    complete,
    advanceNow: (durationMs: number) => {
      now += durationMs;
    },
  };
}

class FakeDataChannel {
  private readonly listeners = new Map<string, EventListener[]>();
  readonly sentPayloads: unknown[] = [];
  readyState: RTCDataChannelState = "open";
  addEventListener(type: string, listener: EventListener) {
    this.listeners.set(type, [...(this.listeners.get(type) ?? []), listener]);
  }
  close() {
    this.readyState = "closed";
  }
  send(data: string) {
    this.sentPayloads.push(JSON.parse(data));
  }
  emitMessage(payload: unknown) {
    const event = { data: JSON.stringify(payload) } as MessageEvent;
    for (const listener of this.listeners.get("message") ?? []) listener(event);
  }
}

class FakePeerConnection {
  readonly dataChannel = new FakeDataChannel();
  remoteDescription: RTCSessionDescriptionInit | null = null;
  addTrack() {
    return {} as RTCRtpSender;
  }
  createDataChannel() {
    return this.dataChannel;
  }
  async createOffer() {
    return { type: "offer" as const, sdp: "offer-sdp" };
  }
  async setLocalDescription() {}
  async setRemoteDescription(description: RTCSessionDescriptionInit) {
    this.remoteDescription = description;
  }
  close() {}
}

function createFetcher() {
  return vi.fn(async (url: string | URL | Request) => {
    if (String(url).includes("oob-client-secret")) {
      return new Response(
        JSON.stringify({
          clientSecret: "ek_oob",
          expiresAt: 1_790_000_000,
          model: "gpt-realtime-2.1",
        }),
      );
    }
    return new Response("answer-sdp");
  }) as unknown as typeof fetch;
}
