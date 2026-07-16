import type { SlidePracticeVoiceMetrics } from "@orbit/shared";

const analysisIntervalMs = 60;
const activeSpeechThresholdDb = -48;

export class BrowserPcmVoiceAnalyzer {
  private context: AudioContext | null = null;
  private source: MediaStreamAudioSourceNode | null = null;
  private analyser: AnalyserNode | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;
  private readonly loudnessSamples: number[] = [];
  private readonly pitchSamples: number[] = [];
  private totalFrames = 0;
  private activeFrames = 0;
  private clippedSamples = 0;
  private observedSamples = 0;

  async start(stream: MediaStream) {
    this.context = new AudioContext({ latencyHint: "interactive" });
    await this.context.resume();
    this.source = this.context.createMediaStreamSource(stream);
    this.analyser = this.context.createAnalyser();
    this.analyser.fftSize = 2048;
    this.analyser.smoothingTimeConstant = 0.2;
    this.source.connect(this.analyser);
    this.timer = setInterval(() => this.sample(), analysisIntervalMs);
  }

  async stop(syllableCount: number): Promise<SlidePracticeVoiceMetrics> {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    this.sample();
    await this.release();

    const activeSpeechMs = this.activeFrames * analysisIntervalMs;
    const loudnessDb = median(this.loudnessSamples);
    const loudnessMadDb = loudnessDb === null
      ? null
      : median(this.loudnessSamples.map((sample) => Math.abs(sample - loudnessDb)));
    const pitchMedianHz = median(this.pitchSamples);
    const pitchSpanHz = this.pitchSamples.length >= 4
      ? percentile(this.pitchSamples, 0.9) - percentile(this.pitchSamples, 0.1)
      : null;
    const pitchValidRatio = this.activeFrames > 0
      ? Math.min(1, this.pitchSamples.length / this.activeFrames)
      : 0;
    const pauseRatio = this.totalFrames > 0
      ? Math.max(0, Math.min(1, 1 - this.activeFrames / this.totalFrames))
      : 1;
    const syllablesPerSecond = activeSpeechMs >= 1_000
      ? syllableCount / (activeSpeechMs / 1_000)
      : null;
    const signalToNoiseDb = loudnessDb === null ? null : Math.max(0, loudnessDb - -60);
    const clippingRatio = this.observedSamples > 0 ? this.clippedSamples / this.observedSamples : 0;
    const rhythmRegularity = loudnessMadDb === null ? null : Math.max(0, Math.min(1, 1 - loudnessMadDb / 16));

    return {
      activeSpeechMs,
      pauseRatio,
      pitchMedianHz,
      pitchSpanHz,
      pitchValidRatio,
      loudnessDb,
      loudnessMadDb,
      syllablesPerSecond,
      signalToNoiseDb,
      breathinessRatio: pitchValidRatio > 0 ? Math.max(0, Math.min(1, 1 - pitchValidRatio)) : null,
      clarityRatio: signalToNoiseDb === null ? null : Math.max(0, Math.min(1, signalToNoiseDb / 30)),
      rhythmRegularity,
      clippingRatio,
    };
  }

  async cancel() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    await this.release();
  }

  private sample() {
    if (!this.analyser || !this.context) return;
    const buffer = new Float32Array(this.analyser.fftSize);
    this.analyser.getFloatTimeDomainData(buffer);
    let energy = 0;
    for (const value of buffer) {
      energy += value * value;
      if (Math.abs(value) >= 0.98) this.clippedSamples += 1;
    }
    this.observedSamples += buffer.length;
    const rms = Math.sqrt(energy / buffer.length);
    const loudnessDb = 20 * Math.log10(Math.max(rms, 1e-6));
    this.totalFrames += 1;
    if (loudnessDb < activeSpeechThresholdDb) return;
    this.activeFrames += 1;
    this.loudnessSamples.push(loudnessDb);
    const pitch = estimatePitch(buffer, this.context.sampleRate);
    if (pitch !== null) this.pitchSamples.push(pitch);
  }

  private async release() {
    this.source?.disconnect();
    this.analyser?.disconnect();
    if (this.context && this.context.state !== "closed") {
      await this.context.close().catch(() => undefined);
    }
    this.source = null;
    this.analyser = null;
    this.context = null;
  }
}

function estimatePitch(buffer: Float32Array, sampleRate: number): number | null {
  const minLag = Math.floor(sampleRate / 420);
  const maxLag = Math.min(Math.floor(sampleRate / 70), buffer.length - 1);
  let bestLag = 0;
  let bestCorrelation = 0;
  for (let lag = minLag; lag <= maxLag; lag += 2) {
    let correlation = 0;
    let leftEnergy = 0;
    let rightEnergy = 0;
    for (let index = 0; index < buffer.length - lag; index += 4) {
      const left = buffer[index] ?? 0;
      const right = buffer[index + lag] ?? 0;
      correlation += left * right;
      leftEnergy += left * left;
      rightEnergy += right * right;
    }
    const normalized = correlation / Math.sqrt(Math.max(leftEnergy * rightEnergy, 1e-9));
    if (normalized > bestCorrelation) {
      bestCorrelation = normalized;
      bestLag = lag;
    }
  }
  return bestCorrelation >= 0.55 && bestLag > 0 ? sampleRate / bestLag : null;
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  return percentile(values, 0.5);
}

function percentile(values: number[], ratio: number): number {
  const sorted = [...values].sort((left, right) => left - right);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.round((sorted.length - 1) * ratio)));
  return sorted[index] ?? 0;
}
