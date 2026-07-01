import { afterEach, describe, expect, it, vi } from "vitest";
import { WebSpeechLiveSttAdapter } from "./webSpeechLiveSttAdapter";
import type { LiveSttBiasContext } from "./liveStt";

describe("WebSpeechLiveSttAdapter", () => {
  afterEach(() => {
    FakeSpeechRecognition.reset();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("checks on-device availability, starts with the live audio track, and forwards transcripts", async () => {
    const partials: string[] = [];
    const finals: string[] = [];
    const errors: string[] = [];
    const adapter = createAdapter();

    await adapter.start(mediaStreamFixture(), {
      onPartialTranscript: (event) => {
        if (event.isFinal) {
          finals.push(event.transcript);
        } else {
          partials.push(event.transcript);
        }
      },
      onError: (error) => errors.push(error.code)
    });

    const recognition = FakeSpeechRecognition.lastInstance();
    recognition.emitResult([
      { transcript: "오르빗 리허설", isFinal: false, confidence: 0.72 },
      { transcript: "다음 슬라이드", isFinal: true, confidence: 0.9 }
    ]);

    expect(FakeSpeechRecognition.availableCalls).toEqual([
      {
        langs: ["ko-KR"],
        processLocally: true,
        quality: "command"
      }
    ]);
    expect(recognition.lang).toBe("ko-KR");
    expect(recognition.continuous).toBe(true);
    expect(recognition.interimResults).toBe(true);
    expect(recognition.maxAlternatives).toBe(1);
    expect(recognition.processLocally).toBe(true);
    expect(recognition.startedTrack).toBe(liveAudioTrack);
    expect(partials).toEqual(["오르빗 리허설"]);
    expect(finals).toEqual(["다음 슬라이드"]);
    expect(errors).toEqual([]);
  });

  it("installs the Korean on-device language pack when it is downloadable", async () => {
    FakeSpeechRecognition.availabilityStatuses = ["downloadable", "available"];
    FakeSpeechRecognition.installResult = true;

    await createAdapter().start(mediaStreamFixture(), {
      onPartialTranscript: () => undefined,
      onError: () => undefined
    });

    expect(FakeSpeechRecognition.installCalls).toEqual([
      {
        langs: ["ko-KR"],
        processLocally: true,
        quality: "command"
      }
    ]);
    expect(FakeSpeechRecognition.availableCalls).toHaveLength(2);
  });

  it("reports model unavailable when Chrome cannot provide the on-device language pack", async () => {
    FakeSpeechRecognition.availabilityStatuses = ["unavailable"];

    await expect(
      createAdapter().start(mediaStreamFixture(), {
        onPartialTranscript: () => undefined,
        onError: () => undefined
      })
    ).rejects.toMatchObject({
      code: "LIVE_STT_MODEL_UNAVAILABLE"
    });

    expect(FakeSpeechRecognition.instances).toHaveLength(0);
  });

  it("applies and updates Web Speech contextual bias phrases when supported", async () => {
    const adapter = createAdapter();
    const biasContext: LiveSttBiasContext = {
      slideId: "slide_1",
      terms: [
        { text: "오르빗", source: "keyword", weight: 1 },
        { text: "오르빗", source: "synonym", weight: 0.8 },
        { text: "다음 슬라이드", source: "control-phrase", weight: 0.9 }
      ]
    };

    await adapter.start(
      mediaStreamFixture(),
      {
        onPartialTranscript: () => undefined,
        onError: () => undefined
      },
      { biasContext }
    );

    const recognition = FakeSpeechRecognition.lastInstance();
    expect(recognition.phrases).toEqual([
      new FakeSpeechRecognitionPhrase("오르빗", 5),
      new FakeSpeechRecognitionPhrase("다음 슬라이드", 4.6)
    ]);

    adapter.updateBiasContext({
      slideId: "slide_2",
      terms: [{ text: "강조", source: "control-phrase", weight: 0.5 }]
    });
    expect(recognition.phrases).toEqual([
      new FakeSpeechRecognitionPhrase("강조", 3)
    ]);

    adapter.updateBiasContext(null);
    expect(recognition.phrases).toEqual([]);
  });

  it("logs transcripts only in browser debug mode and ignores stale results after stop", async () => {
    vi.stubGlobal("window", {
      localStorage: {
        getItem: vi.fn((key: string) =>
          key === "orbit.liveStt.debugLatency" ? "1" : null
        )
      }
    });
    const debugLog = vi.spyOn(console, "debug").mockImplementation(() => undefined);
    const partials: string[] = [];
    const adapter = createAdapter();

    await adapter.start(mediaStreamFixture(), {
      onPartialTranscript: (event) => partials.push(event.transcript),
      onError: () => undefined
    });

    const recognition = FakeSpeechRecognition.lastInstance();
    recognition.emitResult([
      { transcript: "첫 번째 인식", isFinal: false, confidence: 0.5 }
    ]);
    adapter.stop();
    recognition.emitResult([
      { transcript: "stale transcript", isFinal: false, confidence: 0.5 }
    ]);

    expect(partials).toEqual(["첫 번째 인식"]);
    const transcriptLogs = debugLog.mock.calls.filter(([message]) =>
      String(message).startsWith("[orbit-live-stt-transcript]")
    );
    expect(transcriptLogs).toHaveLength(1);
    expect(JSON.stringify(debugLog.mock.calls)).not.toContain("stale transcript");
  });

  it("rejects startup when the selected audio track is not live", async () => {
    await expect(
      createAdapter().start(
        {
          getAudioTracks: () => [{ readyState: "ended" }]
        } as unknown as MediaStream,
        {
          onPartialTranscript: () => undefined,
          onError: () => undefined
        }
      )
    ).rejects.toMatchObject({
      code: "LIVE_STT_START_FAILED"
    });
  });
});

const liveAudioTrack = { readyState: "live" } as MediaStreamTrack;

function createAdapter() {
  return new WebSpeechLiveSttAdapter({
    recognitionCtor: FakeSpeechRecognition,
    phraseCtor: FakeSpeechRecognitionPhrase,
    startTimeoutMs: 100
  });
}

function mediaStreamFixture() {
  return {
    getAudioTracks: () => [liveAudioTrack]
  } as unknown as MediaStream;
}

class FakeSpeechRecognitionPhrase {
  constructor(
    readonly phrase: string,
    readonly boost: number
  ) {}
}

type FakeResult = {
  transcript: string;
  isFinal: boolean;
  confidence: number;
};

class FakeSpeechRecognition {
  static availabilityStatuses: Array<
    "available" | "downloadable" | "downloading" | "unavailable"
  > = ["available"];
  static installResult = true;
  static availableCalls: unknown[] = [];
  static installCalls: unknown[] = [];
  static instances: FakeSpeechRecognition[] = [];

  lang = "";
  continuous = false;
  interimResults = false;
  maxAlternatives = 0;
  processLocally = false;
  phrases: FakeSpeechRecognitionPhrase[] = [];
  startedTrack: MediaStreamTrack | undefined;
  onstart: (() => void) | null = null;
  onresult: ((event: any) => void) | null = null;
  onerror: ((event: { error: string; message?: string }) => void) | null = null;
  onend: (() => void) | null = null;
  isStopped = false;

  constructor() {
    FakeSpeechRecognition.instances.push(this);
  }

  static reset() {
    FakeSpeechRecognition.availabilityStatuses = ["available"];
    FakeSpeechRecognition.installResult = true;
    FakeSpeechRecognition.availableCalls = [];
    FakeSpeechRecognition.installCalls = [];
    FakeSpeechRecognition.instances = [];
  }

  static async available(options: unknown) {
    FakeSpeechRecognition.availableCalls.push(options);
    return FakeSpeechRecognition.availabilityStatuses.shift() ?? "available";
  }

  static async install(options: unknown) {
    FakeSpeechRecognition.installCalls.push(options);
    return FakeSpeechRecognition.installResult;
  }

  static lastInstance() {
    const instance =
      FakeSpeechRecognition.instances[FakeSpeechRecognition.instances.length - 1];
    if (!instance) {
      throw new Error("Expected a FakeSpeechRecognition instance.");
    }

    return instance;
  }

  start(audioTrack?: MediaStreamTrack) {
    this.startedTrack = audioTrack;
    this.onstart?.();
  }

  stop() {
    this.isStopped = true;
    this.onend?.();
  }

  abort() {
    this.isStopped = true;
  }

  emitResult(results: FakeResult[]) {
    const speechResults = results.map((result) => {
      const speechResult = [
        {
          transcript: result.transcript,
          confidence: result.confidence
        }
      ] as Array<{ transcript: string; confidence: number }> & {
        isFinal: boolean;
      };
      speechResult.isFinal = result.isFinal;
      return speechResult;
    });
    this.onresult?.({
      resultIndex: 0,
      results: speechResults
    });
  }
}
