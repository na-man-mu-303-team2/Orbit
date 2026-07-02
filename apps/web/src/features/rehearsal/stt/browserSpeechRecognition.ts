export type BrowserSpeechRecognitionAlternative = {
  transcript: string;
  confidence?: number;
};

export type BrowserSpeechRecognitionResult = {
  isFinal: boolean;
  length: number;
  [index: number]: BrowserSpeechRecognitionAlternative | undefined;
};

export type BrowserSpeechRecognitionResultList = {
  length: number;
  [index: number]: BrowserSpeechRecognitionResult | undefined;
};

export type BrowserSpeechRecognitionEvent = {
  resultIndex: number;
  results: BrowserSpeechRecognitionResultList;
};

export type BrowserSpeechRecognitionErrorEvent = {
  error?: string;
  message?: string;
};

export type BrowserSpeechRecognition = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  maxAlternatives: number;
  onresult: ((event: BrowserSpeechRecognitionEvent) => void) | null;
  onerror: ((event: BrowserSpeechRecognitionErrorEvent) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
};

export type BrowserSpeechRecognitionConstructor = new () => BrowserSpeechRecognition;

declare global {
  interface Window {
    SpeechRecognition?: BrowserSpeechRecognitionConstructor;
    webkitSpeechRecognition?: BrowserSpeechRecognitionConstructor;
  }
}

export function getBrowserSpeechRecognitionConstructor(
  source: Pick<Window, "SpeechRecognition" | "webkitSpeechRecognition"> = window
) {
  return source.SpeechRecognition ?? source.webkitSpeechRecognition ?? null;
}
