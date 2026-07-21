import {
  realtimeTranscriptionClientSecretResponseSchema,
  type RealtimeTranscriptionClientSecretResponse
} from "@orbit/shared";
import type { LiveSttAudioLevelEvent } from "../liveStt";
import { calculatePcmAudioLevel } from "../liveSttAudioLevel";
import {
  advanceSpeechDetector,
  calculateNoiseFloorDb,
  initialSpeechDetectorState,
  resolveAdaptiveSpeechThresholdDb,
  type SpeechDetectorState
} from "./adaptiveSpeechDetector";
import {
  LiveSttError,
  normalizeLiveSttBiasPhrases,
  type LiveSttBiasPhrase,
  type LiveSttCapabilities,
  type LiveSttNoiseCalibrationEvent,
  type LiveSttPort,
  type LiveSttResult,
  type LiveSttSessionConfig,
  type LiveSttSpeechActivityEvent,
  type LiveSttUnsubscribe
} from "./liveSttPort";
import { RealtimeFinalOrderer } from "./realtimeFinalOrderer";
import {
  mergeRealtimeTranscriptionConfiguration,
  readRealtimeTranscriptionConfiguration,
  verifyRealtimeTranscriptionConfiguration,
  type RealtimeTranscriptionConfiguration
} from "./realtimeSessionVerification";
import {
  RealtimeSttDiagnosticRingBuffer,
  summarizeRealtimeSttMetrics,
  type RealtimeSttTurnMetric,
  type RealtimeSttDiagnosticEvent
} from "./realtimeSttDiagnostics";

type OpenAiRealtimeDataChannel = {
  addEventListener: (
    type: "close" | "error" | "message" | "open",
    listener: (event: Event) => void
  ) => void;
  close: () => void;
  readyState?: RTCDataChannelState;
  send: (data: string) => void;
};

type OpenAiRealtimePeerConnection = {
  addTrack: (track: MediaStreamTrack, ...streams: MediaStream[]) => RTCRtpSender;
  close: () => void;
  createDataChannel: (label: string) => OpenAiRealtimeDataChannel;
  createOffer: () => Promise<RTCSessionDescriptionInit>;
  setLocalDescription: (description: RTCSessionDescriptionInit) => Promise<void>;
  setRemoteDescription: (description: RTCSessionDescriptionInit) => Promise<void>;
};

type AudioLevelMeter = { stop: () => void };

type OpenAiRealtimeLiveSttPortOptions = {
  projectId: string;
  createAudioLevelMeter?: (
    stream: MediaStream,
    onAudioLevel: (event: LiveSttAudioLevelEvent) => void
  ) => AudioLevelMeter;
  createPeerConnection?: () => OpenAiRealtimePeerConnection;
  fetcher?: typeof fetch;
  createUtteranceId?: () => string;
  now?: () => number;
  onAudioLevel?: (event: LiveSttAudioLevelEvent) => void;
  onNoiseCalibration?: (event: LiveSttNoiseCalibrationEvent) => void;
  noiseCalibrationMs?: number;
  noiseThresholdMarginDb?: number;
  speechAttackMs?: number;
  silenceCommitMs?: number;
  maxCommitIntervalMs?: number;
  finalReorderTimeoutMs?: number;
  readinessTimeoutMs?: number;
};

type PendingFinal = {
  key: string;
  text: string;
  utteranceId: string | null;
  contentIndex: number;
  resultRevision: number;
  completedAtMs: number;
};

type PendingCommit = {
  sequence: number;
  coachingUtteranceId: string;
};

export class OpenAiRealtimeLiveSttPort implements LiveSttPort {
  readonly engineId = "openai-realtime";
  readonly capabilities: LiveSttCapabilities = {
    onDevice: false,
    streaming: true,
    keywordBiasing: false,
    languages: ["ko"]
  };
  readonly projectId: string;

  private readonly fetcher: typeof fetch;
  private readonly createUtteranceId: () => string;
  private readonly now: () => number;
  private readonly onAudioLevel?: (event: LiveSttAudioLevelEvent) => void;
  private readonly onNoiseCalibration?: (
    event: LiveSttNoiseCalibrationEvent
  ) => void;
  private readonly createPeerConnection: () => OpenAiRealtimePeerConnection;
  private readonly createAudioLevelMeter: (
    stream: MediaStream,
    onAudioLevel: (event: LiveSttAudioLevelEvent) => void
  ) => AudioLevelMeter;
  private readonly noiseCalibrationMs: number;
  private readonly noiseThresholdMarginDb: number;
  private readonly speechAttackMs: number;
  private readonly silenceCommitMs: number;
  private readonly maxCommitIntervalMs: number;
  private readonly readinessTimeoutMs: number;
  private readonly resultSubscribers = new Set<(result: LiveSttResult) => void>();
  private readonly errorSubscribers = new Set<(error: LiveSttError) => void>();
  private readonly speechActivitySubscribers = new Set<
    (event: LiveSttSpeechActivityEvent) => void
  >();
  private readonly partialTextByEventKey = new Map<string, string>();
  private readonly revisionByEventKey = new Map<string, number>();
  private readonly commitSequenceByItemKey = new Map<string, number>();
  private readonly coachingUtteranceIdByItemKey = new Map<string, string>();
  private readonly firstDeltaAtMsByItemKey = new Map<string, number>();
  private readonly pendingFinalByItemKey = new Map<string, PendingFinal>();
  private readonly turnMetricsBySequence = new Map<number, RealtimeSttTurnMetric>();
  private readonly pendingCommits: PendingCommit[] = [];
  private readonly diagnostics = new RealtimeSttDiagnosticRingBuffer();
  private readonly finalOrderer: RealtimeFinalOrderer<PendingFinal>;
  private peerConnection: OpenAiRealtimePeerConnection | null = null;
  private dataChannel: OpenAiRealtimeDataChannel | null = null;
  private audioLevelMeter: AudioLevelMeter | null = null;
  private audioTrack: MediaStreamTrack | null = null;
  private startedAtMs: number | null = null;
  private token: RealtimeTranscriptionClientSecretResponse | null = null;
  private activeConfiguration: RealtimeTranscriptionConfiguration = {
    model: null,
    delay: null
  };
  private calibrationStartedAtMs: number | null = null;
  private noiseFloorSamples: number[] = [];
  private speechThresholdDb: number | null = null;
  private isNoiseCalibrationActive = false;
  private speechDetectorState: SpeechDetectorState = initialSpeechDetectorState;
  private activeSpeechStartedAtMs: number | null = null;
  private activeCoachingUtteranceId: string | null = null;
  private nextCommitSequence = 1;
  private readyResolve: (() => void) | null = null;
  private readyReject: ((error: Error) => void) | null = null;
  private readyTimeoutId: ReturnType<typeof setTimeout> | null = null;
  private biasPhrases: LiveSttBiasPhrase[] = [];

  constructor(options: OpenAiRealtimeLiveSttPortOptions) {
    this.projectId = options.projectId;
    this.fetcher = options.fetcher ?? defaultFetch;
    this.createUtteranceId = options.createUtteranceId ?? defaultCreateUtteranceId;
    this.now = options.now ?? (() => Date.now());
    this.onAudioLevel = options.onAudioLevel;
    this.onNoiseCalibration = options.onNoiseCalibration;
    this.createPeerConnection = options.createPeerConnection ?? createDefaultPeerConnection;
    this.createAudioLevelMeter = options.createAudioLevelMeter ?? createAnalyserAudioLevelMeter;
    this.noiseCalibrationMs = options.noiseCalibrationMs ?? 1500;
    this.noiseThresholdMarginDb = options.noiseThresholdMarginDb ?? 10;
    this.speechAttackMs = options.speechAttackMs ?? 200;
    this.silenceCommitMs = options.silenceCommitMs ?? 650;
    this.maxCommitIntervalMs = options.maxCommitIntervalMs ?? 10_000;
    this.readinessTimeoutMs = options.readinessTimeoutMs ?? 10_000;
    this.finalOrderer = new RealtimeFinalOrderer(
      (ordered) => this.emitOrderedFinal(ordered.value, ordered.sequence, ordered.reorderTimedOut),
      options.finalReorderTimeoutMs ?? 2000
    );
  }

  async start(config: LiveSttSessionConfig) {
    const audioTrack = config.audioSource.getAudioTracks()[0];
    assertUsableAudioTrack(audioTrack);
    this.resetSessionState();
    this.startedAtMs = this.now();
    this.biasPhrases = normalizeLiveSttBiasPhrases(config.biasPhrases);
    this.audioTrack = audioTrack;
    this.listenToAudioTrack(audioTrack);

    try {
      this.token = await this.fetchClientSecret();
      const ready = this.createReadyPromise();
      const peerConnection = this.createPeerConnection();
      this.peerConnection = peerConnection;
      this.audioLevelMeter = this.createAudioLevelMeter(
        config.audioSource,
        this.handleAudioLevel
      );
      peerConnection.addTrack(audioTrack, config.audioSource);
      const dataChannel = peerConnection.createDataChannel("oai-events");
      this.dataChannel = dataChannel;
      dataChannel.addEventListener("open", this.handleDataChannelOpen);
      dataChannel.addEventListener("message", this.handleDataChannelMessage);
      dataChannel.addEventListener("error", this.handleDataChannelError);
      dataChannel.addEventListener("close", this.handleDataChannelClose);

      const offer = await peerConnection.createOffer();
      if (!offer.sdp) {
        throw new LiveSttError("start_failed", "OpenAI Realtime SDP offer를 만들지 못했습니다.");
      }
      await peerConnection.setLocalDescription(offer);
      const sdpResponse = await this.fetcher("https://api.openai.com/v1/realtime/calls", {
        body: offer.sdp,
        headers: {
          Authorization: `Bearer ${this.token.clientSecret}`,
          "Content-Type": "application/sdp"
        },
        method: "POST"
      });
      if (!sdpResponse.ok) {
        throw new LiveSttError("start_failed", `OpenAI Realtime SDP handshake failed: ${sdpResponse.status}`);
      }
      await peerConnection.setRemoteDescription({ type: "answer", sdp: await sdpResponse.text() });
      await ready;
    } catch (error) {
      const liveError = toLiveSttError(error, "OpenAI Realtime STT를 시작하지 못했습니다.");
      await this.stop();
      throw liveError;
    }
  }

  async stop() {
    this.rejectReady(new LiveSttError("start_failed", "OpenAI Realtime STT 시작이 중단되었습니다."));
    this.finishNoiseCalibration("cancelled");
    if (
      this.activeCoachingUtteranceId !== null &&
      (this.activeSpeechStartedAtMs !== null || this.speechDetectorState.isSpeaking)
    ) {
      this.emitSpeechActivity({
        type: "speech-ended",
        utteranceId: this.activeCoachingUtteranceId,
        occurredAtMs: this.now(),
        reason: "stopped"
      });
    }
    this.startedAtMs = null;
    this.finalOrderer.reset();
    this.audioLevelMeter?.stop();
    this.audioLevelMeter = null;
    this.dataChannel?.close();
    this.dataChannel = null;
    this.peerConnection?.close();
    this.peerConnection = null;
    this.audioTrack = null;
    this.resetSessionState();
  }

  updateBiasPhrases(phrases: readonly LiveSttBiasPhrase[]) {
    this.biasPhrases = normalizeLiveSttBiasPhrases(phrases);
  }

  onResult(cb: (result: LiveSttResult) => void): LiveSttUnsubscribe {
    this.resultSubscribers.add(cb);
    return () => this.resultSubscribers.delete(cb);
  }

  onError(cb: (error: LiveSttError) => void): LiveSttUnsubscribe {
    this.errorSubscribers.add(cb);
    return () => this.errorSubscribers.delete(cb);
  }

  onSpeechActivity(
    cb: (event: LiveSttSpeechActivityEvent) => void
  ): LiveSttUnsubscribe {
    this.speechActivitySubscribers.add(cb);
    return () => this.speechActivitySubscribers.delete(cb);
  }

  async dispose() {
    await this.stop();
    this.resultSubscribers.clear();
    this.errorSubscribers.clear();
    this.speechActivitySubscribers.clear();
  }

  readBiasPhrasesForTest() { return this.biasPhrases; }
  readDiagnosticsForTest() { return this.diagnostics.read(); }
  readMetricsForTest() {
    const turns = [...this.turnMetricsBySequence.values()].sort(
      (left, right) => left.sequence - right.sequence,
    );
    return { turns, summary: summarizeRealtimeSttMetrics(turns) };
  }

  private createReadyPromise() {
    const promise = new Promise<void>((resolve, reject) => {
      this.readyResolve = resolve;
      this.readyReject = reject;
    });
    this.readyTimeoutId = setTimeout(() => {
      this.rejectReady(new LiveSttError("start_failed", "OpenAI Realtime session readiness timeout입니다."));
    }, this.readinessTimeoutMs);
    return promise;
  }

  private resolveReady() {
    this.clearReadyTimer();
    this.readyResolve?.();
    this.readyResolve = null;
    this.readyReject = null;
  }

  private rejectReady(error: Error) {
    this.clearReadyTimer();
    this.readyReject?.(error);
    this.readyResolve = null;
    this.readyReject = null;
  }

  private clearReadyTimer() {
    if (this.readyTimeoutId !== null) clearTimeout(this.readyTimeoutId);
    this.readyTimeoutId = null;
  }

  private async fetchClientSecret() {
    const response = await this.fetcher(`/api/v1/projects/${encodeURIComponent(this.projectId)}/realtime-transcription/client-secret`, {
      credentials: "include",
      method: "POST"
    });
    if (!response.ok) {
      throw new LiveSttError("start_failed", await readResponseError(response, `OpenAI Realtime client secret request failed: ${response.status}`));
    }
    return realtimeTranscriptionClientSecretResponseSchema.parse(await response.json());
  }

  private readonly handleDataChannelOpen = () => {
    const token = this.token;
    if (!token || !this.dataChannel) return;
    this.send({
      type: "session.update",
      session: {
        type: "transcription",
        audio: {
          input: {
            transcription: { model: token.model, language: "ko", delay: token.delay },
            turn_detection: null
          }
        },
        include: ["item.input_audio_transcription.logprobs"]
      }
    });
    this.recordDiagnostic("connection.data_channel_open");
  };

  private readonly handleDataChannelMessage = (event: Event) => {
    try {
      this.handleRealtimeEvent(JSON.parse(String((event as MessageEvent).data)));
    } catch {
      this.failRuntime("OpenAI Realtime 이벤트를 해석하지 못했습니다.");
    }
  };

  private readonly handleDataChannelError = () => this.failRuntime("OpenAI Realtime data channel 오류입니다.");
  private readonly handleDataChannelClose = () => {
    if (this.startedAtMs !== null) this.failRuntime("OpenAI Realtime data channel이 예기치 않게 종료되었습니다.");
  };

  private readonly handleAudioLevel = (event: LiveSttAudioLevelEvent) => {
    this.onAudioLevel?.(event);
    const now = this.now();
    if (this.calibrationStartedAtMs !== null && this.speechThresholdDb === null) {
      this.noiseFloorSamples.push(event.rmsDb);
      if (now - this.calibrationStartedAtMs >= this.noiseCalibrationMs) {
        const noiseFloorDb = calculateNoiseFloorDb(this.noiseFloorSamples);
        if (noiseFloorDb === null) {
          this.failRuntime("마이크 noise floor를 계산하지 못했습니다.");
          return;
        }
        this.speechThresholdDb = resolveAdaptiveSpeechThresholdDb(noiseFloorDb, this.noiseThresholdMarginDb);
        this.send({ type: "input_audio_buffer.clear" });
        this.recordDiagnostic("vad.calibration_completed", { noiseFloorDb, speechThresholdDb: this.speechThresholdDb });
        this.finishNoiseCalibration("completed");
        this.resolveReady();
      }
      return;
    }
    if (this.speechThresholdDb === null) return;

    const transition = advanceSpeechDetector(this.speechDetectorState, {
      nowMs: now,
      rmsDb: event.rmsDb,
      thresholdDb: this.speechThresholdDb,
      attackMs: this.speechAttackMs,
      releaseMs: this.silenceCommitMs
    });
    this.speechDetectorState = transition.state;
    if (transition.speechStartedAtMs !== null && this.activeSpeechStartedAtMs === null) {
      this.activeSpeechStartedAtMs = transition.speechStartedAtMs;
      this.activeCoachingUtteranceId ??= this.createUtteranceId();
      this.emitSpeechActivity({
        type: "speech-started",
        utteranceId: this.activeCoachingUtteranceId,
        occurredAtMs: transition.speechStartedAtMs
      });
      this.recordDiagnostic("vad.speech_started");
    }
    if (transition.speechEndedAtMs !== null) {
      this.commitActiveSpeech("silence", transition.speechEndedAtMs);
    }
    if (this.activeSpeechStartedAtMs !== null && now - this.activeSpeechStartedAtMs >= this.maxCommitIntervalMs) {
      this.commitActiveSpeech("max-duration", now);
      if (this.speechDetectorState.isSpeaking) this.activeSpeechStartedAtMs = now;
    }
  };

  private handleRealtimeEvent(event: unknown) {
    if (!isRecord(event) || this.startedAtMs === null) return;
    if (event.type === "session.created" || event.type === "session.updated") {
      this.activeConfiguration = mergeRealtimeTranscriptionConfiguration(
        this.activeConfiguration,
        readRealtimeTranscriptionConfiguration(event)
      );
      if (event.type === "session.updated") this.verifySessionUpdated();
      return;
    }
    if (event.type === "input_audio_buffer.committed") {
      this.handleAudioBufferCommitted(event);
      return;
    }
    if (event.type === "conversation.item.input_audio_transcription.delta") {
      this.handleTranscriptDelta(event);
      return;
    }
    if (event.type === "conversation.item.input_audio_transcription.completed") {
      this.handleTranscriptCompleted(event);
      return;
    }
    if (event.type === "error") this.failRuntime(readRealtimeError(event));
  }

  private verifySessionUpdated() {
    const token = this.token;
    if (!token) return;
    const verification = verifyRealtimeTranscriptionConfiguration({
      issuedModel: token.model,
      issuedDelay: token.delay,
      reported: this.activeConfiguration,
      expectedModel: "gpt-realtime-whisper",
      expectedDelay: "xhigh"
    });
    if (!verification.ok) {
      this.failRuntime(`OpenAI Realtime session configuration mismatch: ${verification.reason}`);
      return;
    }
    this.calibrationStartedAtMs = this.now();
    this.noiseFloorSamples = [];
    this.isNoiseCalibrationActive = true;
    this.onNoiseCalibration?.({
      type: "started",
      durationMs: this.noiseCalibrationMs
    });
    this.recordDiagnostic("session.configuration_verified", { delaySource: verification.delaySource });
  }

  private handleAudioBufferCommitted(event: Record<string, unknown>) {
    const itemId = typeof event.item_id === "string" ? event.item_id : null;
    const pendingCommit = this.pendingCommits.shift();
    if (!itemId || !pendingCommit) return;
    const key = `${itemId}:0`;
    this.commitSequenceByItemKey.set(key, pendingCommit.sequence);
    this.coachingUtteranceIdByItemKey.set(
      key,
      pendingCommit.coachingUtteranceId,
    );
    const pending = this.pendingFinalByItemKey.get(key);
    const pendingMetric = this.turnMetricsBySequence.get(pendingCommit.sequence);
    const pendingFirstDeltaAtMs = this.firstDeltaAtMsByItemKey.get(key);
    if (pendingMetric && pendingFirstDeltaAtMs !== undefined) {
      pendingMetric.firstDeltaAtMs = pendingFirstDeltaAtMs;
      this.firstDeltaAtMsByItemKey.delete(key);
      this.recordFirstDeltaDiagnostic(pendingMetric);
    }
    if (pendingMetric && pending) {
      pendingMetric.completedAtMs = pending.completedAtMs;
      this.recordCompletionMetric(pendingMetric);
    }
    if (pending) {
      this.pendingFinalByItemKey.delete(key);
      this.finalOrderer.push(pendingCommit.sequence, pending);
    }
  }

  private handleTranscriptDelta(event: Record<string, unknown>) {
    const delta = typeof event.delta === "string" ? event.delta : "";
    if (!delta) return;
    const key = getRealtimeTranscriptEventKey(event);
    const next = `${this.partialTextByEventKey.get(key) ?? ""}${delta}`;
    this.partialTextByEventKey.set(key, next);
    this.recordFirstDeltaMetric(key);
    this.emitTranscript(next, false, {
      utteranceId: getRealtimeTranscriptUtteranceId(event),
      resultRevision: this.incrementResultRevision(key),
      contentIndex: getContentIndex(event),
      coachingUtteranceId: this.coachingUtteranceIdByItemKey.get(key),
    });
  }

  private handleTranscriptCompleted(event: Record<string, unknown>) {
    const key = getRealtimeTranscriptEventKey(event);
    const final: PendingFinal = {
      key,
      text: typeof event.transcript === "string" ? event.transcript : this.partialTextByEventKey.get(key) ?? "",
      utteranceId: getRealtimeTranscriptUtteranceId(event),
      contentIndex: getContentIndex(event),
      resultRevision: this.incrementResultRevision(key),
      completedAtMs: this.now(),
    };
    this.partialTextByEventKey.delete(key);
    const sequence = this.commitSequenceByItemKey.get(key);
    if (sequence === undefined) this.pendingFinalByItemKey.set(key, final);
    else {
      const metric = this.turnMetricsBySequence.get(sequence);
      if (metric) {
        metric.completedAtMs = final.completedAtMs;
        this.recordCompletionMetric(metric);
      }
      this.finalOrderer.push(sequence, final);
    }
  }

  private emitOrderedFinal(final: PendingFinal, sequence: number, reorderTimedOut: boolean) {
    this.emitTranscript(final.text, true, {
      utteranceId: final.utteranceId,
      resultRevision: final.resultRevision,
      contentIndex: final.contentIndex,
      commitSequence: sequence,
      finalReorderTimedOut: reorderTimedOut,
      coachingUtteranceId: this.coachingUtteranceIdByItemKey.get(final.key),
    });
    if (reorderTimedOut) this.recordDiagnostic("transcript.final_reorder_timeout", { commitSequence: sequence });
  }

  private commitActiveSpeech(
    reason: "silence" | "max-duration",
    occurredAtMs: number
  ) {
    if (
      this.activeSpeechStartedAtMs === null ||
      this.activeCoachingUtteranceId === null ||
      !isDataChannelOpen(this.dataChannel)
    ) return;
    const utteranceId = this.activeCoachingUtteranceId;
    const sequence = this.nextCommitSequence++;
    this.turnMetricsBySequence.set(sequence, {
      sequence,
      speechStartedAtMs: this.activeSpeechStartedAtMs,
      committedAtMs: occurredAtMs,
      firstDeltaAtMs: null,
      completedAtMs: null,
    });
    this.pendingCommits.push({ sequence, coachingUtteranceId: utteranceId });
    this.send({ type: "input_audio_buffer.commit" });
    this.activeSpeechStartedAtMs = null;
    this.emitSpeechActivity(
      reason === "silence"
        ? { type: "speech-ended", utteranceId, occurredAtMs, reason: "silence" }
        : { type: "speech-fragment-committed", utteranceId, occurredAtMs }
    );
    if (reason === "silence") this.activeCoachingUtteranceId = null;
    this.recordDiagnostic("audio.committed", { commitSequence: sequence, reason });
  }

  private incrementResultRevision(key: string) {
    const revision = (this.revisionByEventKey.get(key) ?? 0) + 1;
    this.revisionByEventKey.set(key, revision);
    return revision;
  }

  private recordFirstDeltaMetric(key: string) {
    const sequence = this.commitSequenceByItemKey.get(key);
    if (sequence === undefined) {
      if (!this.firstDeltaAtMsByItemKey.has(key)) {
        this.firstDeltaAtMsByItemKey.set(key, this.now());
      }
      return;
    }
    const metric = this.turnMetricsBySequence.get(sequence);
    if (!metric || metric.firstDeltaAtMs !== null) return;
    metric.firstDeltaAtMs = this.now();
    this.recordFirstDeltaDiagnostic(metric);
  }

  private recordFirstDeltaDiagnostic(metric: RealtimeSttTurnMetric) {
    if (metric.firstDeltaAtMs === null) return;
    this.recordDiagnostic("transcript.first_delta", {
      commitSequence: metric.sequence,
      onsetToFirstDeltaMs: Math.max(
        metric.firstDeltaAtMs - metric.speechStartedAtMs,
        0,
      ),
    });
  }

  private recordCompletionMetric(metric: RealtimeSttTurnMetric) {
    if (metric.completedAtMs === null || metric.committedAtMs === null) return;
    this.recordDiagnostic("transcript.completed", {
      commitSequence: metric.sequence,
      commitToFinalMs: Math.max(
        metric.completedAtMs - metric.committedAtMs,
        0,
      ),
      onsetToFinalMs: Math.max(
        metric.completedAtMs - metric.speechStartedAtMs,
        0,
      ),
    });
  }

  private emitTranscript(text: string, isFinal: boolean, identity: {
    utteranceId: string | null;
    resultRevision: number;
    contentIndex: number;
    coachingUtteranceId?: string;
    commitSequence?: number;
    finalReorderTimedOut?: boolean;
  }) {
    const transcript = text.trim();
    if (!transcript || this.startedAtMs === null) return;
    const elapsedMs = Math.max(this.now() - this.startedAtMs, 0);
    this.emitResult({
      text: transcript,
      isFinal,
      timestampMs: [elapsedMs, elapsedMs],
      ...(identity.utteranceId === null ? {} : { utteranceId: identity.utteranceId, resultRevision: identity.resultRevision }),
      metadata: {
        contentIndex: identity.contentIndex,
        ...(identity.coachingUtteranceId === undefined
          ? {}
          : { coachingUtteranceId: identity.coachingUtteranceId }),
        ...(identity.commitSequence === undefined ? {} : { commitSequence: identity.commitSequence }),
        ...(identity.finalReorderTimedOut === undefined ? {} : { finalReorderTimedOut: identity.finalReorderTimedOut })
      }
    });
  }

  private send(payload: unknown) {
    if (!isDataChannelOpen(this.dataChannel)) return;
    this.dataChannel.send(JSON.stringify(payload));
  }

  private listenToAudioTrack(track: MediaStreamTrack) {
    track.addEventListener?.("mute", this.handleAudioTrackState);
    track.addEventListener?.("ended", this.handleAudioTrackState);
  }

  private readonly handleAudioTrackState = () => {
    const track = this.audioTrack;
    if (!track || track.readyState === "ended" || track.muted || !track.enabled) {
      this.failRuntime("OpenAI Realtime 마이크 오디오 트랙을 사용할 수 없습니다.");
    }
  };

  private failRuntime(message: string) {
    const error = new LiveSttError("runtime_error", message);
    this.finishNoiseCalibration("cancelled");
    this.rejectReady(error);
    this.emitError(error);
  }

  private finishNoiseCalibration(type: "completed" | "cancelled") {
    if (!this.isNoiseCalibrationActive) return;
    this.isNoiseCalibrationActive = false;
    this.onNoiseCalibration?.({ type });
  }

  private recordDiagnostic(type: string, metadata?: RealtimeSttDiagnosticEvent["metadata"]) {
    const event = { type, atMs: this.now(), ...(metadata ? { metadata } : {}) };
    this.diagnostics.push(event);
    if (isRealtimeDiagnosticsEnabled()) console.debug("[orbit-realtime-stt]", event);
  }

  private resetSessionState() {
    this.clearReadyTimer();
    this.partialTextByEventKey.clear();
    this.revisionByEventKey.clear();
    this.commitSequenceByItemKey.clear();
    this.coachingUtteranceIdByItemKey.clear();
    this.firstDeltaAtMsByItemKey.clear();
    this.pendingFinalByItemKey.clear();
    this.turnMetricsBySequence.clear();
    this.pendingCommits.length = 0;
    this.finalOrderer.reset();
    this.token = null;
    this.activeConfiguration = { model: null, delay: null };
    this.calibrationStartedAtMs = null;
    this.isNoiseCalibrationActive = false;
    this.noiseFloorSamples = [];
    this.speechThresholdDb = null;
    this.speechDetectorState = initialSpeechDetectorState;
    this.activeSpeechStartedAtMs = null;
    this.activeCoachingUtteranceId = null;
    this.nextCommitSequence = 1;
  }

  private emitResult(result: LiveSttResult) { for (const subscriber of this.resultSubscribers) subscriber(result); }
  private emitError(error: LiveSttError) { for (const subscriber of this.errorSubscribers) subscriber(error); }
  private emitSpeechActivity(event: LiveSttSpeechActivityEvent) {
    for (const subscriber of this.speechActivitySubscribers) subscriber(event);
  }
}

function defaultCreateUtteranceId() {
  return globalThis.crypto?.randomUUID?.() ??
    `utterance-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function assertUsableAudioTrack(track: MediaStreamTrack | undefined): asserts track is MediaStreamTrack {
  if (!track || track.readyState === "ended" || track.muted || track.enabled === false) {
    throw new LiveSttError("start_failed", "OpenAI Realtime STT를 시작할 수 있는 마이크 오디오 트랙이 없습니다.");
  }
}

function createDefaultPeerConnection(): OpenAiRealtimePeerConnection {
  if (typeof RTCPeerConnection === "undefined") {
    throw new LiveSttError("unsupported_runtime", "이 브라우저는 OpenAI Realtime WebRTC 연결을 지원하지 않습니다.");
  }
  return new RTCPeerConnection() as OpenAiRealtimePeerConnection;
}

const defaultFetch: typeof fetch = (input, init) => globalThis.fetch(input, init);

function createAnalyserAudioLevelMeter(
  stream: MediaStream,
  onAudioLevel: (event: LiveSttAudioLevelEvent) => void
): AudioLevelMeter {
  if (typeof window === "undefined" || !window.AudioContext) return { stop() {} };
  const audioContext = new window.AudioContext();
  const source = audioContext.createMediaStreamSource(stream);
  const analyser = audioContext.createAnalyser();
  analyser.fftSize = 1024;
  const samples = new Float32Array(analyser.fftSize);
  source.connect(analyser);
  const intervalId = window.setInterval(() => {
    analyser.getFloatTimeDomainData(samples);
    onAudioLevel(calculatePcmAudioLevel(samples));
  }, 50);
  return {
    stop() {
      window.clearInterval(intervalId);
      source.disconnect();
      analyser.disconnect();
      void audioContext.close().catch(() => undefined);
    }
  };
}

function getRealtimeTranscriptEventKey(event: Record<string, unknown>) {
  return `${typeof event.item_id === "string" ? event.item_id : "unknown"}:${getContentIndex(event)}`;
}

function getRealtimeTranscriptUtteranceId(event: Record<string, unknown>) {
  return typeof event.item_id === "string" ? `${event.item_id}:${getContentIndex(event)}` : null;
}

function getContentIndex(event: Record<string, unknown>) {
  return typeof event.content_index === "number" ? event.content_index : 0;
}

function isDataChannelOpen(channel: OpenAiRealtimeDataChannel | null): channel is OpenAiRealtimeDataChannel {
  return Boolean(channel && (channel.readyState === undefined || channel.readyState === "open"));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readRealtimeError(event: Record<string, unknown>) {
  const error = isRecord(event.error) ? event.error : undefined;
  return error && typeof error.message === "string" ? error.message : "OpenAI Realtime 오류가 발생했습니다.";
}

async function readResponseError(response: Response, fallback: string) {
  try {
    const payload: unknown = await response.json();
    if (isRecord(payload) && typeof payload.message === "string") return payload.message;
  } catch {}
  return fallback;
}

function toLiveSttError(error: unknown, fallback: string) {
  if (error instanceof LiveSttError) return error;
  if (error instanceof Error) return new LiveSttError("start_failed", error.message);
  return new LiveSttError("start_failed", fallback);
}

function isRealtimeDiagnosticsEnabled() {
  try {
    return typeof localStorage !== "undefined" && localStorage.getItem("orbit.liveStt.debugRealtime") === "true";
  } catch {
    return false;
  }
}
