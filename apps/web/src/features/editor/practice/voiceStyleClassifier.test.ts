import { describe, expect, it } from "vitest";

import {
  classifyVoiceStyle,
  createUnmeasuredVoiceStyleResult,
} from "./voiceStyleClassifier";

const baseMetrics = {
  activeSpeechMs: 20_000,
  pauseRatio: 0.2,
  pitchMedianHz: 180,
  pitchSpanHz: 70,
  pitchValidRatio: 0.8,
  loudnessDb: -28,
  loudnessMadDb: 3,
  syllablesPerSecond: 3.8,
  signalToNoiseDb: 25,
  breathinessRatio: 0.2,
  clarityRatio: 0.8,
  rhythmRegularity: 0.7,
  clippingRatio: 0,
};

describe("classifyVoiceStyle", () => {
  it("음량과 관계없이 낮은 pitch 폭과 느린 속도로 자장가형을 판정한다", () => {
    const result = classifyVoiceStyle({
      ...baseMetrics,
      loudnessDb: -20,
      pitchSpanHz: 40,
      syllablesPerSecond: 3.4,
    }, null);

    expect(result.mode).toBe("lullaby");
    expect(result.evidenceLabels).toEqual(["억양 변화가 적어요", "말하는 구간의 속도가 느려요"]);
    expect(result.message).toBe("오늘 목소리는 잠수 모드예요. 수면 위로 한 걸음");
  });

  it("낮은 pitch 폭만 있고 속도가 느리지 않으면 판단을 보류한다", () => {
    const result = classifyVoiceStyle({
      ...baseMetrics,
      loudnessDb: -40,
      pitchSpanHz: 40,
      syllablesPerSecond: 3.8,
    }, null);

    expect(result.mode).toBe("neutral");
    expect(result.message).toContain("판단을 보류");
  });

  it("속도가 느려도 pitch 폭이 낮지 않으면 판단을 보류한다", () => {
    expect(classifyVoiceStyle({
      ...baseMetrics,
      pitchSpanHz: 70,
      syllablesPerSecond: 3.4,
    }, null).mode).toBe("neutral");
  });

  it("전체 구간 쉼 비율의 의미에 맞춘 기준으로 터보형을 판정한다", () => {
    const result = classifyVoiceStyle({
      ...baseMetrics,
      loudnessDb: -34,
      pauseRatio: 0.65,
      syllablesPerSecond: 5,
    }, null);

    expect(result.mode).toBe("turbo");
    expect(result.message).toBe("오늘 목소리에 기분 좋은 가속이 붙었어요");
    expect(result.evidenceLabels).not.toContain("쉼이 짧아요");
    expect(result.evidenceLabels).toContain("전체 연습의 쉼 비율이 70% 미만이에요");
  });

  it("과거 아나운서형 조합도 신규 판정에서는 터보형을 우선 적용한다", () => {
    expect(classifyVoiceStyle({
      ...baseMetrics,
      loudnessDb: -30,
      pauseRatio: 0.65,
      pitchSpanHz: 95,
      syllablesPerSecond: 5,
    }, null).mode).toBe("turbo");
  });

  it("과거 구름형 조합은 신규 판정에서 판단을 보류한다", () => {
    const result = classifyVoiceStyle({
      ...baseMetrics,
      loudnessDb: -34,
      pitchSpanHz: 40,
      rhythmRegularity: 0.8,
    }, null);

    expect(result.mode).toBe("neutral");
    expect(result.confidence).toBe(0);
  });

  it("사용자 baseline보다 충분히 느린 발화를 자장가형 근거로 사용한다", () => {
    expect(classifyVoiceStyle({
      ...baseMetrics,
      loudnessDb: -40,
      pitchSpanHz: 40,
      syllablesPerSecond: 3.8,
    }, {
      pitchMedianHz: 180,
      pitchSpanHz: 70,
      loudnessDb: -28,
      loudnessMadDb: 3,
      syllablesPerSecond: 4.7,
      rhythmRegularity: 0.7,
    }).mode).toBe("lullaby");
  });

  it("사용자 baseline보다 정확히 0.8 음절/초 느린 경계를 자장가형 근거로 포함한다", () => {
    expect(classifyVoiceStyle({
      ...baseMetrics,
      loudnessDb: -40,
      pitchSpanHz: 40,
      syllablesPerSecond: 3.8,
    }, {
      pitchMedianHz: 180,
      pitchSpanHz: 70,
      loudnessDb: -28,
      loudnessMadDb: 3,
      syllablesPerSecond: 4.6,
      rhythmRegularity: 0.7,
    }).mode).toBe("lullaby");
  });

  it("최근 저장 지표처럼 음량 기준을 넘지 못해도 낮은 pitch 폭과 느린 속도로 자장가형을 판정한다", () => {
    expect(classifyVoiceStyle({
      ...baseMetrics,
      loudnessDb: -35.476,
      pitchSpanHz: 29.5153,
      syllablesPerSecond: 3.2362,
    }, null).mode).toBe("lullaby");
  });

  it("사용자 baseline보다 빨라진 발화를 터보형 근거로 사용한다", () => {
    expect(classifyVoiceStyle({
      ...baseMetrics,
      loudnessDb: -34,
      pauseRatio: 0.65,
      syllablesPerSecond: 4.2,
    }, {
      pitchMedianHz: 180,
      pitchSpanHz: 70,
      loudnessDb: -28,
      loudnessMadDb: 3,
      syllablesPerSecond: 3.3,
      rhythmRegularity: 0.7,
    }).mode).toBe("turbo");
  });

  it("자장가형과 터보형 근거가 없으면 유형 판단을 보류한다", () => {
    const result = classifyVoiceStyle(baseMetrics, null);

    expect(result.mode).toBe("neutral");
    expect(result.confidence).toBe(0);
    expect(result.evidenceLabels).toContain("자장가형·터보형 조건이 뚜렷하지 않아요");
  });

  it("측정 분량이 부족하면 유형 판단을 보류한다", () => {
    expect(createUnmeasuredVoiceStyleResult()).toEqual({
      mode: "neutral",
      confidence: 0,
      evidenceLabels: ["연습 분량이 부족해요"],
      message: "연습 분량이 부족해 목소리 유형을 판단하지 않았습니다.",
    });
  });
});
