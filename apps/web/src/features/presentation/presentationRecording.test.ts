import { describe, expect, it } from "vitest";

import {
  createPresentationRecordingSession,
  normalizePresentationRecordingMimeType,
  selectPresentationRecordingMimeType,
} from "./presentationRecording";

describe("presentationRecording", () => {
  it("records the live presentation into an uploadable audio file", async () => {
    const session = createPresentationRecordingSession(
      { getTracks: () => [] } as unknown as MediaStream,
      FakePresentationMediaRecorder as unknown as typeof MediaRecorder,
    );

    const file = await session.stop();

    expect(file.name).toMatch(/^presentation-\d+\.webm$/);
    expect(file.type).toBe("audio/webm");
    await expect(file.text()).resolves.toBe("presentation audio");
  });

  it("pauses and resumes the recorder with the presentation timer", async () => {
    const session = createPresentationRecordingSession(
      { getTracks: () => [] } as unknown as MediaStream,
      FakePresentationMediaRecorder as unknown as typeof MediaRecorder,
    );

    session.pause();
    expect(FakePresentationMediaRecorder.latest?.state).toBe("paused");

    session.resume();
    expect(FakePresentationMediaRecorder.latest?.state).toBe("recording");

    await session.stop();
  });

  it("fails clearly when the browser cannot record audio", () => {
    expect(() =>
      createPresentationRecordingSession(
        { getTracks: () => [] } as unknown as MediaStream,
        undefined,
      ),
    ).toThrow("이 브라우저에서는 발표 녹음을 지원하지 않습니다.");
  });

  it("uses the first supported presentation audio format", () => {
    expect(
      selectPresentationRecordingMimeType({
        isTypeSupported: (type: string) => type === "audio/mp4",
      } as unknown as typeof MediaRecorder),
    ).toBe("audio/mp4");
  });

  it("normalizes recorder codec MIME types for the upload contract", () => {
    expect(
      normalizePresentationRecordingMimeType("audio/webm;codecs=opus"),
    ).toBe("audio/webm");
  });
});

class FakePresentationMediaRecorder {
  static latest: FakePresentationMediaRecorder | null = null;

  static isTypeSupported(type: string) {
    return type === "audio/webm;codecs=opus";
  }

  readonly mimeType: string;
  state: RecordingState = "inactive";
  private readonly listeners = new Map<string, Array<(event: Event) => void>>();

  constructor(
    readonly stream: MediaStream,
    options?: MediaRecorderOptions,
  ) {
    this.mimeType = options?.mimeType ?? "";
    FakePresentationMediaRecorder.latest = this;
  }

  addEventListener(type: string, listener: EventListenerOrEventListenerObject) {
    const callback =
      typeof listener === "function"
        ? listener
        : listener.handleEvent.bind(listener);
    this.listeners.set(type, [...(this.listeners.get(type) ?? []), callback]);
  }

  start() {
    this.state = "recording";
  }

  pause() {
    this.state = "paused";
  }

  resume() {
    this.state = "recording";
  }

  stop() {
    this.state = "inactive";
    this.emit("dataavailable", {
      data: new Blob(["presentation audio"], { type: this.mimeType }),
    } as BlobEvent);
    this.emit("stop", new Event("stop"));
  }

  private emit(type: string, event: Event) {
    this.listeners.get(type)?.forEach((listener) => listener(event));
  }
}
