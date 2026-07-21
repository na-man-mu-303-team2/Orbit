import type { OpenAiRealtimeTranscriptionDelay } from "@orbit/shared";

export type RealtimeTranscriptionConfiguration = {
  model: string | null;
  delay: string | null;
};

export function readRealtimeTranscriptionConfiguration(
  event: Record<string, unknown>
): RealtimeTranscriptionConfiguration {
  const session = isRecord(event.session) ? event.session : undefined;
  const audio = session && isRecord(session.audio) ? session.audio : undefined;
  const input = audio && isRecord(audio.input) ? audio.input : undefined;
  const transcription =
    input && isRecord(input.transcription) ? input.transcription : undefined;

  return {
    model:
      transcription && typeof transcription.model === "string"
        ? transcription.model
        : null,
    delay:
      transcription && typeof transcription.delay === "string"
        ? transcription.delay
        : null
  };
}

export function mergeRealtimeTranscriptionConfiguration(
  current: RealtimeTranscriptionConfiguration,
  reported: RealtimeTranscriptionConfiguration
): RealtimeTranscriptionConfiguration {
  return {
    model: reported.model ?? current.model,
    delay: reported.delay ?? current.delay
  };
}

export function verifyRealtimeTranscriptionConfiguration(input: {
  issuedModel: string;
  issuedDelay: OpenAiRealtimeTranscriptionDelay;
  reported: RealtimeTranscriptionConfiguration;
  expectedModel: string;
  expectedDelay: OpenAiRealtimeTranscriptionDelay;
}):
  | { ok: true; delaySource: "event" | "issued" }
  | { ok: false; reason: string } {
  if (input.issuedModel !== input.expectedModel) {
    return { ok: false, reason: "issued-model-mismatch" };
  }
  if (input.issuedDelay !== input.expectedDelay) {
    return { ok: false, reason: "issued-delay-mismatch" };
  }
  if (
    input.reported.model !== null &&
    input.reported.model !== input.expectedModel
  ) {
    return { ok: false, reason: "reported-model-mismatch" };
  }
  if (
    input.reported.delay !== null &&
    input.reported.delay !== input.expectedDelay
  ) {
    return { ok: false, reason: "reported-delay-mismatch" };
  }

  return {
    ok: true,
    delaySource: input.reported.delay === null ? "issued" : "event"
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
