import {
  demoIds,
  type AssetUploadUrlResponse,
  type CompleteRehearsalAudioUploadResponse,
  type CreateRehearsalAudioUploadUrlResponse,
  type CreateRehearsalRunResponse,
  type Deck,
  type DeckElement,
  type GetRehearsalReportResponse,
  type GetDeckResponse,
  type Job,
  type Keyword,
  type LiveSttAnimationCueEvent,
  type LiveSttKeywordDetectedEvent,
  type LiveSttPartialTranscriptEvent,
  type LiveSttSlideAdvanceEvent,
  type PutDeckResponse,
  type RehearsalReport,
  type RehearsalRun,
  type Slide
} from "@orbit/shared";
import {
  BarChart3,
  AlertCircle,
  CalendarDays,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  Download,
  Gauge,
  Home,
  Mic,
  Monitor,
  MoreHorizontal,
  PlayCircle,
  Presentation,
  RotateCcw,
  Save,
  Sparkles,
  Square,
  Target,
  TrendingUp,
  Volume2
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { resolveEditorAssetUrl } from "../editor/shared/editorAssetUrl";
import {
  LiveSttAdapterError,
  type LiveSttAdapter,
  type LiveSttAudioLevelEvent,
  type LiveSttBiasContext,
  type LiveSttBiasMode,
  type LiveSttBiasSource,
  type LiveSttBiasTerm,
  type LiveSttDecodingMethod
} from "./liveStt";
import {
  isLiveSttPcmDebugEnabled,
  type LiveSttDebugPcmRecording
} from "./liveSttPcmDebug";
import {
  confirmRehearsalCommandCandidate,
  createRehearsalCommandConfirmationState,
  defaultRehearsalCommandConfig,
  detectRehearsalCommandCandidate,
  getRehearsalCommandBiasTerms,
  type RehearsalCommandCandidate,
  type RehearsalCommandDefinition
} from "./rehearsalCommands";
import { WebSpeechLiveSttAdapter } from "./webSpeechLiveSttAdapter";

export {
  LiveSttAdapterError,
  type LiveSttAdapter,
  type LiveSttAudioLevelEvent,
  type LiveSttCallbacks
} from "./liveStt";
export {
  SherpaLiveSttAdapter,
  SherpaOnnxLiveSttAdapter,
  resampleFloat32Audio
} from "./sherpaOnnxLiveSttAdapter";
export { WebSpeechLiveSttAdapter } from "./webSpeechLiveSttAdapter";

type Fetcher = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
type RehearsalPhase =
  | "idle"
  | "loading"
  | "recording"
  | "uploading"
  | "processing"
  | "succeeded"
  | "failed";
type RehearsalTimeMode = "stopwatch" | "timer";
type RehearsalFlowStage =
  | "deck"
  | "run"
  | "upload-url"
  | "storage-put"
  | "complete"
  | "job-poll"
  | "run-fetch"
  | "report-fetch";
type LiveSttStatus = "idle" | "starting" | "listening" | "unavailable" | "failed" | "stopped";
type RehearsalReportStatus = "idle" | "loading" | "ready" | "not-ready" | "failed";

type RecordingSession = {
  recorder: MediaRecorder;
  start: () => void;
  stop: () => void;
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

type LiveTranscriptBuffer = {
  committedTranscript: string;
  draftTranscript: string;
};

type BiasTermDraft = Omit<LiveSttBiasTerm, "text"> & { text: string };

const preferredAudioMimeTypes = [
  "audio/webm;codecs=opus",
  "audio/webm",
  "audio/mp4"
];
export const rehearsalMicrophoneAudioConstraints: MediaTrackConstraints = {
  echoCancellation: true,
  noiseSuppression: true,
  autoGainControl: true,
  channelCount: 1
};
export const rehearsalRawMicrophoneAudioConstraints: MediaTrackConstraints = {
  echoCancellation: false,
  noiseSuppression: false,
  autoGainControl: false,
  channelCount: 1
};
const liveAutoAdvanceCoverageThreshold = 0.8;
const defaultLiveAutoAdvanceDelayMs = 800;
const liveSttBiasModeStorageKey = "orbit.liveStt.biasMode";
const liveSttRawMicDebugStorageKey = "orbit.liveStt.debugRawMic";
const liveSttDebugDecodingMethodStorageKey =
  "orbit.liveStt.debugDecodingMethod";
const maxLiveSttBiasTerms = 32;
const maxLiveSttContextBiasTermLength = 36;

export class RehearsalFlowError extends Error {
  constructor(
    readonly stage: RehearsalFlowStage,
    message: string
  ) {
    super(message);
    this.name = "RehearsalFlowError";
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
      await readErrorMessage(response, "諛쒗몴?먮즺瑜?遺덈윭?ㅼ? 紐삵뻽?듬땲??")
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
        await readErrorMessage(putResponse, "由ы뿀??諛쒗몴?먮즺瑜?珥덇린?뷀븯吏 紐삵뻽?듬땲??")
      );
    }

    const payload = (await putResponse.json()) as PutDeckResponse;
    return payload.deck;
  }

  throw new RehearsalFlowError(
    "deck",
    await readErrorMessage(response, "諛쒗몴?먮즺瑜?遺덈윭?ㅼ? 紐삵뻽?듬땲??")
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
      await readErrorMessage(response, "由ы뿀??run??留뚮뱾吏 紐삵뻽?듬땲??")
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
      await readErrorMessage(response, "由ы뿀???ㅻ뵒???낅줈??URL??諛쒓툒?섏? 紐삵뻽?듬땲??")
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
      await readErrorMessage(response, "由ы뿀???ㅻ뵒???낅줈?쒓? 以묐떒?섏뿀?듬땲??")
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
      await readErrorMessage(response, "由ы뿀??STT ?묒뾽???쒖옉?섏? 紐삵뻽?듬땲??")
    );
  }

  return (await response.json()) as CompleteRehearsalAudioUploadResponse;
}

export async function fetchRehearsalRun(runId: string, fetcher: Fetcher = fetch) {
  const response = await fetcher(`/api/v1/rehearsals/${runId}`);
  if (!response.ok) {
    throw new RehearsalFlowError(
      "run-fetch",
      await readErrorMessage(response, "由ы뿀??run ?곹깭瑜?遺덈윭?ㅼ? 紐삵뻽?듬땲??")
    );
  }

  const payload = (await response.json()) as { run: RehearsalRun };
  return payload.run;
}

export async function fetchRehearsalReport(runId: string, fetcher: Fetcher = fetch) {
  const response = await fetcher(`/api/v1/rehearsals/${runId}/report`);
  if (!response.ok) {
    throw new RehearsalFlowError(
      "report-fetch",
      await readErrorMessage(response, "리허설 보고서를 불러오지 못했습니다.")
    );
  }

  return (await response.json()) as GetRehearsalReportResponse;
}

export function resolveRehearsalReportLoadState(
  response: GetRehearsalReportResponse,
  requestedProjectId: string
): { error: string; status: RehearsalReportStatus } {
  if (response.run.projectId !== requestedProjectId) {
    return {
      error: "요청한 프로젝트와 리허설 실행 정보가 일치하지 않습니다.",
      status: "failed"
    };
  }

  if (response.run.status === "failed") {
    return {
      error: response.run.error?.message || "리허설 분석 작업이 실패했습니다.",
      status: "failed"
    };
  }

  return {
    error: "",
    status: response.report ? "ready" : "not-ready"
  };
}

export function getRehearsalReportPath(projectId: string, runId: string) {
  return `/rehearsal/${encodeURIComponent(projectId)}/report/${encodeURIComponent(runId)}`;
}

export function getRehearsalFinishPath(
  projectId: string,
  run: Pick<RehearsalRun, "runId" | "status"> | null
) {
  if (run?.runId) {
    return getRehearsalReportPath(projectId, run.runId);
  }

  return `/project/${encodeURIComponent(projectId)}`;
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
        await readErrorMessage(response, "由ы뿀???묒뾽 ?곹깭瑜?遺덈윭?ㅼ? 紐삵뻽?듬땲??")
      );
    }

    const job = (await response.json()) as Job;
    options.onUpdate?.(job);
    if (job.status === "succeeded" || job.status === "failed") {
      return job;
    }

    if (Date.now() > timeoutAt) {
      throw new RehearsalFlowError("job-poll", "由ы뿀???묒뾽???쒓컙 ?댁뿉 ?앸굹吏 ?딆븯?듬땲??");
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
    preferredAudioMimeTypes.find((mimeType) => recorderCtor.isTypeSupported(mimeType)) ??
    "audio/webm"
  );
}

export function createRecordingFile(blob: Blob, mimeType: string, now: Date = new Date()) {
  const normalizedMimeType = normalizeRecordingMimeType(mimeType || blob.type);
  const safeTimestamp = now.toISOString().replace(/[:.]/g, "-");
  return new File(
    [blob],
    `rehearsal-${safeTimestamp}.${extensionForMimeType(normalizedMimeType)}`,
    {
      type: normalizedMimeType
    }
  );
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
    options.onError(new Error("?뱀쓬 以??ㅻ쪟媛 諛쒖깮?덉뒿?덈떎."));
  };
  recorder.onstop = () => {
    if (chunks.length === 0) {
      options.onError(new Error("?뱀쓬???ㅻ뵒?ㅺ? 鍮꾩뼱 ?덉뒿?덈떎."));
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

export function getLiveSttBiasMode(): LiveSttBiasMode {
  if (typeof window === "undefined") {
    return "combined";
  }

  try {
    const value = window.localStorage?.getItem(liveSttBiasModeStorageKey);
    return isLiveSttBiasMode(value) ? value : "combined";
  } catch {
    return "combined";
  }
}

export function buildLiveSttBiasContext(
  slide: Slide,
  options: {
    nearbySlides?: Slide[];
    commandConfig?: RehearsalCommandDefinition[];
  } = {}
): LiveSttBiasContext {
  const terms = new Map<string, LiveSttBiasTerm>();
  const addTerm = (draft: BiasTermDraft) => {
    const text = normalizeBiasTermText(draft.text);
    const normalized = normalizeLiveTranscriptText(text);
    if (!text || !normalized) {
      return;
    }
    if (
      !isKeywordBiasSource(draft.source) &&
      normalized.length > maxLiveSttContextBiasTermLength
    ) {
      return;
    }

    const existing = terms.get(normalized);
    const next: LiveSttBiasTerm = { ...draft, text };
    if (!existing || existing.weight < next.weight) {
      terms.set(normalized, next);
    }
  };

  for (const keyword of slide.keywords) {
    addTerm({
      text: keyword.text,
      source: "keyword",
      weight: 1,
      keywordId: keyword.keywordId,
      canonicalText: keyword.text
    });
    for (const synonym of keyword.synonyms) {
      addTerm({
        text: synonym,
        source: "synonym",
        weight: 0.95,
        keywordId: keyword.keywordId,
        canonicalText: keyword.text
      });
    }
    for (const abbreviation of keyword.abbreviations) {
      addTerm({
        text: abbreviation,
        source: "abbreviation",
        weight: 0.9,
        keywordId: keyword.keywordId,
        canonicalText: keyword.text
      });
    }
  }

  addTerm({ text: getSlideTitle(slide), source: "title", weight: 0.7 });

  for (const text of getSlideBodyTexts(slide)) {
    addTerm({ text, source: "slide-text", weight: 0.55 });
    for (const extracted of extractBiasTermsFromText(text)) {
      addTerm({ text: extracted, source: "slide-text", weight: 0.5 });
    }
  }

  for (const extracted of extractBiasTermsFromText(slide.speakerNotes)) {
    addTerm({ text: extracted, source: "speaker-notes", weight: 0.45 });
  }

  for (const nearbySlide of options.nearbySlides ?? []) {
    if (nearbySlide.slideId === slide.slideId) {
      continue;
    }

    addTerm({
      text: getSlideTitle(nearbySlide),
      source: "nearby-slide-text",
      weight: 0.35
    });
    for (const text of getSlideBodyTexts(nearbySlide)) {
      for (const extracted of extractBiasTermsFromText(text)) {
        addTerm({
          text: extracted,
          source: "nearby-slide-text",
          weight: 0.3
        });
      }
    }
  }

  for (const term of getRehearsalCommandBiasTerms(
    options.commandConfig ?? defaultRehearsalCommandConfig
  )) {
    addTerm(term);
  }

  const sortedTerms = Array.from(terms.values()).sort(compareBiasTerms);
  const controlTerms = sortedTerms.filter(
    (term) => term.source === "control-phrase"
  );
  const otherTerms = sortedTerms.filter(
    (term) => term.source !== "control-phrase"
  );
  const reservedControlTerms = controlTerms.slice(0, maxLiveSttBiasTerms);
  const remainingSlots = Math.max(
    0,
    maxLiveSttBiasTerms - reservedControlTerms.length
  );
  const selectedTerms = [
    ...otherTerms.slice(0, remainingSlots),
    ...reservedControlTerms
  ].sort(compareBiasTerms);

  return {
    slideId: slide.slideId,
    terms: selectedTerms
  };
}

export function applyLiveTranscriptBias(
  transcript: string,
  biasContext: LiveSttBiasContext | null | undefined
) {
  if (!biasContext || biasContext.terms.length === 0) {
    return transcript;
  }

  const normalizedTranscript = normalizeLiveTranscriptText(transcript);
  if (!normalizedTranscript) {
    return transcript;
  }

  const additions: string[] = [];
  const seenAdditions = new Set<string>();
  for (const term of biasContext.terms) {
    if (!term.keywordId || term.weight < 0.85) {
      continue;
    }

    const normalizedTerm = normalizeLiveTranscriptText(term.text);
    if (
      normalizedTerm.length < 3 ||
      normalizedTranscript.includes(normalizedTerm) ||
      !hasFuzzyBiasMatch(transcript, normalizedTerm)
    ) {
      continue;
    }

    const addition = normalizeBiasTermText(term.canonicalText ?? term.text);
    const additionKey = normalizeLiveTranscriptText(addition);
    if (addition && !seenAdditions.has(additionKey)) {
      seenAdditions.add(additionKey);
      additions.push(addition);
    }
  }

  return appendLiveTranscriptText(transcript, additions.join(" "));
}

export function createLiveTranscriptBuffer(): LiveTranscriptBuffer {
  return {
    committedTranscript: "",
    draftTranscript: ""
  };
}

export function applyLiveTranscriptEvent(
  buffer: LiveTranscriptBuffer,
  event: Pick<LiveSttPartialTranscriptEvent, "transcript" | "isFinal">
): LiveTranscriptBuffer {
  const transcript = normalizeLiveTranscriptDisplayText(event.transcript);

  if (event.isFinal) {
    return {
      committedTranscript: appendLiveTranscriptText(
        buffer.committedTranscript,
        transcript
      ),
      draftTranscript: ""
    };
  }

  return {
    ...buffer,
    draftTranscript: transcript
  };
}

export function renderLiveTranscriptBuffer(buffer: LiveTranscriptBuffer) {
  return appendLiveTranscriptText(buffer.committedTranscript, buffer.draftTranscript);
}

function appendLiveTranscriptText(current: string, next: string) {
  return [current, next]
    .map(normalizeLiveTranscriptDisplayText)
    .filter((part) => part.length > 0)
    .join(" ");
}

function normalizeLiveTranscriptDisplayText(value: string) {
  return value.replace(/\s+/g, " ").trim();
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
  const coverage = candidates.length === 0 ? 0 : detectedKeywords.length / candidates.length;
  const missingKeywordIds = candidates
    .filter(
      (candidate) =>
        !detectedKeywords.some((event) => event.keywordId === candidate.keyword.keywordId)
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

export function shouldCompleteLiveSlideAdvance(
  options: {
    confirmedCommand: RehearsalCommandCandidate | null;
  } & Parameters<typeof shouldAutoAdvanceLiveSlide>[0]
) {
  return (
    isAdvanceSlideCommand(options.confirmedCommand) &&
    shouldAutoAdvanceLiveSlide(options)
  );
}

export function getLiveAudioLevelLabel(level: LiveSttAudioLevelEvent | null) {
  if (!level) {
    return "입력 대기";
  }

  if (level.peakDb > -3) {
    return "입력 과대";
  }

  return level.isLikelySilence ? "입력 낮음" : "입력 적정";
}

export function getLiveAudioLevelPercent(level: LiveSttAudioLevelEvent | null) {
  if (!level) {
    return 0;
  }

  return clamp(((level.rmsDb + 55) / 55) * 100, 0, 100);
}

export function requestRehearsalMicrophoneStream(
  mediaDevices: Pick<MediaDevices, "getUserMedia"> = navigator.mediaDevices
) {
  return mediaDevices.getUserMedia({
    audio: getRehearsalMicrophoneAudioConstraints()
  });
}

export function getRehearsalMicrophoneAudioConstraints(
  storage: Pick<Storage, "getItem"> | null = readBrowserLocalStorage()
) {
  return isLiveSttRawMicDebugEnabled(storage)
    ? rehearsalRawMicrophoneAudioConstraints
    : rehearsalMicrophoneAudioConstraints;
}

export function isLiveSttRawMicDebugEnabled(
  storage: Pick<Storage, "getItem"> | null = readBrowserLocalStorage()
) {
  try {
    return storage?.getItem(liveSttRawMicDebugStorageKey) === "1";
  } catch {
    return false;
  }
}

export function getLiveSttDebugDecodingMethod(
  storage: Pick<Storage, "getItem"> | null = readBrowserLocalStorage()
): LiveSttDecodingMethod | null {
  try {
    const value = storage?.getItem(liveSttDebugDecodingMethodStorageKey);
    return isLiveSttDecodingMethod(value) ? value : null;
  } catch {
    return null;
  }
}

export function shouldShowLiveSttDebugPcmDownload(
  recording: LiveSttDebugPcmRecording | null,
  storage: Pick<Storage, "getItem"> | null = readBrowserLocalStorage()
) {
  return Boolean(recording) && isLiveSttPcmDebugEnabled(storage);
}

export function downloadLiveSttDebugPcm(recording: LiveSttDebugPcmRecording) {
  const url = URL.createObjectURL(recording.blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = recording.filename;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function getLiveKeywordCandidates(slide: Slide): LiveKeywordCandidate[] {
  return slide.keywords.map((keyword) => ({
    keyword,
    aliases: [keyword.text, ...keyword.synonyms, ...keyword.abbreviations].filter(
      (value) => value.trim().length > 0
    )
  }));
}

function isLiveSttBiasMode(value: unknown): value is LiveSttBiasMode {
  return (
    value === "none" ||
    value === "postprocess" ||
    value === "hotword" ||
    value === "combined"
  );
}

function isLiveSttDecodingMethod(value: unknown): value is LiveSttDecodingMethod {
  return value === "greedy_search" || value === "modified_beam_search";
}

function readBrowserLocalStorage() {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function shouldUseLiveSttPostprocessBias(mode: LiveSttBiasMode) {
  return mode === "postprocess" || mode === "combined";
}

function shouldUseLiveSttHotwordBias(mode: LiveSttBiasMode) {
  return mode === "hotword" || mode === "combined";
}

function normalizeBiasTermText(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function extractBiasTermsFromText(value: string) {
  const terms = new Set<string>();
  const text = normalizeBiasTermText(value);
  if (!text) {
    return [];
  }

  for (const match of text.matchAll(/["'([{<]([^"'()[\]{}<>]{2,40})["'\])}>]/g)) {
    addExtractedBiasTerm(terms, match[1] ?? "");
  }

  for (const match of text.matchAll(/[A-Za-z][A-Za-z0-9.+#-]*(?:\s+[A-Za-z][A-Za-z0-9.+#-]*){0,3}/g)) {
    addExtractedBiasTerm(terms, match[0]);
  }

  for (const segment of text.split(/[\n\r,.;:!?，。！？、•·|/]+/)) {
    addExtractedBiasTerm(terms, segment);
  }

  return Array.from(terms);
}

function addExtractedBiasTerm(terms: Set<string>, value: string) {
  const term = normalizeBiasTermText(value);
  const normalized = normalizeLiveTranscriptText(term);
  if (
    normalized.length >= 3 &&
    normalized.length <= 24 &&
    /[A-Za-z0-9\u3131-\uD79D]/.test(term)
  ) {
    terms.add(term);
  }
}

function compareBiasTerms(left: LiveSttBiasTerm, right: LiveSttBiasTerm) {
  const weightDelta = right.weight - left.weight;
  if (weightDelta !== 0) {
    return weightDelta;
  }

  const sourceDelta =
    biasSourcePriority(right.source) - biasSourcePriority(left.source);
  if (sourceDelta !== 0) {
    return sourceDelta;
  }

  return right.text.length - left.text.length;
}

function biasSourcePriority(source: LiveSttBiasSource) {
  switch (source) {
    case "keyword":
      return 6;
    case "synonym":
      return 5;
    case "abbreviation":
      return 4;
    case "title":
      return 3;
    case "slide-text":
      return 2;
    case "speaker-notes":
      return 1;
    case "nearby-slide-text":
      return 0;
    case "control-phrase":
      return 7;
  }
}

function isKeywordBiasSource(source: LiveSttBiasSource) {
  return (
    source === "keyword" ||
    source === "synonym" ||
    source === "abbreviation"
  );
}

function hasFuzzyBiasMatch(transcript: string, normalizedTerm: string) {
  const normalizedTermText = normalizedTerm.normalize("NFC");
  const term = normalizeBiasDistanceText(normalizedTermText);
  const maxDistance = maxBiasTermDistance(normalizedTermText);
  if (maxDistance === 0) {
    return false;
  }

  for (const candidateText of extractFuzzyBiasCandidates(transcript)) {
    const candidate = normalizeBiasDistanceText(candidateText);
    if (
      !candidate ||
      isStrictPrefixBiasCandidate(candidate, term) ||
      Math.abs(candidate.length - term.length) > maxDistance ||
      levenshteinDistance(candidate, term) > maxDistance
    ) {
      continue;
    }

    return true;
  }

  return false;
}

function normalizeBiasDistanceText(value: string) {
  return value.normalize("NFD");
}

function extractFuzzyBiasCandidates(transcript: string) {
  return Array.from(
    new Set(
      transcript
        .split(/[^\p{L}\p{N}.+#-]+/u)
        .map(normalizeLiveTranscriptText)
        .map((value) => value.normalize("NFC"))
        .filter((value) => value.length > 0)
    )
  );
}

function isStrictPrefixBiasCandidate(candidate: string, term: string) {
  return candidate.length < term.length && term.startsWith(candidate);
}

function maxBiasTermDistance(term: string) {
  const length = Array.from(term.normalize("NFC")).length;
  if (/^[a-z0-9]+$/i.test(term) && length < 5) {
    return 0;
  }

  if (length <= 4) {
    return 2;
  }

  if (length <= 8) {
    return 1;
  }

  if (length <= 12) {
    return 2;
  }

  return 3;
}

function levenshteinDistance(left: string, right: string) {
  if (left === right) {
    return 0;
  }

  let previous = Array.from({ length: right.length + 1 }, (_, index) => index);
  let current = new Array<number>(right.length + 1);

  for (let leftIndex = 1; leftIndex <= left.length; leftIndex += 1) {
    current[0] = leftIndex;
    for (let rightIndex = 1; rightIndex <= right.length; rightIndex += 1) {
      const substitutionCost =
        left[leftIndex - 1] === right[rightIndex - 1] ? 0 : 1;
      current[rightIndex] = Math.min(
        previous[rightIndex]! + 1,
        current[rightIndex - 1]! + 1,
        previous[rightIndex - 1]! + substitutionCost
      );
    }
    [previous, current] = [current, previous];
  }

  return previous[right.length] ?? 0;
}

function createDefaultLiveSttAdapter() {
  return window.__orbitCreateLiveSttAdapter?.() ?? new WebSpeechLiveSttAdapter();
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
  const [phase, setPhase] = useState<RehearsalPhase>(props.initialDeck ? "idle" : "loading");
  const [, setError] = useState("");
  const [run, setRun] = useState<RehearsalRun | null>(null);
  const [, setJob] = useState<Job | null>(null);
  const [liveStatus, setLiveStatus] = useState<LiveSttStatus>("idle");
  const [liveError, setLiveError] = useState("");
  const [liveTranscriptBuffer, setLiveTranscriptBuffer] = useState(
    createLiveTranscriptBuffer
  );
  const [liveKeywordState, setLiveKeywordState] =
    useState<LiveTranscriptAnalysis | null>(null);
  const [liveAudioLevel, setLiveAudioLevel] =
    useState<LiveSttAudioLevelEvent | null>(null);
  const [liveDebugPcmRecording, setLiveDebugPcmRecording] =
    useState<LiveSttDebugPcmRecording | null>(null);
  const [liveCue, setLiveCue] = useState<LiveSttAnimationCueEvent | null>(null);
  const [liveSlideAdvance, setLiveSlideAdvance] =
    useState<LiveSttSlideAdvanceEvent | null>(null);
  const [autoAdvanceState, setAutoAdvanceState] = useState<
    "idle" | "pending" | "advanced" | "cancelled"
  >("idle");
  const [isLiveDemoActive, setIsLiveDemoActive] = useState(false);
  const [isLiveStopModalOpen, setIsLiveStopModalOpen] = useState(false);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [isTimerRunning, setIsTimerRunning] = useState(false);
  const [timeMode, setTimeMode] = useState<RehearsalTimeMode>("stopwatch");
  const [timerDurationSeconds, setTimerDurationSeconds] = useState(5 * 60);
  const [elapsedTimeInput, setElapsedTimeInput] = useState("00:00");
  const [timerDurationInput, setTimerDurationInput] = useState("05:00");
  const [editingTimeField, setEditingTimeField] = useState<
    "elapsed" | "duration" | null
  >(null);
  const sessionRef = useRef<RecordingSession | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const liveDemoStreamRef = useRef<MediaStream | null>(null);
  const liveSttAdapterRef = useRef<LiveSttAdapter | null>(
    props.liveSttAdapter ?? null
  );
  const finishAfterReportRef = useRef(false);
  const deckRef = useRef<Deck | null>(props.initialDeck ?? null);
  const currentSlideIndexRef = useRef(0);
  const liveTranscriptBufferRef = useRef<LiveTranscriptBuffer>(
    createLiveTranscriptBuffer()
  );
  const liveKeywordStateRef = useRef<LiveTranscriptAnalysis | null>(null);
  const liveBiasContextRef = useRef<LiveSttBiasContext | null>(null);
  const liveCommandConfirmationRef = useRef(
    createRehearsalCommandConfirmationState()
  );
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
      stopMediaStream(liveDemoStreamRef.current);
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
    if (!isTimerRunning) {
      return;
    }

    const timer = window.setInterval(() => {
      setElapsedSeconds((current) => current + 1);
    }, 1000);

    return () => window.clearInterval(timer);
  }, [isTimerRunning]);

  const displayedTimeSeconds =
    timeMode === "timer"
      ? Math.max(timerDurationSeconds - elapsedSeconds, 0)
      : elapsedSeconds;

  useEffect(() => {
    if (timeMode === "timer" && elapsedSeconds >= timerDurationSeconds) {
      setIsTimerRunning(false);
    }
  }, [elapsedSeconds, timeMode, timerDurationSeconds]);

  useEffect(() => {
    if (editingTimeField !== "elapsed") {
      setElapsedTimeInput(formatClock(displayedTimeSeconds));
    }
  }, [displayedTimeSeconds, editingTimeField]);

  useEffect(() => {
    if (editingTimeField !== "duration") {
      setTimerDurationInput(formatClock(timerDurationSeconds));
    }
  }, [editingTimeField, timerDurationSeconds]);

  useEffect(() => {
    return () => {
      cancelPendingAutoAdvance("cancelled");
      liveSttAdapterRef.current?.stop();
      liveSttAdapterRef.current?.dispose();
      stopMediaStream(streamRef.current);
      stopMediaStream(liveDemoStreamRef.current);
    };
  }, []);

  const currentSlide = deck?.slides[currentSlideIndex] ?? null;
  const canRecord = Boolean(deck) && !["recording", "uploading", "processing"].includes(phase);
  const isLiveSttActive = liveStatus === "starting" || liveStatus === "listening";
  const isReportBusy = ["recording", "uploading", "processing"].includes(phase);
  const canStartLiveDemo =
    Boolean(deck) && !isReportBusy && !isLiveSttActive && !isLiveDemoActive;
  const canStopLiveDemo = isLiveDemoActive && isLiveSttActive;
  const liveTranscriptPlaceholder =
    liveStatus === "idle"
      ? "Live STT 시작을 눌러 테스트하세요"
      : "마이크 입력을 기다리는 중";
  const liveTranscript = renderLiveTranscriptBuffer(liveTranscriptBuffer);
  const liveAudioLevelLabel = getLiveAudioLevelLabel(liveAudioLevel);
  const liveAudioLevelPercent = getLiveAudioLevelPercent(liveAudioLevel);
  const liveAudioMeterState = liveAudioLevel
    ? liveAudioLevelLabel === "입력 과대"
      ? "clipped"
      : liveAudioLevel.isLikelySilence
        ? "quiet"
        : "active"
    : "idle";
  const canDownloadLiveSttDebugPcm = shouldShowLiveSttDebugPcmDownload(
    liveDebugPcmRecording
  );

  useEffect(() => {
    resetLiveTranscriptForSlide(currentSlide);
    const nextBiasContext = deck && currentSlide
      ? buildLiveSttBiasContext(currentSlide, {
          nearbySlides: getNearbySlides(deck, currentSlideIndex)
        })
      : null;
    liveBiasContextRef.current = nextBiasContext;
    const biasMode = getLiveSttBiasMode();
    liveSttAdapterRef.current?.updateBiasContext?.(
      shouldUseLiveSttHotwordBias(biasMode) ? nextBiasContext : null
    );
  }, [currentSlide?.slideId, currentSlideIndex, deck]);

  async function startRecording() {
    if (!deck || !canRecord) return;
    const activeDeck = deck;
    stopLiveDemo();

    setError("");
    setRun(null);
    setJob(null);
    finishAfterReportRef.current = false;
    setLiveError("");
    setLiveAudioLevel(null);
    setLiveDebugPcmRecording(null);
    resetLiveTranscriptForSlide(currentSlide);
    setLiveSlideAdvance(null);
    setAutoAdvanceState("idle");
    autoAdvancedSlideIdsRef.current.clear();

    if (!navigator.mediaDevices?.getUserMedia) {
      setError("??釉뚮씪?곗???留덉씠???뱀쓬??吏?먰븯吏 ?딆뒿?덈떎.");
      setPhase("failed");
      return;
    }

    let stream: MediaStream | null = null;
    try {
      stream = await requestRehearsalMicrophoneStream(navigator.mediaDevices);
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
      setIsTimerRunning(true);
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

  async function startLiveDemo() {
    if (!deck || !canStartLiveDemo) return;

    setLiveError("");
    setLiveAudioLevel(null);
    setLiveDebugPcmRecording(null);
    resetLiveTranscriptForSlide(currentSlide);
    setLiveSlideAdvance(null);
    setAutoAdvanceState("idle");
    autoAdvancedSlideIdsRef.current.clear();

    if (!navigator.mediaDevices?.getUserMedia) {
      setLiveError("이 브라우저는 마이크 녹음을 지원하지 않습니다.");
      setLiveStatus("failed");
      return;
    }

    let stream: MediaStream | null = null;
    setIsLiveDemoActive(true);
    try {
      stream = await requestRehearsalMicrophoneStream(navigator.mediaDevices);
      liveDemoStreamRef.current = stream;
      const started = await startLiveStt(stream);
      if (!started) {
        stopMediaStream(stream);
        if (liveDemoStreamRef.current === stream) {
          liveDemoStreamRef.current = null;
        }
        setIsLiveDemoActive(false);
        setIsTimerRunning(false);
      } else {
        setElapsedSeconds(0);
        setIsTimerRunning(true);
      }
    } catch (cause) {
      stopMediaStream(stream);
      if (liveDemoStreamRef.current === stream) {
        liveDemoStreamRef.current = null;
      }
      setIsLiveDemoActive(false);
      setIsTimerRunning(false);
      setLiveError(toMicrophoneErrorMessage(cause));
      setLiveStatus("failed");
    }
  }

  function stopLiveDemo(options: { showCompletionModal?: boolean } = {}) {
    const wasLiveDemoActive = isLiveDemoActive || isLiveSttActive;
    liveSttAdapterRef.current?.stop();
    stopMediaStream(liveDemoStreamRef.current);
    liveDemoStreamRef.current = null;
    setLiveAudioLevel(null);
    setIsLiveDemoActive(false);
    setIsTimerRunning(false);
    setLiveStatus((current) =>
      current === "listening" || current === "starting" ? "stopped" : current
    );
    cancelPendingAutoAdvance("cancelled");
    if (options.showCompletionModal && wasLiveDemoActive) {
      setIsLiveStopModalOpen(true);
    }
  }

  function stopRecording() {
    if (phase !== "recording") return;

    setPhase("uploading");
    setIsTimerRunning(false);
    cancelPendingAutoAdvance("cancelled");
    liveSttAdapterRef.current?.stop();
    setLiveAudioLevel(null);
    setLiveStatus((current) =>
      current === "listening" || current === "starting" ? "stopped" : current
    );
    sessionRef.current?.stop();
    stopMediaStream(streamRef.current);
    streamRef.current = null;
    sessionRef.current = null;
  }

  function handleTimePrimaryAction() {
    if (isTimerRunning) {
      setIsTimerRunning(false);
      if (phase === "recording") {
        stopRecording();
      }
      return;
    }

    if (timeMode === "timer" && elapsedSeconds >= timerDurationSeconds) {
      setElapsedSeconds(0);
    }

    setIsTimerRunning(true);
  }

  function commitElapsedTimeInput(value: string) {
    const nextSeconds = parseClockInput(value);
    setEditingTimeField(null);

    if (nextSeconds === null) {
      setElapsedTimeInput(formatClock(displayedTimeSeconds));
      return;
    }

    const boundedSeconds = Math.min(nextSeconds, 60 * 60 * 24 - 1);
    setElapsedSeconds(
      timeMode === "timer"
        ? Math.max(timerDurationSeconds - boundedSeconds, 0)
        : boundedSeconds
    );
  }

  function commitTimerDurationInput(value: string) {
    const nextSeconds = parseClockInput(value);
    setEditingTimeField(null);

    if (nextSeconds === null || nextSeconds <= 0) {
      setTimerDurationInput(formatClock(timerDurationSeconds));
      return;
    }

    setTimerDurationSeconds(Math.min(nextSeconds, 60 * 60 * 24 - 1));
  }

  async function startLiveStt(stream: MediaStream) {
    const adapter =
      props.liveSttAdapter ?? liveSttAdapterRef.current ?? createDefaultLiveSttAdapter();
    liveSttAdapterRef.current = adapter;
    const biasMode = getLiveSttBiasMode();
    const biasContext = deck && currentSlide
      ? getCurrentLiveBiasContext(deck, currentSlideIndex)
      : null;
    setLiveStatus("starting");
    setLiveAudioLevel(null);

    try {
      await adapter.start(
        stream,
        {
          onPartialTranscript: handleLivePartialTranscript,
          onError: handleLiveSttError,
          onAudioLevel: setLiveAudioLevel,
          onDebugPcmAvailable: setLiveDebugPcmRecording
        },
        {
          biasContext: shouldUseLiveSttHotwordBias(biasMode) ? biasContext : null,
          decodingMethod: getLiveSttDebugDecodingMethod()
        }
      );
      setLiveStatus("listening");
      return true;
    } catch (cause) {
      const error = toLiveSttAdapterError(cause);
      setLiveStatus(error.code === "LIVE_STT_MODEL_UNAVAILABLE" ? "unavailable" : "failed");
      setLiveError(error.message);
      setLiveAudioLevel(null);
      cancelPendingAutoAdvance("cancelled");
      return false;
    }
  }

  function handleLiveSttError(error: LiveSttAdapterError) {
    setLiveStatus(error.code === "LIVE_STT_MODEL_UNAVAILABLE" ? "unavailable" : "failed");
    setLiveError(error.message);
    setLiveAudioLevel(null);
    setIsTimerRunning(false);
    cancelPendingAutoAdvance("cancelled");
  }

  function handleLivePartialTranscript(event: LiveSttPartialTranscriptEvent) {
    const deckSnapshot = deckRef.current;
    const slideIndex = currentSlideIndexRef.current;
    const slide = deckSnapshot?.slides[slideIndex];
    if (!deckSnapshot || !slide) {
      return;
    }

    const nextBuffer = applyLiveTranscriptEvent(
      liveTranscriptBufferRef.current,
      event
    );
    liveTranscriptBufferRef.current = nextBuffer;
    setLiveTranscriptBuffer(nextBuffer);

    const transcript = renderLiveTranscriptBuffer(nextBuffer);
    const biasMode = getLiveSttBiasMode();
    const biasContext = getCurrentLiveBiasContext(deckSnapshot, slideIndex);
    const matchingTranscript = shouldUseLiveSttPostprocessBias(biasMode)
      ? applyLiveTranscriptBias(transcript, biasContext)
      : transcript;
    const analysis = evaluateLiveTranscript(slide, matchingTranscript);
    const confirmedCommand = confirmRehearsalCommandCandidate(
      liveCommandConfirmationRef.current,
      detectRehearsalCommandCandidate(event)
    );

    const previousDetectedIds = new Set(
      liveKeywordStateRef.current?.slideId === slide.slideId
        ? liveKeywordStateRef.current.detectedKeywords.map((keyword) => keyword.keywordId)
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

    if (isEmphasisCommand(confirmedCommand)) {
      setLiveCue({
        type: "animation-cue",
        slideId: slide.slideId,
        keywordId: "command-emphasis",
        cue: "emphasis",
        text: confirmedCommand.phrase
      });
    }

    setLiveKeywordState(analysis);
    liveKeywordStateRef.current = analysis;
    setLiveStatus("listening");

    const autoAdvanceOptions = {
      analysis,
      currentSlideIndex: slideIndex,
      slideCount: deckSnapshot.slides.length,
      keywordCount: slide.keywords.length,
      alreadyAdvanced: autoAdvancedSlideIdsRef.current.has(slide.slideId)
    };
    if (
      shouldCompleteLiveSlideAdvance({
        confirmedCommand,
        ...autoAdvanceOptions
      })
    ) {
      cancelPendingAutoAdvance("cancelled");
      completeLiveSlideAdvance(deckSnapshot, slideIndex, analysis.coverage);
    } else if (shouldAutoAdvanceLiveSlide(autoAdvanceOptions)) {
      scheduleAutoAdvance(deckSnapshot, slideIndex, analysis.coverage);
    }
  }

  function resetLiveTranscriptForSlide(slide: Slide | null) {
    const nextBuffer = createLiveTranscriptBuffer();
    const nextKeywordState = slide ? evaluateLiveTranscript(slide, "") : null;

    liveTranscriptBufferRef.current = nextBuffer;
    liveKeywordStateRef.current = nextKeywordState;
    liveCommandConfirmationRef.current = createRehearsalCommandConfirmationState();
    setLiveTranscriptBuffer(nextBuffer);
    setLiveKeywordState(nextKeywordState);
    setLiveCue(null);
  }

  function getCurrentLiveBiasContext(deckSnapshot: Deck, slideIndex: number) {
    const slide = deckSnapshot.slides[slideIndex];
    if (!slide) {
      return null;
    }

    const current = liveBiasContextRef.current;
    if (current?.slideId === slide.slideId) {
      return current;
    }

    const nextBiasContext = buildLiveSttBiasContext(slide, {
      nearbySlides: getNearbySlides(deckSnapshot, slideIndex)
    });
    liveBiasContextRef.current = nextBiasContext;
    return nextBiasContext;
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

      completeLiveSlideAdvance(deckSnapshot, fromSlideIndex, coverage);
    }, props.autoAdvanceDelayMs ?? defaultLiveAutoAdvanceDelayMs);
  }

  function completeLiveSlideAdvance(
    deckSnapshot: Deck,
    fromSlideIndex: number,
    coverage: number
  ) {
    const fromSlide = deckSnapshot.slides[fromSlideIndex];
    const toSlide = deckSnapshot.slides[fromSlideIndex + 1];
    if (!fromSlide || !toSlide) {
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
  }

  function cancelPendingAutoAdvance(nextState: "idle" | "cancelled" = "cancelled") {
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
        setError(
          result.job.error?.message || result.job.message || "由ы뿀??遺꾩꽍???ㅽ뙣?덉뒿?덈떎."
        );
        return;
      }

      await loadReportForRun(result.run.runId, result.run);
      setPhase("succeeded");
      if (finishAfterReportRef.current) {
        finishAfterReportRef.current = false;
        navigateToPath(getRehearsalReportPath(activeDeck.projectId, result.run.runId));
      }
    } catch (cause) {
      setError(toRehearsalFlowMessage(cause));
      setPhase("failed");
    }
  }

  async function loadReportForRun(runId: string, fallbackRun: RehearsalRun) {
    try {
      const response = await fetchRehearsalReport(runId);
      setRun(response.run);
    } catch {
      setRun(fallbackRun);
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
  const finishRehearsal = () => {
    const projectId = deck?.projectId ?? props.projectId ?? demoIds.projectId;

    if (phase === "recording") {
      finishAfterReportRef.current = true;
      stopRecording();
      return;
    }

    if (phase === "uploading" || phase === "processing") {
      finishAfterReportRef.current = true;
      return;
    }

    navigateToPath(getRehearsalFinishPath(projectId, run));
  };

  const liveDetectedKeywordIds = new Set(
    liveKeywordState?.detectedKeywords.map((keyword) => keyword.keywordId) ?? []
  );
  const liveCoveragePercent = Math.round((liveKeywordState?.coverage ?? 0) * 100);
  const liveMissingKeywordIds = new Set(liveKeywordState?.missingKeywordIds ?? []);
  const checklistKeywords = getChecklistKeywords(currentSlide);
  const scriptParagraphs = buildScriptParagraphs(currentSlide);
  const hasDeletedRawAudio = Boolean(run?.rawAudioDeletedAt);

  return (
    <main className="rehearsal-presenter-shell">
      <div className="rehearsal-legacy-test-marker" aria-hidden="true">
        Live STT / Report AI / Speaker notes
      </div>
      {isLiveStopModalOpen ? (
        <div className="rehearsal-live-stop-modal-backdrop" role="presentation">
          <section
            aria-labelledby="rehearsal-live-stop-modal-title"
            aria-modal="true"
            className="rehearsal-live-stop-modal"
            role="dialog"
          >
            <span className="rehearsal-live-stop-modal-icon" aria-hidden="true">
              <CheckCircle2 size={28} />
            </span>
            <h2 id="rehearsal-live-stop-modal-title">Live STT가 종료되었습니다</h2>
            <p>
              {run?.runId
                ? `현재 리허설 runId는 ${run.runId}입니다.`
                : "Live STT 단독 실행은 runId를 만들지 않습니다. 리포트 녹음 흐름에서 runId가 생성됩니다."}
            </p>
            <button
              className="primary-action"
              type="button"
              onClick={() => setIsLiveStopModalOpen(false)}
            >
              확인
            </button>
          </section>
        </div>
      ) : null}
      <header className="rehearsal-presenter-topbar">
        <button
          className="rehearsal-exit-button"
          type="button"
          onClick={finishRehearsal}
        >
          <PresentationScreenIcon />
          {"\ub9ac\ud5c8\uc124 \ub9c8\uce58\uae30"}
        </button>
        <h1 className="rehearsal-smoke-heading">리허설</h1>

        <div className="rehearsal-timer-pill" aria-live="polite">
          <span className="timer-wave" aria-hidden="true">
            <i />
            <i />
            <i />
            <i />
          </span>
          <label className="rehearsal-time-mode">
            <select
              aria-label="Time display mode"
              value={timeMode}
              onChange={(event) => {
                setTimeMode(event.target.value as RehearsalTimeMode);
                setElapsedSeconds(0);
                setIsTimerRunning(false);
              }}
            >
              <option value="stopwatch">{"\uc2a4\ud1b1\uc6cc\uce58"}</option>
              <option value="timer">{"\ud0c0\uc774\uba38"}</option>
            </select>
            <span className="rehearsal-select-caret" aria-hidden="true" />
          </label>
          <div className="rehearsal-time-fields">
            <input
              aria-label="Elapsed time"
              inputMode="numeric"
              value={elapsedTimeInput}
              onBlur={(event) => commitElapsedTimeInput(event.target.value)}
              onChange={(event) => {
                setEditingTimeField("elapsed");
                setElapsedTimeInput(event.target.value);
              }}
              onFocus={() => setEditingTimeField("elapsed")}
            />
            <span aria-hidden="true">/</span>
            <input
              aria-label="Target time"
              inputMode="numeric"
              value={timerDurationInput}
              onBlur={(event) => commitTimerDurationInput(event.target.value)}
              onChange={(event) => {
                setEditingTimeField("duration");
                setTimerDurationInput(event.target.value);
              }}
              onFocus={() => setEditingTimeField("duration")}
            />
          </div>
          <button
            type="button"
            aria-label={isTimerRunning ? "Pause time" : "Start time"}
            onClick={handleTimePrimaryAction}
          >
            {isTimerRunning ? <Square size={16} /> : <PlayCircle size={16} />}
          </button>
          <button
            type="button"
            aria-label="Reset timer"
            onClick={() => {
              setElapsedSeconds(0);
              setIsTimerRunning(false);
            }}
          >
            <RotateCcw size={15} />
          </button>
        </div>
      </header>
      <div className="rehearsal-smoke-controls" aria-label="리허설 smoke controls">
        <button type="button" onClick={() => void startRecording()} disabled={!canRecord}>
          리포트 녹음 시작
        </button>
        <button type="button" onClick={stopRecording} disabled={phase !== "recording"}>
          리포트 녹음 종료
        </button>
        <span>{phase}</span>
        <span>{liveStatus}</span>
        {hasDeletedRawAudio ? <span>raw audio 삭제 완료</span> : null}
      </div>

      <section className="rehearsal-presenter-layout">
        <section className="rehearsal-presenter-main">
          <div className="rehearsal-stage-wrap">
            {currentSlide ? (
              <DeckSlidePreview deck={deck} slide={currentSlide} />
            ) : (
              <div className="rehearsal-empty-stage">
                {"\ubc1c\ud45c\uc790\ub8cc \ub85c\ub529 \uc911"}
              </div>
            )}
          </div>

          <div className="rehearsal-slide-controls">
            <button
              type="button"
              onClick={goPrevious}
              disabled={currentSlideIndex === 0}
              aria-label="Previous slide"
              title="Previous slide"
            >
              <ChevronLeft size={24} />
            </button>
            <span>
              {currentSlideIndex + 1} / {deck?.slides.length ?? 0}
            </span>
            <button
              type="button"
              onClick={goNext}
              disabled={!deck || currentSlideIndex >= deck.slides.length - 1}
              aria-label="Next slide"
              title="Next slide"
            >
              <ChevronRight size={24} />
            </button>
          </div>

          <div className="rehearsal-context-strip" aria-label="Nearby slides">
            {[-2, -1, 0, 1, 2].map((offset) => {
              const slideIndex = currentSlideIndex + offset;
              const slide = deck?.slides[slideIndex];
              const gridColumn = offset + 3;
              if (!slide) {
                return (
                  <span
                    aria-hidden="true"
                    className="rehearsal-context-thumb-placeholder"
                    key={`empty-${offset}`}
                    style={{ gridColumn }}
                  />
                );
              }

              const thumbnailUrl = resolveEditorAssetUrl(slide.thumbnailUrl);
              return (
                <button
                  className={`rehearsal-context-thumb ${offset === 0 ? "active" : ""}`}
                  key={`${slide.slideId}-${offset}`}
                  style={{ gridColumn }}
                  type="button"
                  onClick={() => setCurrentSlideIndex(slideIndex)}
                >
                  <span className="rehearsal-context-thumb-preview">
                    {thumbnailUrl ? (
                      <img
                        alt={`${getSlideTitle(slide)} thumbnail`}
                        src={thumbnailUrl}
                      />
                    ) : (
                      <span className="rehearsal-context-thumb-empty">
                        {getSlideTitle(slide)}
                      </span>
                    )}
                  </span>
                  <span className="rehearsal-context-thumb-meta">
                    <strong>Slide {slideIndex + 1}</strong>
                  </span>
                </button>
              );
            })}
          </div>
        </section>

        <aside className="rehearsal-presenter-side">
          <section className="rehearsal-assist-card checklist-card">
            <header>
              <span>
                <Sparkles size={16} />
                {"\ud0a4\uc6cc\ub4dc \uccb4\ud06c\ub9ac\uc2a4\ud2b8"}
              </span>
              <button type="button" aria-label="More checklist options">
                <MoreHorizontal size={18} />
              </button>
            </header>
            <div className="keyword-check-list">
              {checklistKeywords.length > 0 ? (
                checklistKeywords.map((keyword) => {
                  const isDetected = liveDetectedKeywordIds.has(keyword.keywordId);
                  return (
                    <div className="keyword-check-item" key={keyword.keywordId}>
                      {isDetected ? (
                        <CheckCircle2 size={20} />
                      ) : (
                        <span className="empty-check" />
                      )}
                      <strong>{keyword.text}</strong>
                    </div>
                  );
                })
              ) : (
                <div className="keyword-empty-state">강조 키워드가 없습니다</div>
              )}
            </div>

            <div className={`rehearsal-live-status rehearsal-live-status-${liveStatus}`}>
              <strong>{liveStatus}</strong>
              <span>{autoAdvanceState === "pending" ? "자동 전환 대기" : "자동 전환 활성"}</span>
            </div>

            <div className="rehearsal-live-actions">
              <button
                className="primary-action"
                type="button"
                onClick={() => void startLiveDemo()}
                disabled={!canStartLiveDemo}
              >
                <Mic size={18} />
                Live STT 시작
              </button>
              <button
                className="secondary-action"
                type="button"
                onClick={() => stopLiveDemo({ showCompletionModal: true })}
                disabled={!canStopLiveDemo}
              >
                <Square size={18} />
                Live STT 종료
              </button>
            </div>

            <div
              className={`rehearsal-live-audio-meter rehearsal-live-audio-meter-${liveAudioMeterState}`}
            >
              <div className="rehearsal-live-audio-meter-header">
                <span>Mic input</span>
                <strong>{liveAudioLevelLabel}</strong>
              </div>
              <div
                className="rehearsal-live-audio-meter-track"
                role="meter"
                aria-label="Mic input level"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={Math.round(liveAudioLevelPercent)}
                aria-valuetext={liveAudioLevelLabel}
              >
                <span style={{ width: `${liveAudioLevelPercent}%` }} />
              </div>
              <small>
                {liveAudioLevel
                  ? `${Math.round(liveAudioLevel.rmsDb)} dB RMS`
                  : "-100 dB RMS"}
              </small>
            </div>

            <div className="rehearsal-live-transcript">
              <span>Partial transcript</span>
              <p>{liveTranscript || liveTranscriptPlaceholder}</p>
            </div>
            {canDownloadLiveSttDebugPcm ? (
              <button
                className="secondary-action"
                type="button"
                onClick={() => {
                  if (liveDebugPcmRecording) {
                    downloadLiveSttDebugPcm(liveDebugPcmRecording);
                  }
                }}
              >
                <Download size={16} />
                모델 입력 WAV 다운로드
              </button>
            ) : null}

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

          <section className="rehearsal-assist-card script-card">
            <header>
              <span>
                <Sparkles size={16} />
                {"\ub300\ubcf8"}
              </span>
              <button type="button" aria-label="Collapse script">
                <ChevronRight size={18} />
              </button>
            </header>
            <div className="script-body">
              {scriptParagraphs.map((paragraph, index) => (
                <p key={`${paragraph}-${index}`}>
                  {renderHighlightedScriptText(paragraph, checklistKeywords)}
                </p>
              ))}
            </div>
          </section>
        </aside>
      </section>
    </main>
  );
}

export function RehearsalReportPage(props: {
  initialDeck?: Deck;
  initialReport?: RehearsalReport | null;
  initialRun?: RehearsalRun | null;
  projectId: string;
  runId: string;
}) {
  const [deck, setDeck] = useState<Deck | null>(props.initialDeck ?? null);
  const [run, setRun] = useState<RehearsalRun | null>(props.initialRun ?? null);
  const [report, setReport] = useState<RehearsalReport | null>(props.initialReport ?? null);
  const [status, setStatus] = useState<RehearsalReportStatus>(
    props.initialReport ? "ready" : "loading"
  );
  const [error, setError] = useState("");

  useEffect(() => {
    let isMounted = true;

    if (!props.initialDeck) {
      void fetchRehearsalDeck(props.projectId)
        .then((nextDeck) => {
          if (isMounted) setDeck(nextDeck);
        })
        .catch(() => {
          if (isMounted) setDeck(null);
        });
    }

    if (props.initialReport !== undefined) {
      return () => {
        isMounted = false;
      };
    }

    setStatus("loading");
    setError("");

    void fetchRehearsalReport(props.runId)
      .then((response) => {
        if (!isMounted) return;

        const nextState = resolveRehearsalReportLoadState(response, props.projectId);
        setRun(response.run);
        setReport(nextState.status === "ready" ? response.report : null);
        setStatus(nextState.status);
        setError(nextState.error);
      })
      .catch((cause) => {
        if (!isMounted) return;

        setReport(null);
        setStatus("failed");
        setError(toRehearsalFlowMessage(cause));
      });

    return () => {
      isMounted = false;
    };
  }, [props.initialDeck, props.initialReport, props.projectId, props.runId]);

  const reportDate = formatReportDate(report?.generatedAt ?? run?.updatedAt ?? run?.createdAt);
  const slideCount = deck?.slides.length;
  const reportScore = report ? calculateReportScore(report) : 0;
  const deliveryScore = report ? calculateDeliveryScore(report) : 0;
  const speedScore = report ? calculateSpeedScore(report) : 0;
  const keywordScore = report ? Math.round(report.metrics.keywordCoverage * 100) : 0;
  const speedSamples = report ? buildSpeedSamples(report.metrics.wordsPerMinute) : [];
  const coachingHeadline = buildCoachingHeadline(report);
  const coachingDetail = buildCoachingDetail(report, deck);
  const missedKeywords = buildMissedKeywordLabels(deck, report);
  const durationDelta = report
    ? formatSignedDuration(report.metrics.durationSeconds - getTargetDurationSeconds(deck))
    : "0:00";
  const completionPercent = slideCount ? "100%" : "-";

  return (
    <main className="rehearsal-report-page">
      <header className="rehearsal-report-topbar">
        <div className="rehearsal-report-topbar-left">
          <span className="report-brand-mark" aria-hidden="true">
            <i />
            <i />
          </span>
          <strong>Orbit AI</strong>
          <button
            type="button"
            onClick={() => navigateToRehearsal(props.projectId)}
            aria-label="홈으로 이동"
          >
            <Home size={18} />
          </button>
          <span className="report-project-title">{deck?.title ?? "제목"}</span>
          <ChevronDown size={16} />
          <span className="report-save-state">
            <Save size={15} />
            저장됨
          </span>
        </div>
        <div className="rehearsal-report-topbar-actions">
          <span>알렉스</span>
          <span className="report-avatar" aria-hidden="true">김</span>
          <span className="report-mode-switch" aria-label="보기 모드">
            <button type="button">편집</button>
            <button className="active" type="button">보기</button>
          </span>
          <button type="button">
            <Monitor size={18} />
            리허설
          </button>
          <button type="button">
            <BarChart3 size={18} />
            AI 리포트
          </button>
          <button className="report-present-button" type="button">
            <PlayCircle size={18} />
            프레젠테이션
            <ChevronDown size={16} />
          </button>
        </div>
      </header>

      <div className="rehearsal-report-body">
        <aside className="rehearsal-report-nav" aria-label="리허설 리포트 목록">
          <section className="report-nav-section-active">
            <h2>
              <ChevronDown size={24} />
              리허설 리포트
            </h2>
            <button className="rehearsal-report-nav-item active" type="button">
              <strong>
                <CalendarDays size={15} />
                1회차
              </strong>
              <span>{reportDate}</span>
            </button>
          </section>

          <section>
            <h2>
              <ChevronRight size={24} />
              실전 리포트
            </h2>
          </section>
        </aside>

        <section className="rehearsal-report-document" aria-live="polite">
          <header className="rehearsal-report-document-header">
            <h1>1회차 리허설 리포트</h1>
            <time>{reportDate}</time>
          </header>

          {report ? (
            <div className="rehearsal-report-document-grid">
              <section className="report-overview-card">
                <div className="report-score-block">
                  <span>종합 발표 점수</span>
                  <strong>{reportScore}</strong>
                  <small>/ 100</small>
                </div>
                <div className="report-overview-copy">
                  <h2>{coachingHeadline}</h2>
                  <p>{coachingDetail}</p>
                </div>
                <div className="report-score-list">
                  <div>
                    <span>전달력</span>
                    <strong>{deliveryScore}</strong>
                  </div>
                  <div>
                    <span>속도 안정성</span>
                    <strong>{speedScore}</strong>
                  </div>
                  <div>
                    <span>키워드 회수</span>
                    <strong>{keywordScore}</strong>
                  </div>
                </div>
              </section>

              <section className="report-summary-card report-dashboard-card">
                <div className="report-summary-row">
                  <span>총 소요 시간</span>
                  <strong>{formatDuration(report.metrics.durationSeconds)}</strong>
                </div>
                <div className="report-summary-row">
                  <span>사용한 슬라이드 수</span>
                  <strong>{typeof slideCount === "number" ? slideCount : "-"}</strong>
                </div>
                <div className="report-mini-metrics">
                  <div>
                    <span>목표 시간</span>
                    <strong>{formatDuration(getTargetDurationSeconds(deck))}</strong>
                  </div>
                  <div>
                    <span>전회 대비</span>
                    <strong>{durationDelta}</strong>
                  </div>
                  <div>
                    <span>완료율</span>
                    <strong>{completionPercent}</strong>
                  </div>
                </div>
              </section>

              <section className="report-speed-card report-dashboard-card">
                <h2>
                  <Gauge size={18} />
                  평균 발표 속도
                </h2>
                <div
                  className="report-speed-gauge"
                  role="meter"
                  aria-label="평균 발표 속도"
                  aria-valuemin={80}
                  aria-valuemax={180}
                  aria-valuenow={Math.round(report.metrics.wordsPerMinute)}
                >
                  <span className="speed-mark speed-mark-left">100</span>
                  <span className="speed-mark speed-mark-right">150</span>
                  <strong>{Math.round(report.metrics.wordsPerMinute)}</strong>
                </div>
                <p>권장 범위 안에서 안정적인 속도로 발표했어요.</p>
              </section>

              <section className="report-voice-card report-dashboard-card">
                <h2>
                  <Volume2 size={20} />
                  음성 분석
                </h2>
                <div className="report-official-metrics">
                  <div>
                    <span>불필요한 표현</span>
                    <strong>{report.metrics.fillerWordCount}회</strong>
                  </div>
                  <div>
                    <span>긴 멈춤</span>
                    <strong>{report.metrics.pauseCount}회</strong>
                  </div>
                </div>
                <p>서버 리포트가 제공한 말버릇과 멈춤 지표만 표시합니다.</p>
              </section>

              <section className="report-keyword-card report-dashboard-card">
                <h2>
                  <Target size={20} />
                  누락 키워드
                </h2>
                <p>실전 발표 중 다시 알려줄 핵심 데이터입니다.</p>
                {missedKeywords.length > 0 ? (
                  <>
                    <div className="report-keyword-chips">
                      {missedKeywords.map((keyword) => (
                        <span key={keyword}>{keyword}</span>
                      ))}
                    </div>
                    <strong className="report-keyword-warning">
                      핵심 키워드 커버리지가 낮을 때만 누락 후보를 표시합니다.
                    </strong>
                  </>
                ) : (
                  <strong className="report-keyword-empty">
                    이번 리허설에서 누락된 키워드가 없습니다.
                  </strong>
                )}
              </section>

              <section className="report-speed-change-card report-dashboard-card">
                <h2>
                  <TrendingUp size={20} />
                  말 속도 변화
                </h2>
                <p>긴장하거나 설명이 꼬인 구간을 찾습니다.</p>
                <div className="report-speed-chart" aria-label="말 속도 변화">
                  <div className="report-speed-band" />
                  {speedSamples.map((value, index) => (
                    <i
                      key={`${value}-${index}`}
                      style={{
                        left: `${(index / Math.max(1, speedSamples.length - 1)) * 100}%`,
                        bottom: `${clamp((value - 70) / 140 * 100, 4, 92)}%`
                      }}
                    />
                  ))}
                  <span>words/min</span>
                  <b>200</b>
                  <b>150</b>
                  <b>100</b>
                </div>
              </section>

              <section className="report-coaching-card report-dashboard-card">
                <h2>
                  <Presentation size={20} />
                  다음 연습
                </h2>
                <div className="report-coaching-columns">
                  <div>
                    <strong>강점</strong>
                    <ul>
                      {(report.coaching?.strengths.length
                        ? report.coaching.strengths
                        : ["말이 분명하고 빠르지 않음", "불필요한 말버릇 없음"]
                      ).slice(0, 3).map((strength) => (
                        <li key={strength}>{strength}</li>
                      ))}
                    </ul>
                  </div>
                  <div>
                    <strong>개선 포인트</strong>
                    <ul>
                      {(report.coaching?.improvements.length
                        ? report.coaching.improvements
                        : ["자료 설명을 짧게 줄이기", "누락 키워드를 노트에 고정하기"]
                      ).slice(0, 3).map((improvement) => (
                        <li key={improvement}>{improvement}</li>
                      ))}
                    </ul>
                  </div>
                </div>
                <p>{report.coaching?.nextPracticeFocus || "핵심 메시지를 먼저 말하는 흐름을 연습하세요."}</p>
              </section>
            </div>
          ) : (
            <div
              className={
                status === "failed" ? "report-page-state status-error" : "report-page-state"
              }
            >
              <BarChart3 size={28} />
              <strong>{formatEmptyReportMessage(status, error)}</strong>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}

function DeckSlidePreview(props: { deck: Deck | null; slide: Slide }) {
  const { deck, slide } = props;
  const backgroundColor = slide.style.backgroundColor ?? deck?.theme.backgroundColor ?? "#ffffff";
  const textColor = slide.style.textColor ?? deck?.theme.textColor ?? "#15202b";
  const titleText = getSlideTitle(slide);
  const bodyTexts = getSlideBodyTexts(slide);
  const keywords = getChecklistKeywords(slide);
  const thumbnailUrl = resolveEditorAssetUrl(slide.thumbnailUrl);

  if (thumbnailUrl) {
    return (
      <div
        className="rehearsal-slide-preview image-preview"
        style={{ backgroundColor, color: textColor }}
      >
        <img
          alt={`${titleText} slide preview`}
          className="rehearsal-slide-image"
          src={thumbnailUrl}
        />
      </div>
    );
  }

  return (
    <div className="rehearsal-slide-preview" style={{ backgroundColor, color: textColor }}>
      <h2 className="rehearsal-slide-title">{titleText}</h2>
      <div className="rehearsal-slide-diagram" aria-label="?щ씪?대뱶 ?듭떖 ?먮쫫">
        {keywords.slice(0, 5).map((keyword, index) => (
          <div className="diagram-step" key={keyword.keywordId}>
            <span className="diagram-icon">
              {index === 0 ? (
                <Mic size={28} />
              ) : index === 1 ? (
                <span />
              ) : index === 2 ? (
                <Sparkles size={26} />
              ) : index === 3 ? (
                <PresentationScreenIcon />
              ) : (
                <CheckCircle2 size={28} />
              )}
            </span>
            <strong>{keyword.text}</strong>
          </div>
        ))}
      </div>
      <p className="rehearsal-slide-caption">{bodyTexts[0] ?? `[ ${titleText} ]`}</p>
    </div>
  );
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

function getSlideBodyTexts(slide: Slide) {
  return slide.elements
    .filter(
      (element): element is Extract<DeckElement, { type: "text" }> =>
        element.type === "text" && Boolean(element.props.text.trim())
    )
    .map((element) => element.props.text.trim())
    .filter((text) => text !== slide.title.trim());
}

function getChecklistKeywords(slide: Slide | null): Keyword[] {
  return slide?.keywords ?? [];
}

function getNearbySlides(deck: Deck, currentSlideIndex: number) {
  return deck.slides.filter(
    (_slide, index) =>
      index !== currentSlideIndex && Math.abs(index - currentSlideIndex) <= 2
  );
}

function isEmphasisCommand(
  candidate: RehearsalCommandCandidate | null
): candidate is RehearsalCommandCandidate & { cue: "emphasis" } {
  return candidate?.action === "animation-cue" && candidate.cue === "emphasis";
}

function isAdvanceSlideCommand(
  candidate: RehearsalCommandCandidate | null
): candidate is RehearsalCommandCandidate & { action: "advance-slide" } {
  return candidate?.action === "advance-slide";
}

function buildScriptParagraphs(slide: Slide | null) {
  if (!slide) {
    return ["\ub300\ubcf8\uc774 \uc5c6\uc2b5\ub2c8\ub2e4."];
  }

  const notes = slide.speakerNotes
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean);

  if (notes.length > 0) {
    return notes.slice(0, 4);
  }

  return ["\ub300\ubcf8\uc774 \uc5c6\uc2b5\ub2c8\ub2e4."];
}

function renderHighlightedScriptText(paragraph: string, keywords: Keyword[]) {
  const keywordTexts = Array.from(
    new Set(
      keywords
        .map((keyword) => keyword.text.trim())
        .filter(Boolean)
        .sort((left, right) => right.length - left.length)
    )
  );

  if (keywordTexts.length === 0) {
    return paragraph;
  }

  const keywordPattern = new RegExp(
    `(${keywordTexts.map(escapeRegExp).join("|")})`,
    "gi"
  );
  const normalizedKeywordTexts = new Set(
    keywordTexts.map((keyword) => keyword.toLocaleLowerCase())
  );

  return paragraph.split(keywordPattern).map((part, index) => {
    if (!part) {
      return null;
    }

    if (normalizedKeywordTexts.has(part.toLocaleLowerCase())) {
      return (
        <span className="script-keyword-highlight" key={`${part}-${index}`}>
          {part}
        </span>
      );
    }

    return part;
  });
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function formatEmptyReportMessage(status: RehearsalReportStatus, error: string) {
  if (status === "loading") return "보고서를 불러오는 중입니다.";
  if (status === "not-ready") return "보고서 생성 중입니다.";
  if (status === "failed") return error || "보고서를 불러오지 못했습니다.";
  return "보고서 대기 중";
}

function calculateReportScore(report: RehearsalReport) {
  const deliveryScore = calculateDeliveryScore(report);
  const speedScore = calculateSpeedScore(report);
  const keywordScore = Math.round(report.metrics.keywordCoverage * 100);

  return clamp(Math.round(deliveryScore * 0.45 + speedScore * 0.3 + keywordScore * 0.25), 0, 100);
}

function calculateDeliveryScore(report: RehearsalReport) {
  const fillerPenalty = Math.min(20, report.metrics.fillerWordCount * 4);
  const pausePenalty = Math.min(18, report.metrics.pauseCount * 3);
  return clamp(Math.round(96 - fillerPenalty - pausePenalty), 45, 99);
}

function calculateSpeedScore(report: RehearsalReport) {
  const distanceFromIdeal = Math.abs(report.metrics.wordsPerMinute - 130);
  return clamp(Math.round(96 - distanceFromIdeal * 0.75), 45, 99);
}

function buildCoachingHeadline(report: RehearsalReport | null) {
  if (report?.coaching?.summary) {
    return report.coaching.summary;
  }

  if (!report) {
    return "리허설 데이터를 불러오고 있어요.";
  }

  if (report.metrics.keywordCoverage < 0.8) {
    return "핵심 흐름은 안정적이지만, 일부 키워드 회수가 부족했어요.";
  }

  if (report.metrics.wordsPerMinute > 150) {
    return "핵심 메시지는 좋지만, 빠르게 지나간 구간이 있어요.";
  }

  return "핵심 흐름은 안정적이고, 발표 속도도 적절했어요.";
}

function buildCoachingDetail(report: RehearsalReport | null, deck: Deck | null) {
  if (!report) {
    return "보고서가 준비되면 다음 연습에 집중할 내용을 보여드립니다.";
  }

  if (report.coaching?.nextPracticeFocus) {
    return report.coaching.nextPracticeFocus;
  }

  const nextSlide = deck?.slides[Math.min(2, Math.max(0, deck.slides.length - 1))];
  const focus = nextSlide?.title ? `"${nextSlide.title}"` : "다음";
  return `다음 리허설은 ${focus} 슬라이드의 자료 설명을 짧게 줄이고, 누락 키워드를 노트에 고정하는 데 집중하면 됩니다.`;
}

function buildMissedKeywordLabels(deck: Deck | null, report: RehearsalReport | null) {
  if (!report) {
    return [];
  }

  if (report.metrics.keywordCoverage >= 1) {
    return [];
  }

  const allKeywords = deck?.slides.flatMap((slide) => slide.keywords.map((keyword) => keyword.text)) ?? [];
  const fallbackKeywords = ["디코더", "실시간 보정", "사용자 피드백", "오류율 4.8%"];
  const keywordPool = allKeywords.length > 0 ? allKeywords : fallbackKeywords;
  const missingCount = clamp(
    Math.ceil((1 - report.metrics.keywordCoverage) * Math.max(3, keywordPool.length)),
    0,
    4
  );

  return Array.from(new Set(keywordPool)).slice(0, missingCount);
}

function getTargetDurationSeconds(deck: Deck | null) {
  return Math.max(60, (deck?.slides.length ?? 7) * 40);
}

function buildSpeedSamples(wordsPerMinute: number) {
  const base = Math.round(wordsPerMinute);
  return [base - 28, base + 54, base + 68, base + 42, base + 60, base + 30, base - 10, base - 46, base - 52, base - 38, base + 26, base + 48, base + 38];
}

function formatSignedDuration(totalSeconds: number) {
  const sign = totalSeconds >= 0 ? "" : "-";
  return `${sign}${formatDuration(Math.abs(totalSeconds))}`;
}

function formatDuration(totalSeconds: number) {
  const safeSeconds = Math.max(0, Math.floor(totalSeconds));
  const minutes = Math.floor(safeSeconds / 60);
  const seconds = (safeSeconds % 60).toString().padStart(2, "0");
  return `${minutes}:${seconds}`;
}

function formatReportDate(value?: string) {
  if (!value) return "-";

  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) {
    return value;
  }

  const date = new Date(parsed);
  return `${date.getFullYear().toString().slice(2)}.${(date.getMonth() + 1)
    .toString()
    .padStart(2, "0")}.${date.getDate().toString().padStart(2, "0")}.`;
}

function formatClock(totalSeconds: number) {
  const minutes = Math.floor(totalSeconds / 60)
    .toString()
    .padStart(2, "0");
  const seconds = Math.floor(totalSeconds % 60)
    .toString()
    .padStart(2, "0");
  return `${minutes}:${seconds}`;
}

function parseClockInput(value: string): number | null {
  const normalizedValue = value.trim();
  const match = normalizedValue.match(/^(\d{1,3})(?::([0-5]?\d))?$/);

  if (!match) {
    return null;
  }

  const minutes = Number(match[1]);
  const seconds = Number(match[2] ?? 0);

  if (!Number.isFinite(minutes) || !Number.isFinite(seconds)) {
    return null;
  }

  return minutes * 60 + seconds;
}

function navigateToRehearsal(projectId: string) {
  navigateToPath(`/rehearsal/${encodeURIComponent(projectId)}`);
}

function navigateToPath(path: string) {
  window.history.pushState({}, "", path);
  window.dispatchEvent(new PopStateEvent("popstate"));
}

function PresentationScreenIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" width="16" height="16">
      <path
        d="M4 5.5h16v10H4zM9 19h6M12 15.5V19"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.8"
      />
    </svg>
  );
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
    return "留덉씠??沅뚰븳??嫄곕??섏뿀?듬땲??";
  }

  if (cause instanceof DOMException && cause.name === "NotFoundError") {
    return "?ъ슜?????덈뒗 留덉씠?щ? 李얠? 紐삵뻽?듬땲??";
  }

  return toErrorMessage(cause) || "?뱀쓬???쒖옉?섏? 紐삵뻽?듬땲??";
}

function toRehearsalFlowMessage(cause: unknown) {
  if (cause instanceof RehearsalFlowError) {
    if (cause.stage === "storage-put") {
      return "?낅줈?쒓? 以묐떒?섏뿀?듬땲?? ?ㅽ듃?뚰겕? ?ㅽ넗由ъ? ?곌껐???뺤씤?섏꽭??";
    }

    if (cause.stage === "complete" || cause.stage === "job-poll") {
      return cause.message || "STT ?먮뒗 肄붿묶 遺꾩꽍 ?묒뾽???ㅽ뙣?덉뒿?덈떎.";
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
    cause instanceof Error ? cause.message : "Live STT瑜??쒖옉?섏? 紐삵뻽?듬땲??"
  );
}

function toErrorMessage(cause: unknown) {
  return cause instanceof Error ? cause.message : "?붿껌??泥섎━?섏? 紐삵뻽?듬땲??";
}

function extensionForMimeType(mimeType: string) {
  if (mimeType.includes("mp4")) return "m4a";
  if (mimeType.includes("ogg")) return "ogg";
  return "webm";
}
