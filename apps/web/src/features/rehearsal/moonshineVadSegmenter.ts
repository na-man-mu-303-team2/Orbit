import { calculatePcmAudioLevel } from "./liveSttAudioLevel";

export type MoonshineVadSegment = {
  sampleRate: number;
  samples: Float32Array;
};

export type MoonshineRmsVadOptions = {
  sampleRate: number;
  silenceThresholdDb?: number;
  preRollMs?: number;
  trailingSilenceMs?: number;
  minSegmentMs?: number;
  maxSegmentMs?: number;
};

const defaultSilenceThresholdDb = -55;
const defaultPreRollMs = 160;
const defaultTrailingSilenceMs = 360;
const defaultMinSegmentMs = 240;
const defaultMaxSegmentMs = 8_000;

export class MoonshineRmsVadSegmenter {
  private readonly sampleRate: number;
  private readonly silenceThresholdDb: number;
  private readonly preRollSamples: number;
  private readonly trailingSilenceSamples: number;
  private readonly minSegmentSamples: number;
  private readonly maxSegmentSamples: number;
  private preRollFrames: Float32Array[] = [];
  private preRollSampleCount = 0;
  private segmentFrames: Float32Array[] = [];
  private segmentSampleCount = 0;
  private trailingSilenceSampleCount = 0;
  private isActive = false;

  constructor(options: MoonshineRmsVadOptions) {
    this.sampleRate = normalizeSampleRate(options.sampleRate);
    this.silenceThresholdDb =
      options.silenceThresholdDb ?? defaultSilenceThresholdDb;
    this.preRollSamples = durationMsToSamples(
      options.preRollMs ?? defaultPreRollMs,
      this.sampleRate
    );
    this.trailingSilenceSamples = durationMsToSamples(
      options.trailingSilenceMs ?? defaultTrailingSilenceMs,
      this.sampleRate
    );
    this.minSegmentSamples = durationMsToSamples(
      options.minSegmentMs ?? defaultMinSegmentMs,
      this.sampleRate
    );
    this.maxSegmentSamples = durationMsToSamples(
      options.maxSegmentMs ?? defaultMaxSegmentMs,
      this.sampleRate
    );
  }

  push(samples: Float32Array): MoonshineVadSegment[] {
    if (samples.length === 0) {
      return [];
    }

    const isSilence =
      calculatePcmAudioLevel(samples, {
        silenceThresholdDb: this.silenceThresholdDb
      }).isLikelySilence;

    if (!this.isActive) {
      if (isSilence) {
        this.appendPreRoll(samples);
        return [];
      }

      this.isActive = true;
      this.segmentFrames = [...this.preRollFrames];
      this.segmentSampleCount = this.preRollSampleCount;
      this.preRollFrames = [];
      this.preRollSampleCount = 0;
    }

    this.appendSegmentFrame(samples);
    this.trailingSilenceSampleCount = isSilence
      ? this.trailingSilenceSampleCount + samples.length
      : 0;

    if (
      this.segmentSampleCount >= this.maxSegmentSamples ||
      this.trailingSilenceSampleCount >= this.trailingSilenceSamples
    ) {
      return this.finalizeSegment();
    }

    return [];
  }

  flush(): MoonshineVadSegment[] {
    if (!this.isActive) {
      this.reset();
      return [];
    }

    return this.finalizeSegment();
  }

  reset() {
    this.preRollFrames = [];
    this.preRollSampleCount = 0;
    this.segmentFrames = [];
    this.segmentSampleCount = 0;
    this.trailingSilenceSampleCount = 0;
    this.isActive = false;
  }

  private appendPreRoll(samples: Float32Array) {
    if (this.preRollSamples <= 0) {
      return;
    }

    this.preRollFrames.push(new Float32Array(samples));
    this.preRollSampleCount += samples.length;

    while (
      this.preRollFrames.length > 0 &&
      this.preRollSampleCount - this.preRollFrames[0]!.length >=
        this.preRollSamples
    ) {
      this.preRollSampleCount -= this.preRollFrames.shift()!.length;
    }
  }

  private appendSegmentFrame(samples: Float32Array) {
    this.segmentFrames.push(new Float32Array(samples));
    this.segmentSampleCount += samples.length;
  }

  private finalizeSegment(): MoonshineVadSegment[] {
    const sampleCount = this.segmentSampleCount;
    const frames = this.segmentFrames;
    this.reset();

    if (sampleCount < this.minSegmentSamples) {
      return [];
    }

    return [
      {
        sampleRate: this.sampleRate,
        samples: concatFloat32Frames(frames, sampleCount)
      }
    ];
  }
}

function concatFloat32Frames(frames: Float32Array[], sampleCount: number) {
  const output = new Float32Array(sampleCount);
  let offset = 0;
  for (const frame of frames) {
    output.set(frame, offset);
    offset += frame.length;
  }

  return output;
}

function normalizeSampleRate(sampleRate: number) {
  return Number.isFinite(sampleRate) && sampleRate > 0
    ? Math.round(sampleRate)
    : 16_000;
}

function durationMsToSamples(durationMs: number, sampleRate: number) {
  if (!Number.isFinite(durationMs) || durationMs <= 0) {
    return 0;
  }

  return Math.max(1, Math.round((sampleRate * durationMs) / 1000));
}
