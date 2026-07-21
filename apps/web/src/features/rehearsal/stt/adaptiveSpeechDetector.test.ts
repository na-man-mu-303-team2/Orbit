import { describe, expect, it } from "vitest";
import {
  advanceSpeechDetector,
  calculateNoiseFloorDb,
  initialSpeechDetectorState,
  resolveAdaptiveSpeechThresholdDb
} from "./adaptiveSpeechDetector";

describe("adaptiveSpeechDetector", () => {
  it("noise floor 중앙값과 bounded margin을 사용한다", () => {
    expect(calculateNoiseFloorDb([-49, -45, -47, -46, -100, Number.NaN]))
      .toBe(-47);
    expect(resolveAdaptiveSpeechThresholdDb(-47, 10)).toBe(-37);
    expect(resolveAdaptiveSpeechThresholdDb(-80, 8)).toBe(-60);
    expect(resolveAdaptiveSpeechThresholdDb(-22, 12)).toBe(-20);
  });

  it("attack 구간을 안정적으로 넘긴 뒤 최초 crossing 시각으로 발화를 시작한다", () => {
    const candidate = advanceSpeechDetector(initialSpeechDetectorState, {
      nowMs: 100,
      rmsDb: -30,
      thresholdDb: -40,
      attackMs: 200,
      releaseMs: 650
    });
    const transient = advanceSpeechDetector(candidate.state, {
      nowMs: 180,
      rmsDb: -50,
      thresholdDb: -40,
      attackMs: 200,
      releaseMs: 650
    });
    const stable = advanceSpeechDetector(candidate.state, {
      nowMs: 310,
      rmsDb: -29,
      thresholdDb: -40,
      attackMs: 200,
      releaseMs: 650
    });

    expect(candidate.speechStartedAtMs).toBeNull();
    expect(transient.state).toEqual(initialSpeechDetectorState);
    expect(stable.speechStartedAtMs).toBe(100);
    expect(stable.state.isSpeaking).toBe(true);
  });

  it("release 구간 뒤에만 발화를 종료한다", () => {
    const speaking = {
      candidateStartedAtMs: null,
      isSpeaking: true,
      lastVoiceAtMs: 1000
    };
    const holding = advanceSpeechDetector(speaking, {
      nowMs: 1500,
      rmsDb: -60,
      thresholdDb: -40,
      attackMs: 200,
      releaseMs: 650
    });
    const ended = advanceSpeechDetector(holding.state, {
      nowMs: 1700,
      rmsDb: -60,
      thresholdDb: -40,
      attackMs: 200,
      releaseMs: 650
    });

    expect(holding.speechEndedAtMs).toBeNull();
    expect(ended.speechEndedAtMs).toBe(1700);
    expect(ended.state).toEqual(initialSpeechDetectorState);
  });
});
