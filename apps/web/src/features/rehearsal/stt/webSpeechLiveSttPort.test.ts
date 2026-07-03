import { describe, expect, it } from "vitest";
import { runLiveSttPortContractTests } from "./liveSttPortContract";
import type { BrowserSpeechRecognition } from "./browserSpeechRecognition";
import { WebSpeechLiveSttPort } from "./webSpeechLiveSttPort";

runLiveSttPortContractTests("WebSpeech", () => {
  const recognition = new FakeSpeechRecognition();
  const port = new WebSpeechLiveSttPort({
    consentGranted: true,
    createRecognition: () => recognition,
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
  it("동의 없이 시작하면 consent_required 오류를 던진다", async () => {
    const port = new WebSpeechLiveSttPort({
      consentGranted: false,
      createRecognition: () => new FakeSpeechRecognition(),
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

  it("Korean continuous interim recognition 설정으로 시작한다", async () => {
    const recognition = new FakeSpeechRecognition();
    const port = new WebSpeechLiveSttPort({
      consentGranted: true,
      createRecognition: () => recognition,
      now: () => 1000
    });

    await port.start({ language: "ko", audioSource: fakeMediaStream() });

    expect(recognition.continuous).toBe(true);
    expect(recognition.interimResults).toBe(true);
    expect(recognition.lang).toBe("ko-KR");
    expect(recognition.maxAlternatives).toBe(1);
    expect(recognition.startCount).toBe(1);
  });

  it("registry에서 Web Speech 엔진을 생성한다", async () => {
    const { createLiveSttPort } = await import("./liveSttEngineRegistry");

    expect(createLiveSttPort("web-speech")).toBeInstanceOf(WebSpeechLiveSttPort);
  });
});

class FakeSpeechRecognition {
  continuous = false;
  interimResults = false;
  lang = "";
  maxAlternatives = 0;
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
