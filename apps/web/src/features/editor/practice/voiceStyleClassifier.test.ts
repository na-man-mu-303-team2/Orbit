import { describe, expect, it } from "vitest";

import { classifyVoiceStyle } from "./voiceStyleClassifier";

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
  it("classifies fast speech with little pause as turbo", () => {
    expect(classifyVoiceStyle({
      ...baseMetrics,
      pauseRatio: 0.05,
      syllablesPerSecond: 6.1,
    }, null).mode).toBe("turbo");
  });

  it("uses neutral when no strong style evidence exists", () => {
    expect(classifyVoiceStyle(baseMetrics, null).mode).toBe("neutral");
  });
});
