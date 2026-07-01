import {
  liveSttPartialTranscriptEventSchema,
  type LiveSttPartialTranscriptEvent
} from "@orbit/shared";
import {
  LiveSttAdapterError,
  type LiveSttAdapter,
  type LiveSttBiasContext,
  type LiveSttCallbacks,
  type LiveSttStartOptions
} from "./liveStt";

type WebSpeechAvailabilityStatus =
  | "available"
  | "downloadable"
  | "downloading"
  | "unavailable";
type WebSpeechQuality = "command" | "dictation" | "conversation";
type WebSpeechOptions = {
  langs: string[];
  processLocally: boolean;
  quality: WebSpeechQuality;
};

type WebSpeechRecognitionAlternative = {
  transcript: string;
  confidence?: number;
};
type WebSpeechRecognitionResult = {
  isFinal: boolean;
  length: number;
  [index: number]: WebSpeechRecognitionAlternative | undefined;
};
type WebSpeechRecognitionResultList = {
  length: number;
  [index: number]: WebSpeechRecognitionResult | undefined;
};
type WebSpeechRecognitionEvent = {
  resultIndex: number;
  results: WebSpeechRecognitionResultList;
};
type WebSpeechRecognitionErrorEvent = {
  error: string;
  message?: string;
};
type WebSpeechRecognitionPhrase = {
  phrase: string;
  boost: number;
};
type WebSpeechRecognition = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  processLocally?: boolean;
  phrases?: WebSpeechRecognitionPhrase[];
  onstart: (() => void) | null;
  onresult: ((event: WebSpeechRecognitionEvent) => void) | null;
  onerror: ((event: WebSpeechRecognitionErrorEvent) => void) | null;
  onend: (() => void) | null;
  start: (audioTrack?: MediaStreamTrack) => void;
  stop: () => void;
  abort?: () => void;
};
type WebSpeechRecognitionConstructor = {
  new (): WebSpeechRecognition;
  available?: (options: WebSpeechOptions) => Promise<WebSpeechAvailabilityStatus>;
  install?: (options: WebSpeechOptions) => Promise<boolean>;
};
type WebSpeechRecognitionPhraseConstructor = new (
  phrase: string,
  boost: number
) => WebSpeechRecognitionPhrase;

const defaultLiveSttLanguage = "ko-KR";
const defaultLiveSttQuality: WebSpeechQuality = "command";
const webSpeechStartTimeoutMs = 10_000;
const liveSttLatencyDebugStorageKey = "orbit.liveStt.debugLatency";

export class WebSpeechLiveSttAdapter implements LiveSttAdapter {
  private callbacks: LiveSttCallbacks | null = null;
  private recognition: WebSpeechRecognition | null = null;
  private sessionId: string | null = null;
  private startTimer: ReturnType<typeof setTimeout> | null = null;
  private startResolve: (() => void) | null = null;
  private startReject: ((error: LiveSttAdapterError) => void) | null = null;
  private isDisposed = false;
  private stopRequested = false;

  constructor(
    private readonly options: {
      language?: string;
      quality?: WebSpeechQuality;
      createRecognition?: () => WebSpeechRecognition;
      recognitionCtor?: WebSpeechRecognitionConstructor;
      phraseCtor?: WebSpeechRecognitionPhraseConstructor;
      startTimeoutMs?: number;
    } = {}
  ) {}

  async start(
    stream: MediaStream,
    callbacks: LiveSttCallbacks,
    options: LiveSttStartOptions = {}
  ) {
    if (this.isDisposed) {
      throw new LiveSttAdapterError(
        "LIVE_STT_START_FAILED",
        "Live STT adapter has been disposed."
      );
    }

    this.stop();
    this.callbacks = callbacks;
    this.stopRequested = false;

    const recognitionCtor = this.getRecognitionConstructor();
    await ensureOnDeviceLanguageAvailable(
      recognitionCtor,
      this.getLanguage(),
      this.getQuality()
    );

    const audioTrack = getLiveAudioTrack(stream);
    const recognition = this.options.createRecognition?.() ?? new recognitionCtor();
    const sessionId = `live_stt_${Date.now()}_${Math.random()
      .toString(36)
      .slice(2)}`;

    configureRecognition(recognition, this.getLanguage());
    this.applyBiasContext(recognition, options.biasContext ?? null);
    this.recognition = recognition;
    this.sessionId = sessionId;

    return new Promise<void>((resolve, reject) => {
      this.startResolve = resolve;
      this.startReject = reject;
      this.startTimer = setTimeout(() => {
        this.rejectStart(
          new LiveSttAdapterError(
            "LIVE_STT_START_FAILED",
            "Chrome Web Speech did not start in time."
          )
        );
      }, this.options.startTimeoutMs ?? webSpeechStartTimeoutMs);

      recognition.onstart = () => {
        if (this.sessionId !== sessionId) {
          return;
        }

        this.resolveStart();
      };
      recognition.onresult = (event) => {
        if (this.sessionId !== sessionId) {
          return;
        }

        this.handleResult(sessionId, event);
      };
      recognition.onerror = (event) => {
        if (this.sessionId !== sessionId) {
          return;
        }

        this.handleError(event);
      };
      recognition.onend = () => {
        if (this.sessionId !== sessionId || this.stopRequested) {
          return;
        }

        this.handleError({
          error: "aborted",
          message: "Chrome Web Speech ended unexpectedly."
        });
      };

      try {
        recognition.start(audioTrack);
      } catch (error) {
        this.rejectStart(toLiveSttAdapterError(error));
      }
    });
  }

  updateBiasContext(biasContext: LiveSttBiasContext | null) {
    if (!this.recognition) {
      return;
    }

    this.applyBiasContext(this.recognition, biasContext);
  }

  stop() {
    this.stopRequested = true;
    this.clearStartTimer();
    this.startResolve = null;
    this.startReject = null;
    this.sessionId = null;

    if (!this.recognition) {
      return;
    }

    const recognition = this.recognition;
    recognition.onstart = null;
    recognition.onresult = null;
    recognition.onerror = null;
    recognition.onend = null;
    this.recognition = null;

    try {
      recognition.stop();
    } catch {
      recognition.abort?.();
    }
  }

  dispose() {
    this.isDisposed = true;
    this.stop();
    this.callbacks = null;
  }

  private getRecognitionConstructor() {
    const recognitionCtor = this.options.recognitionCtor ?? readSpeechRecognitionConstructor();
    if (!recognitionCtor) {
      throw new LiveSttAdapterError(
        "LIVE_STT_MODEL_UNAVAILABLE",
        "Chrome Web Speech on-device recognition is unavailable in this browser."
      );
    }

    if (
      typeof recognitionCtor.available !== "function" ||
      typeof recognitionCtor.install !== "function"
    ) {
      throw new LiveSttAdapterError(
        "LIVE_STT_MODEL_UNAVAILABLE",
        "Chrome Web Speech on-device language pack APIs are unavailable."
      );
    }

    return recognitionCtor;
  }

  private getLanguage() {
    return this.options.language ?? defaultLiveSttLanguage;
  }

  private getQuality() {
    return this.options.quality ?? defaultLiveSttQuality;
  }

  private applyBiasContext(
    recognition: WebSpeechRecognition,
    biasContext: LiveSttBiasContext | null
  ) {
    const phraseCtor = this.options.phraseCtor ?? readSpeechRecognitionPhraseConstructor();
    if (!phraseCtor || !("phrases" in recognition)) {
      return;
    }

    try {
      recognition.phrases = createSpeechRecognitionPhrases(
        phraseCtor,
        biasContext
      );
    } catch {
      recognition.phrases = [];
    }
  }

  private handleResult(sessionId: string, event: WebSpeechRecognitionEvent) {
    const events = parseResultEvents(event);
    for (const nextEvent of events) {
      if (this.sessionId !== sessionId) {
        return;
      }

      logLiveSttTranscriptDebug(sessionId, nextEvent);
      this.callbacks?.onPartialTranscript(nextEvent);
    }
  }

  private handleError(event: WebSpeechRecognitionErrorEvent) {
    const error = mapWebSpeechError(event);
    if (this.startReject) {
      this.rejectStart(error);
      return;
    }

    this.callbacks?.onError(error);
    this.stop();
  }

  private resolveStart() {
    const resolve = this.startResolve;
    this.clearStartTimer();
    this.startResolve = null;
    this.startReject = null;
    resolve?.();
  }

  private rejectStart(error: LiveSttAdapterError) {
    const reject = this.startReject;
    this.clearStartTimer();
    this.startResolve = null;
    this.startReject = null;
    this.stop();
    reject?.(error);
  }

  private clearStartTimer() {
    if (!this.startTimer) {
      return;
    }

    clearTimeout(this.startTimer);
    this.startTimer = null;
  }
}

async function ensureOnDeviceLanguageAvailable(
  recognitionCtor: WebSpeechRecognitionConstructor,
  language: string,
  quality: WebSpeechQuality
) {
  const options = {
    langs: [language],
    processLocally: true,
    quality
  };
  const initialStatus = await recognitionCtor.available?.(options);
  if (initialStatus === "available") {
    return;
  }

  if (initialStatus === "downloadable" || initialStatus === "downloading") {
    const installed = await recognitionCtor.install?.(options);
    const nextStatus = installed
      ? await recognitionCtor.available?.(options)
      : initialStatus;
    if (nextStatus === "available") {
      return;
    }
  }

  throw new LiveSttAdapterError(
    "LIVE_STT_MODEL_UNAVAILABLE",
    `Chrome Web Speech on-device language pack is unavailable for ${language}.`
  );
}

function configureRecognition(
  recognition: WebSpeechRecognition,
  language: string
) {
  recognition.lang = language;
  recognition.continuous = true;
  recognition.interimResults = true;
  recognition.maxAlternatives = 1;
  recognition.processLocally = true;
}

function getLiveAudioTrack(stream: MediaStream) {
  const [audioTrack] = stream.getAudioTracks();
  if (!audioTrack || audioTrack.readyState !== "live") {
    throw new LiveSttAdapterError(
      "LIVE_STT_START_FAILED",
      "A live microphone audio track is required for Chrome Web Speech."
    );
  }

  return audioTrack;
}

function createSpeechRecognitionPhrases(
  phraseCtor: WebSpeechRecognitionPhraseConstructor,
  biasContext: LiveSttBiasContext | null
) {
  if (!biasContext) {
    return [];
  }

  const seen = new Set<string>();
  return biasContext.terms.flatMap((term) => {
    const phrase = term.text.replace(/\s+/g, " ").trim();
    const key = phrase.toLocaleLowerCase();
    if (!phrase || seen.has(key)) {
      return [];
    }

    seen.add(key);
    return [new phraseCtor(phrase, weightToBoost(term.weight))];
  });
}

function weightToBoost(weight: number) {
  if (!Number.isFinite(weight)) {
    return 1;
  }

  return Math.min(5, Math.max(1, Math.round((1 + weight * 4) * 10) / 10));
}

function parseResultEvents(event: WebSpeechRecognitionEvent) {
  const parsedEvents: LiveSttPartialTranscriptEvent[] = [];
  for (
    let resultIndex = event.resultIndex;
    resultIndex < event.results.length;
    resultIndex += 1
  ) {
    const result = event.results[resultIndex];
    const alternative = result?.[0];
    const transcript = alternative?.transcript?.trim() ?? "";
    if (!result || !transcript) {
      continue;
    }

    parsedEvents.push(
      liveSttPartialTranscriptEventSchema.parse({
        type: "partial-transcript",
        transcript,
        isFinal: result.isFinal,
        confidence:
          typeof alternative?.confidence === "number"
            ? alternative.confidence
            : null
      })
    );
  }

  return parsedEvents;
}

function mapWebSpeechError(event: WebSpeechRecognitionErrorEvent) {
  const code =
    event.error === "language-not-supported" ||
    event.error === "service-not-allowed"
      ? "LIVE_STT_MODEL_UNAVAILABLE"
      : "LIVE_STT_START_FAILED";
  const message =
    event.message ||
    (code === "LIVE_STT_MODEL_UNAVAILABLE"
      ? "Chrome Web Speech on-device recognition is unavailable."
      : "Chrome Web Speech recognition failed.");

  return new LiveSttAdapterError(code, message);
}

function toLiveSttAdapterError(error: unknown) {
  if (error instanceof LiveSttAdapterError) {
    return error;
  }

  return new LiveSttAdapterError(
    "LIVE_STT_START_FAILED",
    error instanceof Error ? error.message : "Chrome Web Speech recognition failed."
  );
}

function readSpeechRecognitionConstructor() {
  if (typeof window === "undefined") {
    return null;
  }

  return (window as Window & {
    SpeechRecognition?: WebSpeechRecognitionConstructor;
  }).SpeechRecognition ?? null;
}

function readSpeechRecognitionPhraseConstructor() {
  if (typeof window === "undefined") {
    return null;
  }

  return (window as Window & {
    SpeechRecognitionPhrase?: WebSpeechRecognitionPhraseConstructor;
  }).SpeechRecognitionPhrase ?? null;
}

function logLiveSttTranscriptDebug(
  sessionId: string,
  event: LiveSttPartialTranscriptEvent
) {
  if (!isLiveSttLatencyDebugEnabled()) {
    return;
  }

  console.debug("[orbit-live-stt-transcript]", {
    sessionId,
    isFinal: event.isFinal,
    confidence: event.confidence,
    transcript: event.transcript
  });
}

function isLiveSttLatencyDebugEnabled() {
  if (typeof window === "undefined") {
    return false;
  }

  try {
    return window.localStorage?.getItem(liveSttLatencyDebugStorageKey) === "1";
  } catch {
    return false;
  }
}
