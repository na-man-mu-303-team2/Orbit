import {
  realtimeOobClientSecretResponseSchema,
  type RealtimeOobClientSecretResponse,
} from "@orbit/shared";

type RealtimeDataChannel = {
  addEventListener: (
    type: "close" | "error" | "message" | "open",
    listener: (event: Event) => void,
  ) => void;
  close: () => void;
  readyState?: RTCDataChannelState;
  send: (data: string) => void;
};

type RealtimePeerConnection = {
  addTrack: (track: MediaStreamTrack, ...streams: MediaStream[]) => RTCRtpSender;
  close: () => void;
  createDataChannel: (label: string) => RealtimeDataChannel;
  createOffer: () => Promise<RTCSessionDescriptionInit>;
  setLocalDescription: (description: RTCSessionDescriptionInit) => Promise<void>;
  setRemoteDescription: (description: RTCSessionDescriptionInit) => Promise<void>;
};

export const koreanFillerVerbatimOobPromptVersion =
  "korean-filler-verbatim-oob-v1" as const;

export const koreanFillerVerbatimOobInstructions = `${koreanFillerVerbatimOobPromptVersion}
한국어 발화를 들린 그대로 축어 전사하세요.
음, 어, 으, 아 같은 머뭇거림과 반복, 말더듬, 문장 재시작을 보존하세요.
문법이나 표현을 교정하지 말고, 들리지 않은 단어 또는 습관어를 추측해 추가하지 마세요.
설명 없이 전사 텍스트만 출력하세요.`;

export type RealtimeOobFillerResult = {
  utteranceId: string;
  fragmentSequence: number;
  responseId: string | null;
  status: "completed" | "failed";
  latencyMs: number;
  transcript?: string;
  inputTokens?: number;
  outputTokens?: number;
  failureCode?: "connection" | "response-error" | "timeout";
};

export type RealtimeOobFillerPort = {
  start: (audioSource: MediaStream) => Promise<void>;
  commit: (utteranceId: string) => void;
  stop: () => Promise<void>;
  drainAndStop: () => Promise<void>;
  onResult: (
    callback: (result: RealtimeOobFillerResult) => void,
  ) => () => void;
};

type PendingCommit = {
  utteranceId: string;
  fragmentSequence: number;
  committedAtMs: number;
};

type PendingResponse = PendingCommit & {
  responseId: string | null;
  transcript: string;
  timeoutId: ReturnType<typeof setTimeout>;
};

type OpenAiRealtimeOobFillerPortOptions = {
  projectId: string;
  createPeerConnection?: () => RealtimePeerConnection;
  fetcher?: typeof fetch;
  now?: () => number;
  responseTimeoutMs?: number;
  readinessTimeoutMs?: number;
};

export class OpenAiRealtimeOobFillerPort implements RealtimeOobFillerPort {
  private readonly projectId: string;
  private readonly createPeerConnection: () => RealtimePeerConnection;
  private readonly fetcher: typeof fetch;
  private readonly now: () => number;
  private readonly responseTimeoutMs: number;
  private readonly readinessTimeoutMs: number;
  private readonly subscribers = new Set<
    (result: RealtimeOobFillerResult) => void
  >();
  private readonly pendingCommits: PendingCommit[] = [];
  private readonly pendingByResponseId = new Map<string, PendingResponse>();
  private readonly pendingWithoutResponseId: PendingResponse[] = [];
  private readonly nextFragmentSequenceByUtterance = new Map<string, number>();
  private readonly drainResolvers = new Set<() => void>();
  private peerConnection: RealtimePeerConnection | null = null;
  private dataChannel: RealtimeDataChannel | null = null;
  private token: RealtimeOobClientSecretResponse | null = null;
  private readyResolve: (() => void) | null = null;
  private readyReject: ((error: Error) => void) | null = null;
  private readyTimeoutId: ReturnType<typeof setTimeout> | null = null;
  private running = false;

  constructor(options: OpenAiRealtimeOobFillerPortOptions) {
    this.projectId = options.projectId;
    this.createPeerConnection =
      options.createPeerConnection ?? createDefaultPeerConnection;
    this.fetcher = options.fetcher ?? defaultFetch;
    this.now = options.now ?? (() => Date.now());
    this.responseTimeoutMs = options.responseTimeoutMs ?? 12_000;
    this.readinessTimeoutMs = options.readinessTimeoutMs ?? 10_000;
  }

  async start(audioSource: MediaStream) {
    const audioTrack = audioSource.getAudioTracks()[0];
    if (!audioTrack || audioTrack.readyState === "ended") {
      throw new Error("Realtime OOB에 사용할 마이크 트랙이 없습니다.");
    }
    await this.stop();
    this.running = true;
    try {
      this.token = await this.fetchClientSecret();
      const ready = this.createReadyPromise();
      const peerConnection = this.createPeerConnection();
      this.peerConnection = peerConnection;
      peerConnection.addTrack(audioTrack, audioSource);
      const dataChannel = peerConnection.createDataChannel("oai-events");
      this.dataChannel = dataChannel;
      dataChannel.addEventListener("message", this.handleMessage);
      dataChannel.addEventListener("error", this.handleConnectionFailure);
      dataChannel.addEventListener("close", this.handleConnectionFailure);

      const offer = await peerConnection.createOffer();
      if (!offer.sdp) throw new Error("Realtime OOB SDP offer가 없습니다.");
      await peerConnection.setLocalDescription(offer);
      const response = await this.fetcher(
        "https://api.openai.com/v1/realtime/calls",
        {
          body: offer.sdp,
          headers: {
            Authorization: `Bearer ${this.token.clientSecret}`,
            "Content-Type": "application/sdp",
          },
          method: "POST",
        },
      );
      if (!response.ok) {
        throw new Error(`Realtime OOB SDP handshake failed: ${response.status}`);
      }
      await peerConnection.setRemoteDescription({
        type: "answer",
        sdp: await response.text(),
      });
      await ready;
    } catch (error) {
      await this.stop();
      throw error;
    }
  }

  commit(utteranceId: string) {
    if (!this.running || !isOpen(this.dataChannel)) {
      this.emit({
        utteranceId,
        fragmentSequence: this.nextFragmentSequence(utteranceId),
        responseId: null,
        status: "failed",
        latencyMs: 0,
        failureCode: "connection",
      });
      return;
    }
    const pending: PendingCommit = {
      utteranceId,
      fragmentSequence: this.nextFragmentSequence(utteranceId),
      committedAtMs: this.now(),
    };
    this.pendingCommits.push(pending);
    this.send({ type: "input_audio_buffer.commit" });
  }

  async stop() {
    this.running = false;
    this.rejectReady(new Error("Realtime OOB 시작이 중단되었습니다."));
    this.failAllPending("connection");
    this.dataChannel?.close();
    this.dataChannel = null;
    this.peerConnection?.close();
    this.peerConnection = null;
    this.token = null;
    this.pendingCommits.length = 0;
    this.nextFragmentSequenceByUtterance.clear();
    this.resolveDrainsIfIdle();
  }

  async drainAndStop() {
    if (this.hasPendingWork()) {
      await new Promise<void>((resolve) => {
        const timeoutId = setTimeout(
          () => {
            this.drainResolvers.delete(onDrained);
            resolve();
          },
          this.responseTimeoutMs + 500,
        );
        const onDrained = () => {
          clearTimeout(timeoutId);
          resolve();
        };
        this.drainResolvers.add(onDrained);
      });
    }
    await this.stop();
  }

  onResult(callback: (result: RealtimeOobFillerResult) => void) {
    this.subscribers.add(callback);
    return () => this.subscribers.delete(callback);
  }

  private async fetchClientSecret() {
    const response = await this.fetcher(
      `/api/v1/projects/${encodeURIComponent(this.projectId)}/realtime-transcription/oob-client-secret`,
      { credentials: "include", method: "POST" },
    );
    if (!response.ok) {
      throw new Error(`Realtime OOB client secret request failed: ${response.status}`);
    }
    return realtimeOobClientSecretResponseSchema.parse(await response.json());
  }

  private createReadyPromise() {
    const ready = new Promise<void>((resolve, reject) => {
      this.readyResolve = resolve;
      this.readyReject = reject;
    });
    this.readyTimeoutId = setTimeout(
      () => this.rejectReady(new Error("Realtime OOB readiness timeout입니다.")),
      this.readinessTimeoutMs,
    );
    return ready;
  }

  private readonly handleMessage = (event: Event) => {
    let payload: unknown;
    try {
      payload = JSON.parse(String((event as MessageEvent).data));
    } catch {
      this.failAllPending("response-error");
      return;
    }
    if (!isRecord(payload)) return;
    if (payload.type === "session.created") {
      const model = readNestedString(payload, ["session", "model"]);
      if (model && model !== this.token?.model) {
        this.rejectReady(new Error("Realtime OOB session model mismatch입니다."));
        return;
      }
      this.resolveReady();
      return;
    }
    if (payload.type === "input_audio_buffer.committed") {
      this.handleAudioCommitted(payload);
      return;
    }
    if (payload.type === "response.created") {
      this.handleResponseCreated(payload);
      return;
    }
    if (payload.type === "response.output_text.delta") {
      this.handleTextDelta(payload);
      return;
    }
    if (payload.type === "response.done") {
      this.handleResponseDone(payload);
      return;
    }
    if (payload.type === "error") this.failAllPending("response-error");
  };

  private readonly handleConnectionFailure = () => {
    if (!this.running) return;
    this.rejectReady(new Error("Realtime OOB 연결이 종료되었습니다."));
    this.failAllPending("connection");
  };

  private handleAudioCommitted(payload: Record<string, unknown>) {
    const itemId = typeof payload.item_id === "string" ? payload.item_id : null;
    const commit = this.pendingCommits.shift();
    if (!itemId || !commit) return;
    const pending: PendingResponse = {
      ...commit,
      responseId: null,
      transcript: "",
      timeoutId: setTimeout(
        () => this.failPending(pending, "timeout"),
        this.responseTimeoutMs,
      ),
    };
    this.pendingWithoutResponseId.push(pending);
    this.send({
      type: "response.create",
      response: {
        conversation: "none",
        output_modalities: ["text"],
        instructions: koreanFillerVerbatimOobInstructions,
        metadata: {
          purpose: "filler-verbatim",
          utteranceId: commit.utteranceId,
          fragmentSequence: commit.fragmentSequence,
        },
        input: [{ type: "item_reference", id: itemId }],
      },
    });
  }

  private handleResponseCreated(payload: Record<string, unknown>) {
    const response = isRecord(payload.response) ? payload.response : null;
    const responseId = response && typeof response.id === "string"
      ? response.id
      : null;
    const metadata = response && isRecord(response.metadata)
      ? response.metadata
      : null;
    const utteranceId = metadata && typeof metadata.utteranceId === "string"
      ? metadata.utteranceId
      : null;
    const fragmentSequence = metadata && typeof metadata.fragmentSequence === "number"
      ? metadata.fragmentSequence
      : null;
    if (!responseId || !utteranceId || fragmentSequence === null) return;
    const index = this.pendingWithoutResponseId.findIndex(
      (pending) =>
        pending.utteranceId === utteranceId &&
        pending.fragmentSequence === fragmentSequence,
    );
    if (index < 0) return;
    const pending = this.pendingWithoutResponseId.splice(index, 1)[0];
    if (!pending) return;
    pending.responseId = responseId;
    this.pendingByResponseId.set(responseId, pending);
  }

  private handleTextDelta(payload: Record<string, unknown>) {
    const responseId = typeof payload.response_id === "string"
      ? payload.response_id
      : null;
    const delta = typeof payload.delta === "string" ? payload.delta : "";
    const pending = responseId
      ? this.pendingByResponseId.get(responseId)
      : undefined;
    if (pending && delta) pending.transcript += delta;
  }

  private handleResponseDone(payload: Record<string, unknown>) {
    const response = isRecord(payload.response) ? payload.response : null;
    const responseId = response && typeof response.id === "string"
      ? response.id
      : null;
    const pending = responseId
      ? this.pendingByResponseId.get(responseId)
      : undefined;
    if (!pending || !response) return;
    const metadata = isRecord(response.metadata) ? response.metadata : null;
    if (
      metadata?.utteranceId !== pending.utteranceId ||
      metadata?.fragmentSequence !== pending.fragmentSequence
    ) {
      this.failPending(pending, "response-error");
      return;
    }
    const transcript = (
      pending.transcript || readResponseOutputText(response)
    ).trim();
    if (!transcript || response.status === "failed") {
      this.failPending(pending, "response-error");
      return;
    }
    const usage = isRecord(response.usage) ? response.usage : null;
    this.completePending(pending, {
      status: "completed",
      transcript,
      ...(readNonNegativeInteger(usage?.input_tokens) === undefined
        ? {}
        : { inputTokens: readNonNegativeInteger(usage?.input_tokens) }),
      ...(readNonNegativeInteger(usage?.output_tokens) === undefined
        ? {}
        : { outputTokens: readNonNegativeInteger(usage?.output_tokens) }),
    });
  }

  private failPending(
    pending: PendingResponse,
    failureCode: NonNullable<RealtimeOobFillerResult["failureCode"]>,
  ) {
    this.completePending(pending, { status: "failed", failureCode });
  }

  private completePending(
    pending: PendingResponse,
    result:
      | { status: "completed"; transcript: string; inputTokens?: number; outputTokens?: number }
      | { status: "failed"; failureCode: NonNullable<RealtimeOobFillerResult["failureCode"]> },
  ) {
    clearTimeout(pending.timeoutId);
    if (pending.responseId) this.pendingByResponseId.delete(pending.responseId);
    const withoutIndex = this.pendingWithoutResponseId.indexOf(pending);
    if (withoutIndex >= 0) this.pendingWithoutResponseId.splice(withoutIndex, 1);
    this.emit({
      utteranceId: pending.utteranceId,
      fragmentSequence: pending.fragmentSequence,
      responseId: pending.responseId,
      latencyMs: Math.max(this.now() - pending.committedAtMs, 0),
      ...result,
    });
    this.resolveDrainsIfIdle();
  }

  private failAllPending(
    failureCode: NonNullable<RealtimeOobFillerResult["failureCode"]>,
  ) {
    for (const pending of [
      ...this.pendingWithoutResponseId,
      ...this.pendingByResponseId.values(),
    ]) {
      this.failPending(pending, failureCode);
    }
    while (this.pendingCommits.length > 0) {
      const pending = this.pendingCommits.shift();
      if (!pending) break;
      this.emit({
        utteranceId: pending.utteranceId,
        fragmentSequence: pending.fragmentSequence,
        responseId: null,
        status: "failed",
        latencyMs: Math.max(this.now() - pending.committedAtMs, 0),
        failureCode,
      });
    }
    this.resolveDrainsIfIdle();
  }

  private nextFragmentSequence(utteranceId: string) {
    const sequence =
      (this.nextFragmentSequenceByUtterance.get(utteranceId) ?? 0) + 1;
    this.nextFragmentSequenceByUtterance.set(utteranceId, sequence);
    return sequence;
  }

  private hasPendingWork() {
    return (
      this.pendingCommits.length > 0 ||
      this.pendingWithoutResponseId.length > 0 ||
      this.pendingByResponseId.size > 0
    );
  }

  private resolveDrainsIfIdle() {
    if (this.hasPendingWork()) return;
    for (const resolve of this.drainResolvers) resolve();
    this.drainResolvers.clear();
  }

  private send(payload: unknown) {
    if (isOpen(this.dataChannel)) {
      this.dataChannel.send(JSON.stringify(payload));
    }
  }

  private resolveReady() {
    this.clearReadyTimeout();
    this.readyResolve?.();
    this.readyResolve = null;
    this.readyReject = null;
  }

  private rejectReady(error: Error) {
    this.clearReadyTimeout();
    this.readyReject?.(error);
    this.readyResolve = null;
    this.readyReject = null;
  }

  private clearReadyTimeout() {
    if (this.readyTimeoutId !== null) clearTimeout(this.readyTimeoutId);
    this.readyTimeoutId = null;
  }

  private emit(result: RealtimeOobFillerResult) {
    for (const subscriber of this.subscribers) subscriber(result);
  }
}

function createDefaultPeerConnection(): RealtimePeerConnection {
  if (typeof RTCPeerConnection === "undefined") {
    throw new Error("이 브라우저는 Realtime OOB WebRTC를 지원하지 않습니다.");
  }
  return new RTCPeerConnection() as RealtimePeerConnection;
}

const defaultFetch: typeof fetch = (input, init) => globalThis.fetch(input, init);

function isOpen(channel: RealtimeDataChannel | null): channel is RealtimeDataChannel {
  return Boolean(
    channel && (channel.readyState === undefined || channel.readyState === "open"),
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readNestedString(
  value: Record<string, unknown>,
  path: readonly string[],
) {
  let current: unknown = value;
  for (const key of path) {
    if (!isRecord(current)) return null;
    current = current[key];
  }
  return typeof current === "string" ? current : null;
}

function readResponseOutputText(response: Record<string, unknown>) {
  if (!Array.isArray(response.output)) return "";
  return response.output
    .flatMap((item) => (isRecord(item) && Array.isArray(item.content) ? item.content : []))
    .map((content) =>
      isRecord(content) && typeof content.text === "string" ? content.text : "",
    )
    .join("");
}

function readNonNegativeInteger(value: unknown) {
  return typeof value === "number" && Number.isInteger(value) && value >= 0
    ? value
    : undefined;
}
