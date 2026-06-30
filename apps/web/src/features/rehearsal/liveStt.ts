import type { LiveSttPartialTranscriptEvent } from "@orbit/shared";

export type LiveSttAudioLevelEvent = {
  type: "audio-level";
  rms: number;
  peak: number;
  rmsDb: number;
  peakDb: number;
  isLikelySilence: boolean;
};

export type LiveSttCallbacks = {
  onPartialTranscript: (event: LiveSttPartialTranscriptEvent) => void;
  onError: (error: LiveSttAdapterError) => void;
  onAudioLevel?: (event: LiveSttAudioLevelEvent) => void;
};

export type LiveSttAdapter = {
  start: (stream: MediaStream, callbacks: LiveSttCallbacks) => Promise<void>;
  stop: () => void;
  dispose: () => void;
};

export type LiveSttAdapterErrorCode =
  | "LIVE_STT_MODEL_UNAVAILABLE"
  | "LIVE_STT_START_FAILED";

export class LiveSttAdapterError extends Error {
  constructor(
    readonly code: LiveSttAdapterErrorCode,
    message: string
  ) {
    super(message);
    this.name = "LiveSttAdapterError";
  }
}

declare global {
  interface Window {
    __orbitCreateLiveSttAdapter?: () => LiveSttAdapter;
  }
}
