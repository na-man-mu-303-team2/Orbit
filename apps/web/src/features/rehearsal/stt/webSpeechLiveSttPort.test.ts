import { beforeEach, describe, expect, it } from "vitest";
import { runLiveSttPortContractTests } from "./liveSttPortContract";
import type {
  BrowserSpeechRecognition,
  BrowserSpeechRecognitionAvailability,
  BrowserSpeechRecognitionAvailabilityOptions
} from "./browserSpeechRecognition";
import { WebSpeechLiveSttPort } from "./webSpeechLiveSttPort";

runLiveSttPortContractTests("WebSpeech", () => {
  const recognition = new FakeSpeechRecognition();
  const port = new WebSpeechLiveSttPort({
    consentGranted: true,
    createRecognition: () => recognition,
    recognitionConstructor: FakeSpeechRecognition,
    now: () => 1000
  });

  return {
    port,
    audioSource: fakeMediaStream(),
    emitResult: (result) => recognition.emitResult(result),
    emitError: (error) => recognition.emitError(error.message),
    readBiasPhrases: () => [],
    expectedBiasPhrasesAfterUpdate: []
  };
});

describe("WebSpeechLiveSttPort", () => {
  beforeEach(() => {
    FakeSpeechRecognition.reset();
  });

  it("원격 Web Speech 모드는 동의 없이 시작하면 consent_required 오류를 던진다", async () => {
    const port = new WebSpeechLiveSttPort({
      consentGranted: false,
      createRecognition: () => new FakeSpeechRecognition(),
      processLocally: false,
      now: () => 1000
    });

    await expect(
      port.start({ language: "ko", audioSource: fakeMediaStream() })
    ).rejects.toMatchObject({
      code: "consent_required"
    });
  });

  it("브라우저 API가 없으면 unsupported_runtime 오류를 던진다", async () => {
    const port = new WebSpeechLiveSttPort({
      consentGranted: true,
      createRecognition: null,
      now: () => 1000
    });

    await expect(
      port.start({ language: "ko", audioSource: fakeMediaStream() })
    ).rejects.toMatchObject({
      code: "unsupported_runtime"
    });
  });

  it("Korean on-device continuous interim recognition 설정으로 시작한다", async () => {
    const recognition = new FakeSpeechRecognition();
    const port = new WebSpeechLiveSttPort({
      createRecognition: () => recognition,
      recognitionConstructor: FakeSpeechRecognition,
      now: () => 1000
    });

    await port.start({ language: "ko", audioSource: fakeMediaStream() });

    expect(recognition.continuous).toBe(true);
    expect(recognition.interimResults).toBe(true);
    expect(recognition.lang).toBe("ko-KR");
    expect(recognition.maxAlternatives).toBe(1);
    expect(recognition.processLocally).toBe(true);
    expect(recognition.startCount).toBe(1);
    expect(port.capabilities.onDevice).toBe(true);
    expect(FakeSpeechRecognition.availableCalls).toEqual([
      { langs: ["ko-KR"], processLocally: true, quality: "command" }
    ]);
    expect(FakeSpeechRecognition.installCalls).toEqual([]);
  });

  it("온디바이스 언어팩이 downloadable이면 설치 후 시작한다", async () => {
    const recognition = new FakeSpeechRecognition();
    FakeSpeechRecognition.availableResult = "downloadable";
    FakeSpeechRecognition.installResult = true;
    const port = new WebSpeechLiveSttPort({
      createRecognition: () => recognition,
      recognitionConstructor: FakeSpeechRecognition,
      now: () => 1000
    });

    await port.start({ language: "ko", audioSource: fakeMediaStream() });

    expect(recognition.startCount).toBe(1);
    expect(FakeSpeechRecognition.installCalls).toEqual([
      { langs: ["ko-KR"], processLocally: true, quality: "command" }
    ]);
  });

  it("processLocally를 지원하지 않으면 unsupported_runtime 오류를 던진다", async () => {
    const recognition = new FakeSpeechRecognition();
    delete (recognition as Partial<BrowserSpeechRecognition>).processLocally;
    const port = new WebSpeechLiveSttPort({
      createRecognition: () => recognition,
      recognitionConstructor: FakeSpeechRecognition,
      now: () => 1000
    });

    await expect(
      port.start({ language: "ko", audioSource: fakeMediaStream() })
    ).rejects.toMatchObject({
      code: "unsupported_runtime"
    });
    expect(recognition.startCount).toBe(0);
  });

  it("온디바이스 언어팩을 사용할 수 없으면 model_unavailable 오류를 던진다", async () => {
    FakeSpeechRecognition.availableResult = "unavailable";
    const port = new WebSpeechLiveSttPort({
      createRecognition: () => new FakeSpeechRecognition(),
      recognitionConstructor: FakeSpeechRecognition,
      now: () => 1000
    });

    await expect(
      port.start({ language: "ko", audioSource: fakeMediaStream() })
    ).rejects.toMatchObject({
      code: "model_unavailable"
    });
  });

  it("registry에서 Web Speech 엔진을 생성한다", async () => {
    const { createLiveSttPort } = await import("./liveSttEngineRegistry");

    expect(createLiveSttPort("web-speech")).toBeInstanceOf(WebSpeechLiveSttPort);
  });
});

class FakeSpeechRecognition {
  static availableResult: BrowserSpeechRecognitionAvailability = "available";
  static installResult = true;
  static availableCalls: BrowserSpeechRecognitionAvailabilityOptions[] = [];
  static installCalls: BrowserSpeechRecognitionAvailabilityOptions[] = [];

  static reset() {
    FakeSpeechRecognition.availableResult = "available";
    FakeSpeechRecognition.installResult = true;
    FakeSpeechRecognition.availableCalls = [];
    FakeSpeechRecognition.installCalls = [];
  }

  static async available(options: BrowserSpeechRecognitionAvailabilityOptions) {
    FakeSpeechRecognition.availableCalls.push(options);
    return FakeSpeechRecognition.availableResult;
  }

  static async install(options: BrowserSpeechRecognitionAvailabilityOptions) {
    FakeSpeechRecognition.installCalls.push(options);
    return FakeSpeechRecognition.installResult;
  }

  continuous = false;
  interimResults = false;
  lang = "";
  maxAlternatives = 0;
  processLocally = false;
  onresult: BrowserSpeechRecognition["onresult"] = null;
  onerror: BrowserSpeechRecognition["onerror"] = null;
  onend: BrowserSpeechRecognition["onend"] = null;
  startCount = 0;
  stopCount = 0;
  abortCount = 0;

  start() {
    this.startCount += 1;
  }

  stop() {
    this.stopCount += 1;
    this.onend?.();
  }

  abort() {
    this.abortCount += 1;
  }

  emitResult(result: { text: string; isFinal?: boolean; confidence?: number }) {
    this.onresult?.({
      resultIndex: 0,
      results: {
        length: 1,
        0: {
          isFinal: result.isFinal ?? false,
          length: 1,
          0: {
            transcript: result.text,
            confidence: result.confidence
          }
        }
      }
    });
  }

  emitError(message: string) {
    this.onerror?.({ error: "test-error", message });
  }
}

function fakeMediaStream() {
  return { getTracks: () => [] } as unknown as MediaStream;
}
