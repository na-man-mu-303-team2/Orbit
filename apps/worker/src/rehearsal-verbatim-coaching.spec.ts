import { describe, expect, it, vi } from "vitest";
import type { StoragePort } from "@orbit/storage";
import { createRehearsalVerbatimCoachingEvidence } from "./rehearsal-verbatim-coaching";

describe("createRehearsalVerbatimCoachingEvidence", () => {
  it("returns legacy metadata without reading private audio", async () => {
    const storage = { getObject: vi.fn() } as unknown as Pick<
      StoragePort,
      "getObject"
    >;
    const evidence = await createRehearsalVerbatimCoachingEvidence({
      storage,
      storageKey: "private/audio.webm",
      boundaries: [],
    });

    expect(evidence.source.mode).toBe("legacy");
    expect(storage.getObject).not.toHaveBeenCalled();
  });

  it("marks mini unavailable without a key and does not expose transcript evidence", async () => {
    const storage = { getObject: vi.fn() } as unknown as Pick<
      StoragePort,
      "getObject"
    >;
    const evidence = await createRehearsalVerbatimCoachingEvidence({
      storage,
      storageKey: "private/audio.webm",
      boundaries: [
        {
          utteranceId: "utterance-1",
          sequence: 1,
          startMs: 0,
          endMs: 1_000,
          commitReason: "silence",
          slideId: "slide_1",
          deckRevision: 1,
        },
      ],
      runtime: {
        mode: "mini",
        miniModel: "gpt-4o-mini-transcribe",
      },
    });

    expect(evidence.source).toMatchObject({
      mode: "mini",
      state: "unavailable",
      completedUtterances: 0,
      totalUtterances: 1,
    });
    expect(evidence.fillerOccurrences).toEqual([]);
    expect(storage.getObject).not.toHaveBeenCalled();
  });

  it("classifies completed mini transcripts and clears derived audio buffers", async () => {
    const audio = new Uint8Array([9, 8, 7]);
    const storage = {
      getObject: vi.fn(async () => ({
        body: new Uint8Array([1]),
        contentType: "audio/webm",
      })),
    } as unknown as Pick<StoragePort, "getObject">;
    const boundary = {
      utteranceId: "utterance-1",
      sequence: 1,
      startMs: 0,
      endMs: 1_000,
      commitReason: "silence" as const,
      slideId: "slide_1",
      deckRevision: 1,
    };
    const evidence = await createRehearsalVerbatimCoachingEvidence({
      storage,
      storageKey: "private/audio.webm",
      boundaries: [boundary],
      runtime: {
        mode: "mini",
        apiKey: "test-key",
        miniModel: "gpt-4o-mini-transcribe",
      },
      extractClips: vi.fn(async () => [
        {
          utteranceId: boundary.utteranceId,
          sequence: 1,
          slideId: "slide_1",
          audio,
          mimeType: "audio/wav" as const,
        },
      ]),
      transcribe: vi.fn(async () => [
        {
          utteranceId: boundary.utteranceId,
          sequence: 1,
          slideId: "slide_1",
          status: "completed" as const,
          transcript: "음 결과 결과를 설명합니다",
          errorCode: null,
        },
      ]),
    });

    expect(evidence.source).toMatchObject({
      mode: "mini",
      state: "completed",
      completedUtterances: 1,
    });
    expect(evidence.fillerWordDetails).toEqual([{ word: "음", count: 1 }]);
    expect(evidence.disfluencyOccurrences[0]?.kind).toBe("repetition");
    expect(audio).toEqual(new Uint8Array([0, 0, 0]));
  });

  it("uses successful OOB results as authoritative evidence without reading audio", async () => {
    const storage = { getObject: vi.fn() } as unknown as Pick<
      StoragePort,
      "getObject"
    >;
    const evidence = await createRehearsalVerbatimCoachingEvidence({
      storage,
      storageKey: "private/audio.webm",
      boundaries: [boundary("utterance-1", 1)],
      oobResults: [
        {
          utteranceId: "utterance-1",
          fragmentSequence: 2,
          responseId: "response-2",
          status: "completed",
          latencyMs: 800,
          transcript: "어 결과",
          inputTokens: 20,
          outputTokens: 3,
          failureCode: null,
        },
        {
          utteranceId: "utterance-1",
          fragmentSequence: 1,
          responseId: "response-1",
          status: "completed",
          latencyMs: 700,
          transcript: "음 시작",
          inputTokens: 18,
          outputTokens: 2,
          failureCode: null,
        },
      ],
      runtime: {
        mode: "realtime-oob",
        miniModel: "gpt-4o-mini-transcribe",
        oobModel: "gpt-realtime-2.1",
      },
    });

    expect(evidence.source).toMatchObject({
      mode: "realtime-oob",
      state: "completed",
      model: "gpt-realtime-2.1",
      promptVersion: "korean-filler-verbatim-oob-v1",
    });
    expect(evidence.fillerWordDetails).toEqual([
      { word: "어", count: 1 },
      { word: "음", count: 1 },
    ]);
    expect(evidence.telemetry).toMatchObject({
      oobAttemptedResponses: 2,
      oobCompletedResponses: 2,
      oobTotalLatencyMs: 1_500,
      oobInputTokens: 38,
      miniFallbackUtterances: 0,
    });
    expect(storage.getObject).not.toHaveBeenCalled();
  });

  it("falls back to mini for each OOB-failed utterance", async () => {
    const storage = {
      getObject: vi.fn(async () => ({
        body: new Uint8Array([1]),
        contentType: "audio/webm",
      })),
    } as unknown as Pick<StoragePort, "getObject">;
    const extractClips = vi.fn(async (input) =>
      input.boundaries.map((item: ReturnType<typeof boundary>) => ({
        utteranceId: item.utteranceId,
        sequence: item.sequence,
        slideId: item.slideId,
        audio: new Uint8Array([1]),
        mimeType: "audio/wav" as const,
      })),
    );
    const evidence = await createRehearsalVerbatimCoachingEvidence({
      storage,
      storageKey: "private/audio.webm",
      boundaries: [boundary("utterance-1", 1), boundary("utterance-2", 2)],
      oobResults: [
        {
          utteranceId: "utterance-1",
          fragmentSequence: 1,
          responseId: "response-1",
          status: "completed",
          latencyMs: 500,
          transcript: "음 첫째",
          inputTokens: null,
          outputTokens: null,
          failureCode: null,
        },
        {
          utteranceId: "utterance-2",
          fragmentSequence: 1,
          responseId: null,
          status: "failed",
          latencyMs: 12_000,
          transcript: null,
          inputTokens: null,
          outputTokens: null,
          failureCode: "timeout",
        },
      ],
      runtime: {
        mode: "realtime-oob",
        apiKey: "test-key",
        miniModel: "gpt-4o-mini-transcribe",
        oobModel: "gpt-realtime-2.1",
      },
      extractClips,
      transcribe: vi.fn(async (input) =>
        input.clips.map((clip: {
          utteranceId: string;
          sequence: number;
          slideId: string | null;
        }) => ({
          utteranceId: clip.utteranceId,
          sequence: clip.sequence,
          slideId: clip.slideId,
          status: "completed" as const,
          transcript: "어 둘째",
          errorCode: null,
        })),
      ),
    });

    expect(extractClips.mock.calls[0]?.[0].boundaries).toEqual([
      boundary("utterance-2", 2),
    ]);
    expect(evidence.source.state).toBe("completed");
    expect(evidence.source.completedUtterances).toBe(2);
    expect(evidence.telemetry).toMatchObject({
      oobFailedResponses: 1,
      miniFallbackUtterances: 1,
    });
  });
});

function boundary(utteranceId: string, sequence: number) {
  return {
    utteranceId,
    sequence,
    startMs: (sequence - 1) * 1_000,
    endMs: sequence * 1_000,
    commitReason: "silence" as const,
    slideId: "slide_1",
    deckRevision: 1,
  };
}
