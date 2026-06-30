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
  Download,
  Mic,
  MoreHorizontal,
  PlayCircle,
  RotateCcw,
  Sparkles,
  Square
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
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
import { SherpaLiveSttAdapter } from "./sherpaOnnxLiveSttAdapter";

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

export async function fetchRehearsalRun(
  runId: string,
  fetcher: Fetcher = fetch
) {
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

  return {
    slideId: slide.slideId,
    terms: Array.from(terms.values())
      .sort(compareBiasTerms)
      .slice(0, maxLiveSttBiasTerms)
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
      !hasFuzzyBiasMatch(normalizedTranscript, normalizedTerm)
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
  return typeof window === "undefined" ? null : window.localStorage;
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

function hasFuzzyBiasMatch(normalizedTranscript: string, normalizedTerm: string) {
  const transcript = normalizeBiasDistanceText(normalizedTranscript);
  const term = normalizeBiasDistanceText(normalizedTerm);
  const maxDistance = maxBiasTermDistance(term.length);
  const minWindowLength = Math.max(3, term.length - maxDistance);
  const maxWindowLength = Math.min(transcript.length, term.length + maxDistance);

  for (let windowLength = minWindowLength; windowLength <= maxWindowLength; windowLength += 1) {
    for (let index = 0; index <= transcript.length - windowLength; index += 1) {
      const candidate = transcript.slice(index, index + windowLength);
      if (levenshteinDistance(candidate, term) <= maxDistance) {
        return true;
      }
    }
  }

  return false;
}

function normalizeBiasDistanceText(value: string) {
  return value.normalize("NFD");
}

function maxBiasTermDistance(length: number) {
  if (length <= 6) {
    return 1;
  }

  if (length <= 10) {
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
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [isTimerRunning, setIsTimerRunning] = useState(false);
  const [timeMode, setTimeMode] = useState<RehearsalTimeMode>("stopwatch");
  const [timerDurationSeconds, setTimerDurationSeconds] = useState(80);
  const sessionRef = useRef<RecordingSession | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const liveDemoStreamRef = useRef<MediaStream | null>(null);
  const liveSttAdapterRef = useRef<LiveSttAdapter | null>(
    props.liveSttAdapter ?? null
  );
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

  useEffect(() => {
    if (timeMode === "timer" && elapsedSeconds >= timerDurationSeconds) {
      setIsTimerRunning(false);
    }
  }, [elapsedSeconds, timeMode, timerDurationSeconds]);

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
      }
    } catch (cause) {
      stopMediaStream(stream);
      if (liveDemoStreamRef.current === stream) {
        liveDemoStreamRef.current = null;
      }
      setIsLiveDemoActive(false);
      setLiveError(toMicrophoneErrorMessage(cause));
      setLiveStatus("failed");
    }
  }

  function stopLiveDemo() {
    liveSttAdapterRef.current?.stop();
    stopMediaStream(liveDemoStreamRef.current);
    liveDemoStreamRef.current = null;
    setLiveAudioLevel(null);
    setIsLiveDemoActive(false);
    setLiveStatus((current) =>
      current === "listening" || current === "starting" ? "stopped" : current
    );
    cancelPendingAutoAdvance("cancelled");
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

    if (canRecord) {
      void startRecording();
    }
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
      setLiveStatus(
        error.code === "LIVE_STT_MODEL_UNAVAILABLE" ? "unavailable" : "failed"
      );
      setLiveError(error.message);
      setLiveAudioLevel(null);
      cancelPendingAutoAdvance("cancelled");
      return false;
    }
  }

  function handleLiveSttError(error: LiveSttAdapterError) {
    setLiveStatus(
      error.code === "LIVE_STT_MODEL_UNAVAILABLE" ? "unavailable" : "failed"
    );
    setLiveError(error.message);
    setLiveAudioLevel(null);
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
        setError(result.job.error?.message || result.job.message || "由ы뿀??遺꾩꽍???ㅽ뙣?덉뒿?덈떎.");
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

  const liveDetectedKeywordIds = new Set(
    liveKeywordState?.detectedKeywords.map((keyword) => keyword.keywordId) ?? []
  );
  const liveCoveragePercent = Math.round((liveKeywordState?.coverage ?? 0) * 100);
  const liveMissingKeywordIds = new Set(liveKeywordState?.missingKeywordIds ?? []);
  const checklistKeywords = getChecklistKeywords(currentSlide);
  const displayedSeconds =
    timeMode === "timer"
      ? Math.max(timerDurationSeconds - elapsedSeconds, 0)
      : elapsedSeconds;
  const timerMinutes = Math.max(1, Math.round(timerDurationSeconds / 60));
  const scriptParagraphs = buildScriptParagraphs(currentSlide);
  const hasDeletedRawAudio = Boolean(run?.rawAudioDeletedAt);

  return (
    <main className="rehearsal-presenter-shell">
      <div className="rehearsal-legacy-test-marker" aria-hidden="true">
        Live STT / Report AI / Speaker notes
      </div>
      <header className="rehearsal-presenter-topbar">
        <button
          className="rehearsal-exit-button"
          type="button"
          onClick={() => navigateToProject(deck?.projectId ?? props.projectId ?? demoIds.projectId)}
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
          </label>
          <strong>
            {timeMode === "timer" ? "\ub0a8\uc740" : "\uacbd\uacfc"} {formatClock(displayedSeconds)}
          </strong>
          <label className="rehearsal-timer-duration">
            <span>{"\ud0c0\uc774\uba38"}</span>
            <button
              type="button"
              aria-label="Decrease timer"
              onClick={() =>
                setTimerDurationSeconds((current) => Math.max(60, current - 60))
              }
            >
              -
            </button>
            <input
              aria-label="Timer minutes"
              min={1}
              max={180}
              type="number"
              value={timerMinutes}
              onChange={(event) => {
                const nextMinutes = Number(event.target.value);
                if (!Number.isFinite(nextMinutes)) return;
                setTimerDurationSeconds(Math.max(60, Math.min(10800, nextMinutes * 60)));
              }}
            />
            <small>{"\ubd84"}</small>
            <button
              type="button"
              aria-label="Increase timer"
              onClick={() =>
                setTimerDurationSeconds((current) => Math.min(10800, current + 60))
              }
            >
              +
            </button>
          </label>
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
        <button
          type="button"
          onClick={() => void startRecording()}
          disabled={!canRecord}
        >
          리포트 녹음 시작
        </button>
        <button
          type="button"
          onClick={stopRecording}
          disabled={phase !== "recording"}
        >
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
              <div className="rehearsal-empty-stage">{"\ubc1c\ud45c\uc790\ub8cc \ub85c\ub529 \uc911"}</div>
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
              if (!slide) return null;

              const label =
                offset === 0 ? "\ud604\uc7ac" : offset > 0 ? `+${offset}` : `${offset}`;
              return (
                <button
                  className={`rehearsal-context-thumb ${offset === 0 ? "active" : ""}`}
                  key={`${slide.slideId}-${offset}`}
                  type="button"
                  onClick={() => setCurrentSlideIndex(slideIndex)}
                >
                  <span>{label}</span>
                  <strong>{getSlideTitle(slide)}</strong>
                  <small>{getSlideSummary(slide)}</small>
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
              {checklistKeywords.map((keyword, index) => {
                const isDetected =
                  index < 2 || liveDetectedKeywordIds.has(keyword.keywordId);
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
              })}
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
                onClick={stopLiveDemo}
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
                <p key={`${paragraph}-${index}`}>{paragraph}</p>
              ))}
            </div>
          </section>
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
  const bodyTexts = getSlideBodyTexts(slide);
  const keywords = getChecklistKeywords(slide);

  return (
    <div
      className="rehearsal-slide-preview"
      style={{ backgroundColor, color: textColor }}
    >
      <h2 className="rehearsal-slide-title">{titleText}</h2>
      <div className="rehearsal-slide-diagram" aria-label="?щ씪?대뱶 ?듭떖 ?먮쫫">
        {keywords.slice(0, 5).map((keyword, index) => (
          <div className="diagram-step" key={keyword.keywordId}>
            <span className="diagram-icon">
              {index === 0 ? <Mic size={28} /> : index === 1 ? <span /> : index === 2 ? <Sparkles size={26} /> : index === 3 ? <PresentationScreenIcon /> : <CheckCircle2 size={28} />}
            </span>
            <strong>{keyword.text}</strong>
          </div>
        ))}
      </div>
      <p className="rehearsal-slide-caption">
        {bodyTexts[0] ?? `[ ${titleText} ]`}
      </p>
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
    .filter((element): element is Extract<DeckElement, { type: "text" }> =>
      element.type === "text" && Boolean(element.props.text.trim())
    )
    .map((element) => element.props.text.trim())
    .filter((text) => text !== slide.title.trim());
}

function getSlideSummary(slide: Slide) {
  return getSlideBodyTexts(slide)[0] ?? "Review the key point";
}

function getChecklistKeywords(slide: Slide | null): Keyword[] {
  const fallback = ["Realtime", "Voice", "Source"].map((text, index) => ({
    keywordId: `fallback-${index}`,
    text,
    synonyms: [],
    abbreviations: []
  }));

  if (!slide) return fallback;

  const keywords = slide.keywords.length > 0
    ? slide.keywords
    : getSlideBodyTexts(slide)
        .join(" ")
        .split(/s+/)
        .filter((word) => word.length > 1)
        .slice(0, 3)
        .map((text, index) => ({
          keywordId: `${slide.slideId}-keyword-${index}`,
          text,
          synonyms: [],
          abbreviations: []
        }));

  return keywords.length > 0 ? keywords.slice(0, 3) : fallback;
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

function formatClock(totalSeconds: number) {
  const minutes = Math.floor(totalSeconds / 60).toString().padStart(2, "0");
  const seconds = Math.floor(totalSeconds % 60).toString().padStart(2, "0");
  return `${minutes}:${seconds}`;
}

function navigateToProject(projectId: string) {
  window.history.pushState({}, "", `/project/${encodeURIComponent(projectId)}`);
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
