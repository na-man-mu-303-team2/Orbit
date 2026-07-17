import { Deck, RehearsalMetrics } from "@orbit/shared";

export * from "./image-providers";

export interface LlmMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface LlmProvider {
  generateText(messages: LlmMessage[]): Promise<string>;
}

export interface EmbeddingProvider {
  embed(texts: string[]): Promise<number[][]>;
}

export interface ReportSttProvider {
  transcribe(input: {
    fileId: string;
    consentToServerStt: boolean;
  }): Promise<{ text: string; durationSeconds: number }>;
}

export interface OcrProvider {
  extractText(input: { fileId: string; mimeType: string }): Promise<string>;
}

export interface DeckGenerationProvider {
  generateDeck(input: {
    projectId: string;
    referenceText: string;
    title: string;
  }): Promise<Deck>;
}

export type ImageAssetCandidate = {
  body: Uint8Array;
  mimeType: "image/png" | "image/jpeg" | "image/webp";
  fileName: string;
  provider: string;
  sourceUrl?: string;
  sourceAssetUrl?: string;
  sourceAuthority?: "official" | "independent" | "unknown";
  usageBasis?: "user-provided" | "licensed" | "official-reference" | "generated";
  author?: string;
  license?: string;
  checkedAt?: string;
  generationPrompt?: string;
};

export type GeneratedImageReferenceImage = {
  body: Uint8Array;
  mimeType: "image/png" | "image/jpeg" | "image/webp";
  fileName: string;
  inputFidelity?: "high" | "low";
};

export interface GeneratedImageProvider {
  generate(input: {
    prompt: string;
    aspectRatio?: "landscape" | "portrait" | "square";
    referenceImages?: readonly GeneratedImageReferenceImage[];
    abortSignal?: AbortSignal;
  }): Promise<ImageAssetCandidate>;
}

export interface PublicImageSearchProvider {
  search(input: {
    query: string;
    excludeSourceAssetUrls?: readonly string[];
    abortSignal?: AbortSignal;
  }): Promise<ImageAssetCandidate>;
}

export interface OfficialImageProvider {
  fetch(input: {
    sourceUrls: string[];
    query: string;
    abortSignal?: AbortSignal;
  }): Promise<ImageAssetCandidate>;
}

export interface RehearsalAnalyzer {
  analyzeTranscript(input: {
    deck: Deck;
    transcript: string;
    durationSeconds: number;
  }): Promise<RehearsalMetrics>;
}
