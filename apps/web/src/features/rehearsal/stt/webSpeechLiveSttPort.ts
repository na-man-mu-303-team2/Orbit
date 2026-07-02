import {
  getBrowserSpeechRecognitionConstructor,
  type BrowserSpeechRecognition,
  type BrowserSpeechRecognitionErrorEvent,
  type BrowserSpeechRecognitionEvent
} from "./browserSpeechRecognition";
import {
  LiveSttError,
  type LiveSttCapabilities,
  type LiveSttPort,
  type LiveSttResult,
  type LiveSttSessionConfig,
  type LiveSttUnsubscribe
} from "./liveSttPort";

export type BrowserSpeechRecognitionFactory = () => BrowserSpeechRecognition;

type WebSpeechLiveSttPortOptions = {
  consentGranted: boolean;
  createRecognition?: BrowserSpeechRecognitionFactory | null;
  now?: () => number;
};

export class WebSpeechLiveSttPort implements LiveSttPort {
  readonly engineId = "web-speech";
  readonly capabilities: LiveSttCapabilities = {
    onDevice: false,
    streaming: true,
    keywordBiasing: false,
    languages: ["ko"]
  };

  private readonly createRecognition: BrowserSpeechRecognitionFactory | null;
  private readonly now: () => number;
  private readonly resultSubscribers = new Set<(result: LiveSttResult) => void>();
  private readonly errorSubscribers = new Set<(error: LiveSttError) => void>();
  private recognition: BrowserSpeechRecognition | null = null;
  private startedAtMs: number | null = null;

  constructor(private readonly options: WebSpeechLiveSttPortOptions) {
    this.createRecognition =
      options.createRecognition === undefined
        ? createDefaultBrowserSpeechRecognition
        : options.createRecognition;
    this.now = options.now ?? (() => Date.now());
  }

  async start(config: LiveSttSessionConfig) {
    if (!this.options.consentGranted) {
      throw new LiveSttError(
        "consent_required",
        "Web Speech는 브라우저에 따라 외부 인식 서비스를 사용할 수 있어 명시적 동의가 필요합니다."
      );
    }

    if (!this.createRecognition) {
      throw new LiveSttError(
        "unsupported_runtime",
        "이 브라우저는 Web Speech 인식을 지원하지 않습니다."
      );
    }

    const recognition = this.createRecognition();
    this.recognition = recognition;
    this.startedAtMs = this.now();

    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = config.language === "ko" ? "ko-KR" : config.language;
    recognition.maxAlternatives = 1;
    recognition.onresult = (event) => this.handleResult(event);
    recognition.onerror = (event) => this.handleError(event);
    recognition.onend = () => {
      this.startedAtMs = null;
    };

    try {
      recognition.start();
    } catch (error) {
      this.startedAtMs = null;
      this.recognition = null;
      throw new LiveSttError(
        "start_failed",
        error instanceof Error ? error.message : "Web Speech 인식을 시작하지 못했습니다."
      );
    }
  }

  async stop() {
    const recognition = this.recognition;
    this.startedAtMs = null;
    this.recognition = null;
    recognition?.stop();
  }

  updateBiasPhrases(_phrases: string[]) {
    // Web Speech의 contextual biasing 지원은 브라우저별 편차가 커서 P2에서는 후처리 매칭만 사용한다.
  }

  onResult(cb: (result: LiveSttResult) => void): LiveSttUnsubscribe {
    this.resultSubscribers.add(cb);
    return () => {
      this.resultSubscribers.delete(cb);
    };
  }

  onError(cb: (error: LiveSttError) => void): LiveSttUnsubscribe {
    this.errorSubscribers.add(cb);
    return () => {
      this.errorSubscribers.delete(cb);
    };
  }

  dispose() {
    this.startedAtMs = null;
    this.resultSubscribers.clear();
    this.errorSubscribers.clear();
    this.recognition?.abort();
    this.recognition = null;
  }

  private handleResult(event: BrowserSpeechRecognitionEvent) {
    if (this.startedAtMs === null) {
      return;
    }

    const elapsedMs = Math.max(this.now() - this.startedAtMs, 0);
    for (let index = event.resultIndex; index < event.results.length; index += 1) {
      const result = event.results[index];
      const alternative = result?.[0];
      const text = alternative?.transcript.trim();
      if (!result || !alternative || !text) {
        continue;
      }

      this.emitResult({
        text,
        isFinal: result.isFinal,
        timestampMs: [elapsedMs, elapsedMs],
        ...(typeof alternative.confidence === "number"
          ? { confidence: alternative.confidence }
          : {})
      });
    }
  }

  private handleError(event: BrowserSpeechRecognitionErrorEvent) {
    this.emitError(
      new LiveSttError(
        "runtime_error",
        event.message || `Web Speech 인식 오류: ${event.error ?? "unknown"}`
      )
    );
  }

  private emitResult(result: LiveSttResult) {
    for (const subscriber of this.resultSubscribers) {
      subscriber(result);
    }
  }

  private emitError(error: LiveSttError) {
    for (const subscriber of this.errorSubscribers) {
      subscriber(error);
    }
  }
}

function createDefaultBrowserSpeechRecognition() {
  const Recognition = getBrowserSpeechRecognitionConstructor();
  if (!Recognition) {
    throw new LiveSttError(
      "unsupported_runtime",
      "이 브라우저는 Web Speech 인식을 지원하지 않습니다."
    );
  }

  return new Recognition();
}
