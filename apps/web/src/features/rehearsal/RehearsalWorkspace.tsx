import {
  demoIds,
  type AssetUploadUrlResponse,
  type CompleteRehearsalAudioUploadResponse,
  type CreateRehearsalAudioUploadUrlResponse,
  type CreateRehearsalRunResponse,
  type Deck,
  type DeckElement,
  type GetDeckResponse,
  type Job,
  type Keyword,
  type LiveSttAnimationCueEvent,
  type LiveSttKeywordDetectedEvent,
  type LiveSttPartialTranscriptEvent,
  type LiveSttSlideAdvanceEvent,
  type PutDeckResponse,
  type RehearsalRun,
  type Slide
} from "@orbit/shared";
import {
  AlertCircle,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Loader2,
  Mic,
  Square
} from "lucide-react";
import { useEffect, useRef, useState } from "react";

type Fetcher = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
type RehearsalPhase =
  | "idle"
  | "loading"
  | "recording"
  | "uploading"
  | "processing"
  | "succeeded"
  | "failed";
type RehearsalFlowStage =
  | "deck"
  | "run"
  | "upload-url"
  | "storage-put"
  | "complete"
  | "job-poll"
  | "run-fetch";
type LiveSttStatus =
  | "idle"
  | "starting"
  | "listening"
  | "unavailable"
  | "failed"
  | "stopped";

type RecordingSession = {
  recorder: MediaRecorder;
  start: () => void;
  stop: () => void;
};

export type LiveSttCallbacks = {
  onPartialTranscript: (event: LiveSttPartialTranscriptEvent) => void;
  onError: (error: LiveSttAdapterError) => void;
};

export type LiveSttAdapter = {
  start: (stream: MediaStream, callbacks: LiveSttCallbacks) => Promise<void>;
  stop: () => void;
  dispose: () => void;
};

type LiveKeywordCandidate = {
  keyword: Keyword;
  aliases: string[];
};

type LiveTranscriptAnalysis = {
  slideId: string;
  transcript: string;
  coverage: number;
  detectedKeywords: LiveSttKeywordDetectedEvent[];
  missingKeywordIds: string[];
};

const preferredAudioMimeTypes = [
  "audio/webm;codecs=opus",
  "audio/webm",
  "audio/mp4"
];
const liveAutoAdvanceCoverageThreshold = 0.8;
const defaultLiveAutoAdvanceDelayMs = 800;

export class RehearsalFlowError extends Error {
  constructor(
    readonly stage: RehearsalFlowStage,
    message: string
  ) {
    super(message);
    this.name = "RehearsalFlowError";
  }
}

export class LiveSttAdapterError extends Error {
  constructor(
    readonly code: "LIVE_STT_MODEL_UNAVAILABLE" | "LIVE_STT_START_FAILED",
    message: string
  ) {
    super(message);
    this.name = "LiveSttAdapterError";
  }
}

export class SherpaLiveSttAdapter implements LiveSttAdapter {
  async start(
    _stream: MediaStream,
    _callbacks: LiveSttCallbacks
  ): Promise<void> {
    throw new LiveSttAdapterError(
      "LIVE_STT_MODEL_UNAVAILABLE",
      "sherpa Korean on-device STT model is not connected yet."
    );
  }

  stop() {}

  dispose() {}
}

declare global {
  interface Window {
    __orbitCreateLiveSttAdapter?: () => LiveSttAdapter;
  }
}

export async function fetchRehearsalDeck(
  projectId: string = demoIds.projectId,
  fetcher: Fetcher = fetch
) {
  const response = await fetcher(`/api/v1/projects/${projectId}/deck`);
  if (!response.ok) {
    throw new RehearsalFlowError(
      "deck",
      await readErrorMessage(response, "발표자료를 불러오지 못했습니다.")
    );
  }

  const payload = (await response.json()) as GetDeckResponse;
  return payload.deck;
}

export async function fetchOrCreateRehearsalDeck(
  options: {
    projectId?: string;
    fallbackDeck?: Deck;
    fetcher?: Fetcher;
  } = {}
) {
  const projectId = options.projectId ?? options.fallbackDeck?.projectId ?? demoIds.projectId;
  const fetcher = options.fetcher ?? fetch;
  const response = await fetcher(`/api/v1/projects/${projectId}/deck`);

  if (response.ok) {
    const payload = (await response.json()) as GetDeckResponse;
    return payload.deck;
  }

  if (response.status === 404 && options.fallbackDeck) {
    const putResponse = await fetcher(`/api/v1/projects/${projectId}/deck`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        deck: options.fallbackDeck,
        snapshotReason: "deck-replaced"
      })
    });

    if (!putResponse.ok) {
      throw new RehearsalFlowError(
        "deck",
        await readErrorMessage(putResponse, "리허설 발표자료를 초기화하지 못했습니다.")
      );
    }

    const payload = (await putResponse.json()) as PutDeckResponse;
    return payload.deck;
  }

  throw new RehearsalFlowError(
    "deck",
    await readErrorMessage(response, "발표자료를 불러오지 못했습니다.")
  );
}

export async function createRehearsalRun(
  projectId: string,
  deckId: string,
  fetcher: Fetcher = fetch
) {
  const response = await fetcher(`/api/v1/projects/${projectId}/rehearsals`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ deckId })
  });

  if (!response.ok) {
    throw new RehearsalFlowError(
      "run",
      await readErrorMessage(response, "리허설 run을 만들지 못했습니다.")
    );
  }

  return (await response.json()) as CreateRehearsalRunResponse;
}

export async function requestRehearsalAudioUploadUrl(
  runId: string,
  file: File,
  fetcher: Fetcher = fetch
) {
  const response = await fetcher(`/api/v1/rehearsals/${runId}/audio/upload-url`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      originalName: file.name,
      mimeType: file.type || "audio/webm",
      size: file.size
    })
  });

  if (!response.ok) {
    throw new RehearsalFlowError(
      "upload-url",
      await readErrorMessage(response, "리허설 오디오 업로드 URL을 발급하지 못했습니다.")
    );
  }

  return (await response.json()) as CreateRehearsalAudioUploadUrlResponse;
}

export async function uploadRehearsalAudio(
  upload: AssetUploadUrlResponse,
  file: File,
  fetcher: Fetcher = fetch
) {
  const response = await fetcher(upload.uploadUrl, {
    method: upload.method,
    headers: upload.headers,
    body: file
  });

  if (!response.ok) {
    throw new RehearsalFlowError(
      "storage-put",
      await readErrorMessage(response, "리허설 오디오 업로드가 중단되었습니다.")
    );
  }
}

export async function completeRehearsalAudioUpload(
  runId: string,
  fileId: string,
  fetcher: Fetcher = fetch
) {
  const response = await fetcher(`/api/v1/rehearsals/${runId}/audio/complete`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ fileId })
  });

  if (!response.ok) {
    throw new RehearsalFlowError(
      "complete",
      await readErrorMessage(response, "리허설 STT 작업을 시작하지 못했습니다.")
    );
  }

  return (await response.json()) as CompleteRehearsalAudioUploadResponse;
}

export async function fetchRehearsalRun(
  runId: string,
  fetcher: Fetcher = fetch
) {
  const response = await fetcher(`/api/v1/rehearsals/${runId}`);
  if (!response.ok) {
    throw new RehearsalFlowError(
      "run-fetch",
      await readErrorMessage(response, "리허설 run 상태를 불러오지 못했습니다.")
    );
  }

  const payload = (await response.json()) as { run: RehearsalRun };
  return payload.run;
}

export async function pollRehearsalJob(
  jobId: string,
  options: {
    delayMs?: number;
    fetcher?: Fetcher;
    onUpdate?: (job: Job) => void;
    timeoutMs?: number;
  } = {}
) {
  const delayMs = options.delayMs ?? 1000;
  const fetcher = options.fetcher ?? fetch;
  const timeoutAt = Date.now() + (options.timeoutMs ?? 120_000);

  for (;;) {
    const response = await fetcher(`/api/jobs/${jobId}`);
    if (!response.ok) {
      throw new RehearsalFlowError(
        "job-poll",
        await readErrorMessage(response, "리허설 작업 상태를 불러오지 못했습니다.")
      );
    }

    const job = (await response.json()) as Job;
    options.onUpdate?.(job);
    if (job.status === "succeeded" || job.status === "failed") {
      return job;
    }

    if (Date.now() > timeoutAt) {
      throw new RehearsalFlowError("job-poll", "리허설 작업이 시간 내에 끝나지 않았습니다.");
    }

    await new Promise((resolve) => setTimeout(resolve, delayMs));
  }
}

export async function runRehearsalUploadFlow(options: {
  projectId: string;
  deckId: string;
  audioFile: File;
  fetcher?: Fetcher;
  onJobUpdate?: (job: Job) => void;
  pollDelayMs?: number;
  pollTimeoutMs?: number;
}) {
  const fetcher = options.fetcher ?? fetch;
  const created = await createRehearsalRun(options.projectId, options.deckId, fetcher);
  const uploadResponse = await requestRehearsalAudioUploadUrl(
    created.run.runId,
    options.audioFile,
    fetcher
  );

  await uploadRehearsalAudio(uploadResponse.upload, options.audioFile, fetcher);

  const completed = await completeRehearsalAudioUpload(
    created.run.runId,
    uploadResponse.upload.fileId,
    fetcher
  );
  const job = await pollRehearsalJob(completed.job.jobId, {
    fetcher,
    delayMs: options.pollDelayMs,
    timeoutMs: options.pollTimeoutMs,
    onUpdate: options.onJobUpdate
  });
  const run = await fetchRehearsalRun(created.run.runId, fetcher);

  return { run, job };
}

export function selectRecordingMimeType(
  recorderCtor: typeof MediaRecorder | undefined = globalThis.MediaRecorder
) {
  if (!recorderCtor) {
    return null;
  }

  if (typeof recorderCtor.isTypeSupported !== "function") {
    return "audio/webm";
  }

  return (
    preferredAudioMimeTypes.find((mimeType) =>
      recorderCtor.isTypeSupported(mimeType)
    ) ?? "audio/webm"
  );
}

export function createRecordingFile(
  blob: Blob,
  mimeType: string,
  now: Date = new Date()
) {
  const normalizedMimeType = normalizeRecordingMimeType(mimeType || blob.type);
  const safeTimestamp = now.toISOString().replace(/[:.]/g, "-");
  return new File([blob], `rehearsal-${safeTimestamp}.${extensionForMimeType(normalizedMimeType)}`, {
    type: normalizedMimeType
  });
}

export function normalizeRecordingMimeType(mimeType: string) {
  return mimeType.split(";")[0]?.trim().toLowerCase() || "audio/webm";
}

export function createRecordingSession(
  stream: MediaStream,
  options: {
    recorderCtor?: typeof MediaRecorder;
    now?: () => Date;
    onError: (error: Error) => void;
    onStop: (file: File) => void;
  }
): RecordingSession {
  const Recorder = options.recorderCtor ?? globalThis.MediaRecorder;
  const mimeType = selectRecordingMimeType(Recorder);
  if (!Recorder || !mimeType) {
    throw new Error("MediaRecorder is not supported.");
  }

  const recorder = new Recorder(stream, { mimeType });
  const chunks: Blob[] = [];

  recorder.ondataavailable = (event) => {
    if (event.data.size > 0) {
      chunks.push(event.data);
    }
  };
  recorder.onerror = () => {
    options.onError(new Error("녹음 중 오류가 발생했습니다."));
  };
  recorder.onstop = () => {
    if (chunks.length === 0) {
      options.onError(new Error("녹음된 오디오가 비어 있습니다."));
      return;
    }

    const blob = new Blob(chunks, { type: mimeType });
    options.onStop(createRecordingFile(blob, mimeType, options.now?.() ?? new Date()));
  };

  return {
    recorder,
    start: () => recorder.start(),
    stop: () => {
      if (recorder.state !== "inactive") {
        recorder.stop();
      }
    }
  };
}

export function normalizeLiveTranscriptText(value: string) {
  return value.toLocaleLowerCase("ko-KR").replace(/\s+/g, "").trim();
}

export function evaluateLiveTranscript(
  slide: Slide,
  transcript: string
): LiveTranscriptAnalysis {
  const candidates = getLiveKeywordCandidates(slide);
  const normalizedTranscript = normalizeLiveTranscriptText(transcript);
  const detectedKeywords = candidates.flatMap((candidate) => {
    const matchedText = candidate.aliases.find((alias) => {
      const normalizedAlias = normalizeLiveTranscriptText(alias);
      return normalizedAlias && normalizedTranscript.includes(normalizedAlias);
    });

    if (!matchedText) {
      return [];
    }

    return [
      {
        type: "keyword-detected" as const,
        slideId: slide.slideId,
        keywordId: candidate.keyword.keywordId,
        text: candidate.keyword.text,
        matchedText,
        coverage: 0
      }
    ];
  });
  const coverage =
    candidates.length === 0 ? 0 : detectedKeywords.length / candidates.length;
  const missingKeywordIds = candidates
    .filter(
      (candidate) =>
        !detectedKeywords.some(
          (event) => event.keywordId === candidate.keyword.keywordId
        )
    )
    .map((candidate) => candidate.keyword.keywordId);

  return {
    slideId: slide.slideId,
    transcript,
    coverage,
    detectedKeywords: detectedKeywords.map((event) => ({
      ...event,
      coverage
    })),
    missingKeywordIds
  };
}

export function shouldAutoAdvanceLiveSlide(options: {
  analysis: Pick<LiveTranscriptAnalysis, "coverage" | "missingKeywordIds">;
  currentSlideIndex: number;
  slideCount: number;
  keywordCount: number;
  alreadyAdvanced: boolean;
}) {
  return (
    options.keywordCount > 0 &&
    !options.alreadyAdvanced &&
    options.currentSlideIndex < options.slideCount - 1 &&
    options.analysis.coverage >= liveAutoAdvanceCoverageThreshold
  );
}

function getLiveKeywordCandidates(slide: Slide): LiveKeywordCandidate[] {
  return slide.keywords.map((keyword) => ({
    keyword,
    aliases: [keyword.text, ...keyword.synonyms, ...keyword.abbreviations].filter(
      (value) => value.trim().length > 0
    )
  }));
}

function createDefaultLiveSttAdapter() {
  return window.__orbitCreateLiveSttAdapter?.() ?? new SherpaLiveSttAdapter();
}

export function RehearsalWorkspace(props: {
  initialDeck?: Deck;
  fallbackDeck?: Deck;
  liveSttAdapter?: LiveSttAdapter;
  autoAdvanceDelayMs?: number;
  projectId?: string;
}) {
  const [deck, setDeck] = useState<Deck | null>(props.initialDeck ?? null);
  const [currentSlideIndex, setCurrentSlideIndex] = useState(0);
  const [phase, setPhase] = useState<RehearsalPhase>(
    props.initialDeck ? "idle" : "loading"
  );
  const [error, setError] = useState("");
  const [run, setRun] = useState<RehearsalRun | null>(null);
  const [job, setJob] = useState<Job | null>(null);
  const [liveStatus, setLiveStatus] = useState<LiveSttStatus>("idle");
  const [liveError, setLiveError] = useState("");
  const [liveTranscript, setLiveTranscript] = useState("");
  const [liveKeywordState, setLiveKeywordState] =
    useState<LiveTranscriptAnalysis | null>(null);
  const [liveCue, setLiveCue] = useState<LiveSttAnimationCueEvent | null>(null);
  const [liveSlideAdvance, setLiveSlideAdvance] =
    useState<LiveSttSlideAdvanceEvent | null>(null);
  const [autoAdvanceState, setAutoAdvanceState] = useState<
    "idle" | "pending" | "advanced" | "cancelled"
  >("idle");
  const sessionRef = useRef<RecordingSession | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const liveSttAdapterRef = useRef<LiveSttAdapter | null>(
    props.liveSttAdapter ?? null
  );
  const deckRef = useRef<Deck | null>(props.initialDeck ?? null);
  const currentSlideIndexRef = useRef(0);
  const liveKeywordStateRef = useRef<LiveTranscriptAnalysis | null>(null);
  const autoAdvancedSlideIdsRef = useRef(new Set<string>());
  const autoAdvanceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (props.initialDeck) {
      return;
    }

    let isCancelled = false;
    setPhase("loading");
    void fetchOrCreateRehearsalDeck({
      projectId: props.projectId,
      fallbackDeck: props.fallbackDeck
    })
      .then((nextDeck) => {
        if (!isCancelled) {
          setDeck(nextDeck);
          setPhase("idle");
        }
      })
      .catch((cause) => {
        if (!isCancelled) {
          setError(toErrorMessage(cause));
          setPhase("failed");
        }
      });

    return () => {
      isCancelled = true;
      stopMediaStream(streamRef.current);
    };
  }, [props.fallbackDeck, props.initialDeck, props.projectId]);

  useEffect(() => {
    deckRef.current = deck;
  }, [deck]);

  useEffect(() => {
    currentSlideIndexRef.current = currentSlideIndex;
  }, [currentSlideIndex]);

  useEffect(() => {
    liveKeywordStateRef.current = liveKeywordState;
  }, [liveKeywordState]);

  useEffect(() => {
    return () => {
      cancelPendingAutoAdvance("cancelled");
      liveSttAdapterRef.current?.stop();
      liveSttAdapterRef.current?.dispose();
    };
  }, []);

  const currentSlide = deck?.slides[currentSlideIndex] ?? null;
  const canRecord = Boolean(deck) && !["recording", "uploading", "processing"].includes(phase);
  const statusMessage = buildStatusMessage(phase, job, run);

  useEffect(() => {
    if (!currentSlide) {
      setLiveKeywordState(null);
      return;
    }

    setLiveKeywordState(evaluateLiveTranscript(currentSlide, liveTranscript));
    setLiveCue(null);
  }, [currentSlide?.slideId]);

  async function startRecording() {
    if (!deck || !canRecord) return;
    const activeDeck = deck;

    setError("");
    setRun(null);
    setJob(null);
    setLiveError("");
    setLiveTranscript("");
    setLiveKeywordState(currentSlide ? evaluateLiveTranscript(currentSlide, "") : null);
    setLiveCue(null);
    setLiveSlideAdvance(null);
    setAutoAdvanceState("idle");
    autoAdvancedSlideIdsRef.current.clear();

    if (!navigator.mediaDevices?.getUserMedia) {
      setError("이 브라우저는 마이크 녹음을 지원하지 않습니다.");
      setPhase("failed");
      return;
    }

    let stream: MediaStream | null = null;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const session = createRecordingSession(stream, {
        onError: (recordingError) => {
          stopMediaStream(stream);
          if (streamRef.current === stream) {
            streamRef.current = null;
          }
          sessionRef.current = null;
          setError(recordingError.message);
          setPhase("failed");
        },
        onStop: (audioFile) => {
          stopMediaStream(stream);
          if (streamRef.current === stream) {
            streamRef.current = null;
          }
          sessionRef.current = null;
          void submitRecording(activeDeck, audioFile);
        }
      });
      streamRef.current = stream;
      sessionRef.current = session;
      session.start();
      setPhase("recording");
      void startLiveStt(stream);
    } catch (cause) {
      stopMediaStream(stream);
      if (streamRef.current === stream) {
        streamRef.current = null;
      }
      sessionRef.current = null;
      setError(toMicrophoneErrorMessage(cause));
      setPhase("failed");
    }
  }

  function stopRecording() {
    if (phase !== "recording") return;

    setPhase("uploading");
    cancelPendingAutoAdvance("cancelled");
    liveSttAdapterRef.current?.stop();
    setLiveStatus((current) =>
      current === "listening" || current === "starting" ? "stopped" : current
    );
    sessionRef.current?.stop();
    stopMediaStream(streamRef.current);
    streamRef.current = null;
    sessionRef.current = null;
  }

  async function startLiveStt(stream: MediaStream) {
    const adapter =
      props.liveSttAdapter ?? liveSttAdapterRef.current ?? createDefaultLiveSttAdapter();
    liveSttAdapterRef.current = adapter;
    setLiveStatus("starting");

    try {
      await adapter.start(stream, {
        onPartialTranscript: handleLivePartialTranscript,
        onError: handleLiveSttError
      });
      setLiveStatus("listening");
    } catch (cause) {
      const error = toLiveSttAdapterError(cause);
      setLiveStatus(
        error.code === "LIVE_STT_MODEL_UNAVAILABLE" ? "unavailable" : "failed"
      );
      setLiveError(error.message);
      cancelPendingAutoAdvance("cancelled");
    }
  }

  function handleLiveSttError(error: LiveSttAdapterError) {
    setLiveStatus(
      error.code === "LIVE_STT_MODEL_UNAVAILABLE" ? "unavailable" : "failed"
    );
    setLiveError(error.message);
    cancelPendingAutoAdvance("cancelled");
  }

  function handleLivePartialTranscript(event: LiveSttPartialTranscriptEvent) {
    const deckSnapshot = deckRef.current;
    const slideIndex = currentSlideIndexRef.current;
    const slide = deckSnapshot?.slides[slideIndex];
    if (!deckSnapshot || !slide) {
      return;
    }

    const analysis = evaluateLiveTranscript(slide, event.transcript);
    setLiveTranscript(event.transcript);
    setLiveKeywordState(analysis);
    setLiveStatus("listening");

    const previousDetectedIds = new Set(
      liveKeywordStateRef.current?.slideId === slide.slideId
        ? liveKeywordStateRef.current.detectedKeywords.map(
            (keyword) => keyword.keywordId
          )
        : []
    );
    const newlyDetected = analysis.detectedKeywords.find(
      (keyword) => !previousDetectedIds.has(keyword.keywordId)
    );

    if (newlyDetected) {
      setLiveCue({
        type: "animation-cue",
        slideId: slide.slideId,
        keywordId: newlyDetected.keywordId,
        cue: "emphasis",
        text: newlyDetected.text
      });
    }

    if (
      shouldAutoAdvanceLiveSlide({
        analysis,
        currentSlideIndex: slideIndex,
        slideCount: deckSnapshot.slides.length,
        keywordCount: slide.keywords.length,
        alreadyAdvanced: autoAdvancedSlideIdsRef.current.has(slide.slideId)
      })
    ) {
      scheduleAutoAdvance(deckSnapshot, slideIndex, analysis.coverage);
    }
  }

  function scheduleAutoAdvance(
    deckSnapshot: Deck,
    fromSlideIndex: number,
    coverage: number
  ) {
    const fromSlide = deckSnapshot.slides[fromSlideIndex];
    const toSlide = deckSnapshot.slides[fromSlideIndex + 1];
    if (!fromSlide || !toSlide) {
      return;
    }

    if (autoAdvanceTimerRef.current) {
      return;
    }

    setAutoAdvanceState("pending");
    autoAdvanceTimerRef.current = setTimeout(() => {
      autoAdvanceTimerRef.current = null;
      const latestDeck = deckRef.current;
      const latestIndex = currentSlideIndexRef.current;
      if (latestDeck?.slides[latestIndex]?.slideId !== fromSlide.slideId) {
        setAutoAdvanceState("cancelled");
        return;
      }

      autoAdvancedSlideIdsRef.current.add(fromSlide.slideId);
      setCurrentSlideIndex(fromSlideIndex + 1);
      setLiveSlideAdvance({
        type: "slide-advance",
        fromSlideId: fromSlide.slideId,
        toSlideId: toSlide.slideId,
        reason: "keyword-coverage",
        coverage
      });
      setAutoAdvanceState("advanced");
    }, props.autoAdvanceDelayMs ?? defaultLiveAutoAdvanceDelayMs);
  }

  function cancelPendingAutoAdvance(
    nextState: "idle" | "cancelled" = "cancelled"
  ) {
    if (autoAdvanceTimerRef.current) {
      clearTimeout(autoAdvanceTimerRef.current);
      autoAdvanceTimerRef.current = null;
      setAutoAdvanceState(nextState);
    }
  }

  async function submitRecording(activeDeck: Deck, audioFile: File) {
    setPhase("uploading");
    setError("");

    try {
      const result = await runRehearsalUploadFlow({
        projectId: activeDeck.projectId,
        deckId: activeDeck.deckId,
        audioFile,
        onJobUpdate: (nextJob) => {
          setJob(nextJob);
          setPhase("processing");
        }
      });
      setRun(result.run);
      setJob(result.job);

      if (result.job.status === "failed") {
        setPhase("failed");
        setError(result.job.error?.message || result.job.message || "리허설 분석에 실패했습니다.");
        return;
      }

      setPhase("succeeded");
    } catch (cause) {
      setError(toRehearsalFlowMessage(cause));
      setPhase("failed");
    }
  }

  const goPrevious = () => {
    cancelPendingAutoAdvance("cancelled");
    setCurrentSlideIndex((current) => Math.max(0, current - 1));
  };
  const goNext = () => {
    if (!deck) return;
    cancelPendingAutoAdvance("cancelled");
    setCurrentSlideIndex((current) => Math.min(deck.slides.length - 1, current + 1));
  };

  const liveCoveragePercent = Math.round((liveKeywordState?.coverage ?? 0) * 100);
  const liveDetectedKeywordIds = new Set(
    liveKeywordState?.detectedKeywords.map((keyword) => keyword.keywordId) ?? []
  );
  const liveMissingKeywordIds = new Set(liveKeywordState?.missingKeywordIds ?? []);

  return (
    <main className="app-shell rehearsal-app-shell">
      <section className="rehearsal-topbar">
        <div>
          <p className="eyebrow">ORBIT-36</p>
          <h1>리허설</h1>
        </div>
        <div className={`rehearsal-status rehearsal-status-${phase}`} aria-live="polite">
          {phase === "succeeded" ? <CheckCircle2 size={18} /> : <Loader2 size={18} />}
          <span>{statusMessage}</span>
        </div>
      </section>

      <section className="rehearsal-layout">
        <section className="panel rehearsal-stage-panel">
          {currentSlide ? (
            <>
              <DeckSlidePreview deck={deck} slide={currentSlide} />
              <div className="rehearsal-slide-controls">
                <button
                  type="button"
                  onClick={goPrevious}
                  disabled={currentSlideIndex === 0}
                  aria-label="이전 슬라이드"
                  title="이전 슬라이드"
                >
                  <ChevronLeft size={18} />
                </button>
                <span>
                  {currentSlideIndex + 1} / {deck?.slides.length ?? 0}
                </span>
                <button
                  type="button"
                  onClick={goNext}
                  disabled={!deck || currentSlideIndex >= deck.slides.length - 1}
                  aria-label="다음 슬라이드"
                  title="다음 슬라이드"
                >
                  <ChevronRight size={18} />
                </button>
              </div>
            </>
          ) : (
            <div className="rehearsal-empty-stage">발표자료 로딩 중</div>
          )}
        </section>

        <aside className="rehearsal-side">
          <section className="panel rehearsal-live-panel">
            <div className="project-panel-heading">
              <Mic size={20} />
              <div>
                <p className="panel-kicker">Live STT</p>
                <h2>실시간 제어</h2>
              </div>
            </div>

            <div className={`rehearsal-live-status rehearsal-live-status-${liveStatus}`}>
              <strong>{liveStatus}</strong>
              <span>{autoAdvanceState === "pending" ? "자동 전환 대기" : "자동 전환 활성"}</span>
            </div>

            <div className="rehearsal-live-transcript">
              <span>Partial transcript</span>
              <p>{liveTranscript || "마이크 입력을 기다리는 중"}</p>
            </div>

            <div className="rehearsal-live-coverage">
              <strong>{liveCoveragePercent}%</strong>
              <span>keyword coverage</span>
            </div>

            <div className="rehearsal-live-keywords">
              {(currentSlide?.keywords ?? []).length > 0 ? (
                currentSlide?.keywords.map((keyword) => {
                  const state = liveDetectedKeywordIds.has(keyword.keywordId)
                    ? "detected"
                    : liveMissingKeywordIds.has(keyword.keywordId)
                      ? "missing"
                      : "idle";
                  return (
                    <span className={`live-keyword live-keyword-${state}`} key={keyword.keywordId}>
                      {keyword.text}
                    </span>
                  );
                })
              ) : (
                <span className="live-keyword live-keyword-idle">키워드 없음</span>
              )}
            </div>

            {liveCue && (
              <div className="job-status" aria-live="polite">
                <div>
                  <strong>emphasis</strong>
                  <span>{liveCue.text}</span>
                </div>
                <p>현재 슬라이드에서 키워드를 감지했습니다.</p>
              </div>
            )}

            {liveSlideAdvance && (
              <div className="project-status-message project-status-success">
                <CheckCircle2 size={18} />
                <span>키워드 {Math.round(liveSlideAdvance.coverage * 100)}% 감지로 자동 전환</span>
              </div>
            )}

            {liveError && (
              <div className="project-status-message project-status-danger" role="status">
                <AlertCircle size={18} />
                <span>{liveError}</span>
              </div>
            )}
          </section>

          <section className="panel rehearsal-record-panel">
            <div className="project-panel-heading">
              <Mic size={20} />
              <div>
                <p className="panel-kicker">Report AI</p>
                <h2>리포트 분석</h2>
              </div>
            </div>

            <div className="rehearsal-recorder-actions">
              <button
                className="primary-action"
                type="button"
                onClick={() => void startRecording()}
                disabled={!canRecord}
              >
                <Mic size={18} />
                리포트 녹음 시작
              </button>
              <button
                className="secondary-action"
                type="button"
                onClick={stopRecording}
                disabled={phase !== "recording"}
              >
                <Square size={18} />
                리포트 녹음 종료
              </button>
            </div>

            {job && (
              <div className="job-status" aria-live="polite">
                <div>
                  <strong>report {job.status}</strong>
                  <span>{job.progress}%</span>
                </div>
                <p>{job.message}</p>
              </div>
            )}

            {error && (
              <div className="project-status-message project-status-danger" role="alert">
                <AlertCircle size={18} />
                <span>{error}</span>
              </div>
            )}

            {phase === "succeeded" && (
              <div className="project-status-message project-status-success">
                <CheckCircle2 size={18} />
                <span>{run?.rawAudioDeletedAt ? "raw audio 삭제 완료" : "분석 완료"}</span>
              </div>
            )}
          </section>

          <SlideNotesPanel slide={currentSlide} />
        </aside>
      </section>
    </main>
  );
}

function DeckSlidePreview(props: { deck: Deck | null; slide: Slide }) {
  const { deck, slide } = props;
  const backgroundColor =
    slide.style.backgroundColor ?? deck?.theme.backgroundColor ?? "#ffffff";
  const textColor = slide.style.textColor ?? deck?.theme.textColor ?? "#15202b";
  const titleText = getSlideTitle(slide);

  return (
    <div
      className="rehearsal-slide-preview"
      style={{ backgroundColor, color: textColor }}
    >
      <div className="rehearsal-slide-title">{titleText}</div>
      <div className="rehearsal-slide-content">
        {slide.elements
          .filter((element): element is Extract<DeckElement, { type: "text" }> =>
            element.type === "text" && Boolean(element.props.text.trim())
          )
          .slice(0, 4)
          .map((element) => (
            <p key={element.elementId}>{element.props.text}</p>
          ))}
      </div>
    </div>
  );
}

function SlideNotesPanel(props: { slide: Slide | null }) {
  const keywords = props.slide?.keywords ?? [];
  return (
    <section className="panel rehearsal-notes-panel">
      <p className="panel-kicker">Slide</p>
      <h2>{props.slide ? getSlideTitle(props.slide) : "슬라이드"}</h2>

      <div className="rehearsal-notes-block">
        <span>Speaker notes</span>
        <p>{props.slide?.speakerNotes || "노트 없음"}</p>
      </div>

      <div className="rehearsal-keyword-list">
        {keywords.length > 0 ? (
          keywords.map((keyword) => <span key={keyword.keywordId}>{keyword.text}</span>)
        ) : (
          <span>키워드 없음</span>
        )}
      </div>
    </section>
  );
}

function buildStatusMessage(phase: RehearsalPhase, job: Job | null, run: RehearsalRun | null) {
  if (job?.status === "failed") {
    return job.error?.code ?? "failed";
  }

  if (run?.status === "succeeded") {
    return "succeeded";
  }

  switch (phase) {
    case "loading":
      return "loading deck";
    case "recording":
      return "recording";
    case "uploading":
      return "uploading";
    case "processing":
      return job ? `${job.status} ${job.progress}%` : "processing";
    case "succeeded":
      return "succeeded";
    case "failed":
      return "failed";
    default:
      return "ready";
  }
}

function getSlideTitle(slide: Slide) {
  const title = slide.title.trim();
  if (title) return title;

  const titleElement = slide.elements.find(
    (element): element is Extract<DeckElement, { type: "text" }> =>
      element.type === "text" && element.role === "title"
  );
  return titleElement?.props.text || `Slide ${slide.order}`;
}

function stopMediaStream(stream: MediaStream | null) {
  stream?.getTracks().forEach((track) => track.stop());
}

async function readErrorMessage(response: Response, fallback: string) {
  const message = await response.text();
  return message || fallback;
}

function toMicrophoneErrorMessage(cause: unknown) {
  if (cause instanceof DOMException && cause.name === "NotAllowedError") {
    return "마이크 권한이 거부되었습니다.";
  }

  if (cause instanceof DOMException && cause.name === "NotFoundError") {
    return "사용할 수 있는 마이크를 찾지 못했습니다.";
  }

  return toErrorMessage(cause) || "녹음을 시작하지 못했습니다.";
}

function toRehearsalFlowMessage(cause: unknown) {
  if (cause instanceof RehearsalFlowError) {
    if (cause.stage === "storage-put") {
      return "업로드가 중단되었습니다. 네트워크와 스토리지 연결을 확인하세요.";
    }

    if (cause.stage === "complete" || cause.stage === "job-poll") {
      return cause.message || "STT 또는 코칭 분석 작업에 실패했습니다.";
    }
  }

  return toErrorMessage(cause);
}

function toLiveSttAdapterError(cause: unknown) {
  if (cause instanceof LiveSttAdapterError) {
    return cause;
  }

  return new LiveSttAdapterError(
    "LIVE_STT_START_FAILED",
    cause instanceof Error ? cause.message : "Live STT를 시작하지 못했습니다."
  );
}

function toErrorMessage(cause: unknown) {
  return cause instanceof Error ? cause.message : "요청을 처리하지 못했습니다.";
}

function extensionForMimeType(mimeType: string) {
  if (mimeType.includes("mp4")) return "m4a";
  if (mimeType.includes("ogg")) return "ogg";
  return "webm";
}
