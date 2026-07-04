import { createInternalCueProvider, type InternalSpeechCueConfig } from "./cueProvider";

export const defaultInternalSpeechCueConfig: InternalSpeechCueConfig[] = [];

export const defaultInternalCueProvider = createInternalCueProvider(
  defaultInternalSpeechCueConfig
);
