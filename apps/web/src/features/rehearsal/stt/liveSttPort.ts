import type { LiveSttPartialTranscriptEvent } from "@orbit/shared";

export type LiveSttEngineId = "sherpa" | "web-speech" | "moonshine";

export type LiveSttCapabilities = {
  onDevice: boolean;
  streaming: boolean;
  keywordBiasing: boolean;
  languages: string[];
};

export type LiveSttSessionConfig = {
  language: "ko";
  audioSource: MediaStream;
  biasPhrases?: string[];
};

export type LiveSttResult = {
  text: string;
  isFinal: boolean;
  timestampMs: [number, number];
  confidence?: number;
};

export type LiveSttErrorCode =
  | "unsupported_runtime"
  | "model_unavailable"
  | "consent_required"
  | "start_failed"
  | "runtime_error";

export class LiveSttError extends Error {
  constructor(
    readonly code: LiveSttErrorCode,
    message: string
  ) {
    super(message);
    this.name = "LiveSttError";
  }
}

export type LiveSttUnsubscribe = () => void;

export type LiveSttPort = {
  readonly engineId: LiveSttEngineId;
  readonly capabilities: LiveSttCapabilities;
  start: (config: LiveSttSessionConfig) => Promise<void>;
  stop: () => Promise<void>;
  updateBiasPhrases: (phrases: string[]) => void | Promise<void>;
  onResult: (cb: (result: LiveSttResult) => void) => LiveSttUnsubscribe;
  onError: (cb: (error: LiveSttError) => void) => LiveSttUnsubscribe;
  dispose: () => void | Promise<void>;
};

export function mapPartialTranscriptToLiveSttResult(
  event: LiveSttPartialTranscriptEvent,
  elapsedMs: number
): LiveSttResult {
  const confidence =
    typeof event.confidence === "number" ? event.confidence : undefined;

  return {
    text: event.transcript,
    isFinal: event.isFinal,
    timestampMs: [elapsedMs, elapsedMs],
    ...(confidence === undefined ? {} : { confidence })
  };
}

export function normalizeLiveSttBiasPhrases(phrases: readonly string[] = []) {
  const normalized: string[] = [];
  const seen = new Set<string>();

  for (const phrase of phrases) {
    const text = phrase.trim().replace(/\s+/g, " ");
    if (!text || seen.has(text)) {
      continue;
    }

    seen.add(text);
    normalized.push(text);
  }

  return normalized;
}
