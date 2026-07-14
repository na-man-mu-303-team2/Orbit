import { describe, expect, it } from "vitest";

import { defaultPauseDetectorConfig } from "../advance/autoAdvanceConfig";
import { createPauseDetector } from "./pauseDetector";

describe("pauseDetector", () => {
  it("starts pause after RMS silence and transcript inactivity", () => {
    const detector = createPauseDetector({
      config: defaultPauseDetectorConfig,
      pauseMs: 600
    });

    expect(detector.accept({ type: "audio-level", atMs: 0, rmsDb: -60 })).toEqual(
      []
    );
    expect(detector.accept({ type: "tick", atMs: 599 })).toEqual([]);
    expect(detector.accept({ type: "tick", atMs: 600 })).toEqual([
      { type: "pause-started", atMs: 600, silenceDurationMs: 600 }
    ]);
    expect(detector.accept({ type: "tick", atMs: 900 })).toEqual([]);
  });

  it("uses partial transcript activity to reset the pause window", () => {
    const detector = createPauseDetector({
      config: defaultPauseDetectorConfig,
      pauseMs: 600
    });

    detector.accept({ type: "audio-level", atMs: 0, rmsDb: -60 });
    detector.accept({ type: "transcript-activity", atMs: 650, isFinal: false });

    expect(detector.snapshot(1000)).toMatchObject({
      isPaused: false,
      silenceDurationMs: 350
    });
    expect(detector.accept({ type: "tick", atMs: 1249 })).toEqual([]);
    expect(detector.accept({ type: "tick", atMs: 1250 })).toEqual([
      { type: "pause-started", atMs: 1250, silenceDurationMs: 600 }
    ]);
  });

  it("emits speech resume once when audio or transcript activity resumes", () => {
    const detector = createPauseDetector({
      config: defaultPauseDetectorConfig,
      pauseMs: 600
    });

    detector.accept({ type: "audio-level", atMs: 0, rmsDb: -60 });
    detector.accept({ type: "tick", atMs: 600 });

    expect(detector.accept({ type: "transcript-activity", atMs: 900, isFinal: true }))
      .toEqual([{ type: "speech-resumed", atMs: 900 }]);
    expect(detector.accept({ type: "transcript-activity", atMs: 920, isFinal: false }))
      .toEqual([]);

    detector.accept({ type: "tick", atMs: 1520 });
    expect(detector.accept({ type: "audio-level", atMs: 1600, rmsDb: -20 }))
      .toEqual([{ type: "speech-resumed", atMs: 1600 }]);
  });

  it("resets pause and silence state", () => {
    const detector = createPauseDetector({
      config: defaultPauseDetectorConfig,
      pauseMs: 600
    });

    detector.accept({ type: "audio-level", atMs: 0, rmsDb: -60 });
    detector.accept({ type: "tick", atMs: 600 });
    detector.accept({ type: "reset", atMs: 800 });

    expect(detector.snapshot(900)).toEqual({
      isPaused: false,
      isSilent: false,
      lastTranscriptActivityAtMs: null,
      silenceDurationMs: 0,
      silenceStartedAtMs: null
    });
  });
});
