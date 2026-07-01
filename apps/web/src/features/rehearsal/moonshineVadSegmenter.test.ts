import { describe, expect, it } from "vitest";
import { MoonshineRmsVadSegmenter } from "./moonshineVadSegmenter";

describe("MoonshineRmsVadSegmenter", () => {
  it("emits one segment after speech is followed by trailing silence", () => {
    const segmenter = new MoonshineRmsVadSegmenter({
      sampleRate: 1000,
      silenceThresholdDb: -40,
      preRollMs: 10,
      trailingSilenceMs: 20,
      minSegmentMs: 20,
      maxSegmentMs: 1000
    });

    expect(segmenter.push(new Float32Array(10))).toEqual([]);
    const speechSegments = segmenter.push(new Float32Array(30).fill(0.2));
    const finalSegments = segmenter.push(new Float32Array(20));

    expect(speechSegments).toEqual([]);
    expect(finalSegments).toHaveLength(1);
    expect(finalSegments[0]?.sampleRate).toBe(1000);
    expect(finalSegments[0]?.samples.length).toBeGreaterThanOrEqual(40);
  });

  it("drops short noise bursts below the minimum segment length", () => {
    const segmenter = new MoonshineRmsVadSegmenter({
      sampleRate: 1000,
      silenceThresholdDb: -40,
      preRollMs: 0,
      trailingSilenceMs: 10,
      minSegmentMs: 50,
      maxSegmentMs: 1000
    });

    segmenter.push(new Float32Array(20).fill(0.2));
    const segments = segmenter.push(new Float32Array(10));

    expect(segments).toEqual([]);
  });

  it("flushes an active speech segment when stopped", () => {
    const segmenter = new MoonshineRmsVadSegmenter({
      sampleRate: 1000,
      silenceThresholdDb: -40,
      preRollMs: 0,
      trailingSilenceMs: 20,
      minSegmentMs: 20,
      maxSegmentMs: 1000
    });

    segmenter.push(new Float32Array(30).fill(0.2));
    const segments = segmenter.flush();

    expect(segments).toHaveLength(1);
    expect(segments[0]?.samples.length).toBe(30);
  });

  it("emits long speech when the maximum segment length is reached", () => {
    const segmenter = new MoonshineRmsVadSegmenter({
      sampleRate: 1000,
      silenceThresholdDb: -40,
      preRollMs: 0,
      trailingSilenceMs: 20,
      minSegmentMs: 20,
      maxSegmentMs: 50
    });

    const segments = segmenter.push(new Float32Array(60).fill(0.2));

    expect(segments).toHaveLength(1);
    expect(segments[0]?.samples.length).toBe(60);
  });
});
