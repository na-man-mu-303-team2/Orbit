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
});
