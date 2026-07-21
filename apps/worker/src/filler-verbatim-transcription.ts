import type { RehearsalUtteranceAudioClip } from "./rehearsal-utterance-audio";

export const koreanFillerVerbatimPromptVersion =
  "korean-filler-verbatim-v1" as const;

export type VerbatimPronunciationTerm = {
  source: string;
  aliases: readonly string[];
};

export type FillerVerbatimTranscriptionResult = {
  utteranceId: string;
  sequence: number;
  slideId: string | null;
  status: "completed" | "failed";
  transcript: string | null;
  errorCode: string | null;
};

export type FillerVerbatimTranscriptionEvent = {
  event:
    | "rehearsal.filler_verbatim.started"
    | "rehearsal.filler_verbatim.succeeded"
    | "rehearsal.filler_verbatim.degraded";
  provider: "openai";
  model: string;
  promptVersion: typeof koreanFillerVerbatimPromptVersion;
  utteranceCount: number;
  completedUtterances: number;
  durationMs: number;
  status: "started" | "completed" | "degraded";
  errorCode?: string;
};

export function buildKoreanFillerVerbatimPrompt(
  pronunciationTerms: readonly VerbatimPronunciationTerm[] = [],
) {
  const instructions = [
    "한국어 음성을 들리는 그대로 축어 전사하세요.",
    "문법, 조사, 어미, 비문을 교정하거나 매끄럽게 바꾸지 마세요.",
    "음, 어, 으, 아 같은 머뭇거림과 반복, 말더듬, 문장 재시작을 보존하세요.",
    "들리지 않은 습관어나 단어를 추가하거나 추측하지 마세요.",
    "예: '음 그러니까 그 그 결과는'을 그대로 '음 그러니까 그 그 결과는'으로 적습니다.",
  ];
  const terms = pronunciationTerms
    .slice(0, 40)
    .map((term) => {
      const source = sanitizePromptTerm(term.source);
      const aliases = term.aliases
        .map(sanitizePromptTerm)
        .filter(Boolean)
        .slice(0, 3);
      return source && aliases.length > 0
        ? `${source}: ${aliases.join(", ")}`
        : null;
    })
    .filter((term): term is string => term !== null);

  return terms.length > 0
    ? `${instructions.join("\n")}\n용어 발음 참고:\n${terms.join("\n")}`
    : instructions.join("\n");
}

export async function transcribeMiniFillerUtterances(input: {
  apiKey: string;
  clips: readonly RehearsalUtteranceAudioClip[];
  fetcher?: typeof fetch;
  model: string;
  now?: () => number;
  onEvent?: (event: FillerVerbatimTranscriptionEvent) => void;
  pronunciationTerms?: readonly VerbatimPronunciationTerm[];
  timeoutMs?: number;
}): Promise<FillerVerbatimTranscriptionResult[]> {
  const fetcher = input.fetcher ?? fetch;
  const now = input.now ?? (() => Date.now());
  const startedAtMs = now();
  const prompt = buildKoreanFillerVerbatimPrompt(input.pronunciationTerms);
  input.onEvent?.({
    event: "rehearsal.filler_verbatim.started",
    provider: "openai",
    model: input.model,
    promptVersion: koreanFillerVerbatimPromptVersion,
    utteranceCount: input.clips.length,
    completedUtterances: 0,
    durationMs: 0,
    status: "started",
  });

  const results = new Array<FillerVerbatimTranscriptionResult>(
    input.clips.length,
  );
  let cursor = 0;
  const workers = Array.from(
    { length: Math.min(2, input.clips.length) },
    async () => {
      while (cursor < input.clips.length) {
        const index = cursor++;
        const clip = input.clips[index];
        if (!clip) continue;
        results[index] = await transcribeClip({
          apiKey: input.apiKey,
          clip,
          fetcher,
          model: input.model,
          prompt,
          timeoutMs: input.timeoutMs ?? 30_000,
        });
      }
    },
  );
  await Promise.all(workers);

  const ordered = results
    .filter((result): result is FillerVerbatimTranscriptionResult => Boolean(result))
    .sort((left, right) => left.sequence - right.sequence);
  const completedUtterances = ordered.filter(
    (result) => result.status === "completed",
  ).length;
  const degraded = completedUtterances !== ordered.length;
  input.onEvent?.({
    event: degraded
      ? "rehearsal.filler_verbatim.degraded"
      : "rehearsal.filler_verbatim.succeeded",
    provider: "openai",
    model: input.model,
    promptVersion: koreanFillerVerbatimPromptVersion,
    utteranceCount: ordered.length,
    completedUtterances,
    durationMs: Math.max(now() - startedAtMs, 0),
    status: degraded ? "degraded" : "completed",
    ...(degraded ? { errorCode: "FILLER_VERBATIM_PARTIAL_FAILURE" } : {}),
  });
  return ordered;
}

async function transcribeClip(input: {
  apiKey: string;
  clip: RehearsalUtteranceAudioClip;
  fetcher: typeof fetch;
  model: string;
  prompt: string;
  timeoutMs: number;
}): Promise<FillerVerbatimTranscriptionResult> {
  let lastErrorCode = "FILLER_VERBATIM_REQUEST_FAILED";
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const form = new FormData();
      form.set("file", new Blob([new Uint8Array(input.clip.audio)], {
        type: input.clip.mimeType,
      }), `utterance-${input.clip.sequence}.wav`);
      form.set("model", input.model);
      form.set("language", "ko");
      form.set("response_format", "json");
      form.set("prompt", input.prompt);
      const response = await input.fetcher(
        "https://api.openai.com/v1/audio/transcriptions",
        {
          method: "POST",
          headers: { Authorization: `Bearer ${input.apiKey}` },
          body: form,
          signal: AbortSignal.timeout(input.timeoutMs),
        },
      );
      if (!response.ok) {
        lastErrorCode = statusErrorCode(response.status);
        if (attempt === 0 && isTransientStatus(response.status)) continue;
        break;
      }
      const payload: unknown = await response.json();
      const transcript = readTranscript(payload);
      if (!transcript) {
        lastErrorCode = "FILLER_VERBATIM_EMPTY_RESPONSE";
        break;
      }
      return {
        utteranceId: input.clip.utteranceId,
        sequence: input.clip.sequence,
        slideId: input.clip.slideId,
        status: "completed",
        transcript,
        errorCode: null,
      };
    } catch (error) {
      lastErrorCode =
        error instanceof DOMException && error.name === "TimeoutError"
          ? "FILLER_VERBATIM_TIMEOUT"
          : "FILLER_VERBATIM_NETWORK_ERROR";
      if (attempt === 0) continue;
    }
  }

  return {
    utteranceId: input.clip.utteranceId,
    sequence: input.clip.sequence,
    slideId: input.clip.slideId,
    status: "failed",
    transcript: null,
    errorCode: lastErrorCode,
  };
}

function readTranscript(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const text = "text" in value && typeof value.text === "string"
    ? value.text.trim()
    : "";
  return text || null;
}

function isTransientStatus(status: number) {
  return status === 429 || status >= 500;
}

function statusErrorCode(status: number) {
  if (status === 429) return "FILLER_VERBATIM_RATE_LIMITED";
  if (status >= 500) return "FILLER_VERBATIM_PROVIDER_ERROR";
  return "FILLER_VERBATIM_REQUEST_REJECTED";
}

function sanitizePromptTerm(value: string) {
  return value.trim().replace(/[\r\n:,]+/g, " ").replace(/\s+/g, " ").slice(0, 80);
}
