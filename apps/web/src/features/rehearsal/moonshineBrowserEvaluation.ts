import {
  env as transformersEnv,
  pipeline as transformersPipeline
} from "@huggingface/transformers";
import { detectRehearsalCommandCandidate } from "./rehearsalCommands";

type BrowserEvaluationDevice = "webgpu" | "wasm";
type BrowserEvaluationDType = {
  encoder_model: "fp32" | "fp16" | "q8" | "q4";
  decoder_model_merged: "fp32" | "fp16" | "q8" | "q4";
};
type BrowserEvaluationFixture = {
  id: string;
  referenceTranscript: string;
  expectedKeywords: string[];
  shouldTriggerControl: boolean;
};
type BrowserEvaluationOptions = {
  modelId: string;
  device: BrowserEvaluationDevice;
  dtype: BrowserEvaluationDType;
  fixtures: BrowserEvaluationFixture[];
  audioById: Record<string, string>;
  localModelPath?: string;
  allowRemoteModels?: boolean;
};
type TranscribeResult = { text?: unknown };
type MoonshineTranscriber = {
  (
    samples: Float32Array,
    options: { sampling_rate: number; max_length: number }
  ): Promise<TranscribeResult>;
  processor?: {
    components?: Record<string, unknown>;
  };
  tokenizer?: unknown;
};
type MoonshinePipelineFactory = (
  task: "automatic-speech-recognition",
  modelId: string,
  options: {
    device: BrowserEvaluationDevice;
    dtype: BrowserEvaluationDType;
  }
) => Promise<MoonshineTranscriber>;

export async function runMoonshineBrowserEvaluation(
  options: BrowserEvaluationOptions
) {
  applyModelOptions(options);
  const pipelineFactory = transformersPipeline as MoonshinePipelineFactory;
  const modelLoadStartedAt = performance.now();
  const transcriber = await pipelineFactory(
    "automatic-speech-recognition",
    options.modelId,
    {
      device: options.device,
      dtype: options.dtype
    }
  );
  patchMoonshineProcessorTokenizer(transcriber);
  const modelLoadMs = performance.now() - modelLoadStartedAt;

  const audioContext = new AudioContext({ sampleRate: 16_000 });
  try {
    const predictions = [];
    for (const fixture of options.fixtures) {
      const wavBase64 = options.audioById[fixture.id];
      if (!wavBase64) {
        throw new Error(`Missing wav audio for fixture ${fixture.id}.`);
      }

      const audio = await decodeAudioBase64(audioContext, wavBase64);
      const transcriptStartedAt = performance.now();
      const result = await transcriber(audio.samples, {
        sampling_rate: audio.sampleRate,
        max_length: calculateMaxLength(audio.samples.length, audio.sampleRate)
      });
      const transcribeMs = performance.now() - transcriptStartedAt;

      const transcript = extractTranscriptText(result);
      predictions.push({
        id: fixture.id,
        transcript,
        triggeredControl: Boolean(
          detectRehearsalCommandCandidate({
            transcript,
            isFinal: true,
            confidence: null
          })
        ),
        transcriptAtMs: Math.round(transcribeMs),
        transcribeMs: Math.round(transcribeMs),
        audioDurationMs: Math.round(audio.durationMs),
        sampleRate: audio.sampleRate
      });
    }

    return {
      device: options.device,
      modelLoadMs: Math.round(modelLoadMs),
      predictions
    };
  } finally {
    await audioContext.close();
  }
}

function patchMoonshineProcessorTokenizer(transcriber: MoonshineTranscriber) {
  if (
    transcriber.tokenizer &&
    transcriber.processor?.components &&
    !transcriber.processor.components.tokenizer
  ) {
    transcriber.processor.components.tokenizer = transcriber.tokenizer;
  }
}

function applyModelOptions(options: BrowserEvaluationOptions) {
  if (options.localModelPath) {
    transformersEnv.localModelPath = options.localModelPath;
    transformersEnv.allowLocalModels = true;
  }

  if (options.allowRemoteModels !== undefined) {
    transformersEnv.allowRemoteModels = options.allowRemoteModels;
  }
}

async function decodeAudioBase64(
  audioContext: AudioContext,
  wavBase64: string
) {
  const audioBuffer = await audioContext.decodeAudioData(
    base64ToArrayBuffer(wavBase64)
  );
  const samples = mixToMono(audioBuffer);
  return {
    samples,
    sampleRate: audioBuffer.sampleRate,
    durationMs: (samples.length / audioBuffer.sampleRate) * 1000
  };
}

function base64ToArrayBuffer(base64: string) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }

  return bytes.buffer;
}

function mixToMono(audioBuffer: AudioBuffer) {
  if (audioBuffer.numberOfChannels === 1) {
    return new Float32Array(audioBuffer.getChannelData(0));
  }

  const samples = new Float32Array(audioBuffer.length);
  for (let channelIndex = 0; channelIndex < audioBuffer.numberOfChannels; channelIndex += 1) {
    const channel = audioBuffer.getChannelData(channelIndex);
    for (let sampleIndex = 0; sampleIndex < samples.length; sampleIndex += 1) {
      samples[sampleIndex] += channel[sampleIndex] ?? 0;
    }
  }

  for (let sampleIndex = 0; sampleIndex < samples.length; sampleIndex += 1) {
    samples[sampleIndex] /= audioBuffer.numberOfChannels;
  }

  return samples;
}

function calculateMaxLength(sampleCount: number, sampleRate: number) {
  return Math.max(1, Math.ceil((sampleCount * 13) / sampleRate));
}

function extractTranscriptText(result: TranscribeResult) {
  return typeof result.text === "string" ? result.text.trim() : "";
}
