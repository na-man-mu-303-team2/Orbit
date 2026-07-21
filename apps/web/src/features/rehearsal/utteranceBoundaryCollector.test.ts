import { describe, expect, it } from "vitest";
import { createUtteranceBoundaryCollector } from "./utteranceBoundaryCollector";

describe("createUtteranceBoundaryCollector", () => {
  it("uses the first threshold crossing and applies 300ms pre-roll", () => {
    const collector = createUtteranceBoundaryCollector({
      createId: (sequence) => `utterance-${sequence}`,
    });
    collector.accept(
      { type: "speech-started", occurredAtMs: 1_200 },
      1_200,
      { slideId: "slide-1", deckRevision: 4 },
    );
    collector.accept(
      { type: "speech-ended", occurredAtMs: 2_700, reason: "silence" },
      2_700,
      { slideId: "slide-1", deckRevision: 4 },
    );

    expect(collector.snapshot()).toEqual([
      {
        utteranceId: "utterance-1",
        sequence: 1,
        startMs: 900,
        endMs: 2_700,
        commitReason: "silence",
        slideId: "slide-1",
        deckRevision: 4,
      },
    ]);
  });

  it("keeps 10-second safety commits in one coaching utterance", () => {
    const collector = createUtteranceBoundaryCollector({
      createId: (sequence) => `utterance-${sequence}`,
    });
    collector.accept(
      { type: "speech-started", occurredAtMs: 1_000 },
      1_000,
      { slideId: "slide-1", deckRevision: 1 },
    );
    collector.accept(
      { type: "speech-fragment-committed", occurredAtMs: 11_000 },
      11_000,
      { slideId: "slide-1", deckRevision: 1 },
    );
    collector.accept(
      { type: "speech-fragment-committed", occurredAtMs: 21_000 },
      21_000,
      { slideId: "slide-1", deckRevision: 1 },
    );
    collector.accept(
      { type: "speech-ended", occurredAtMs: 22_000, reason: "silence" },
      22_000,
      { slideId: "slide-1", deckRevision: 1 },
    );

    expect(collector.snapshot()).toHaveLength(1);
  });

  it("splits only continuous speech longer than 60 seconds", () => {
    const collector = createUtteranceBoundaryCollector({
      createId: (sequence) => `utterance-${sequence}`,
    });
    collector.accept(
      { type: "speech-started", occurredAtMs: 1_000 },
      1_000,
      { slideId: "slide-1", deckRevision: 1 },
    );
    collector.accept(
      { type: "speech-fragment-committed", occurredAtMs: 61_000 },
      61_000,
      { slideId: "slide-1", deckRevision: 1 },
    );
    expect(collector.snapshot()).toHaveLength(0);

    collector.accept(
      { type: "speech-ended", occurredAtMs: 62_000, reason: "silence" },
      62_000,
      { slideId: "slide-2", deckRevision: 2 },
    );

    expect(collector.snapshot()).toEqual([
      expect.objectContaining({
        sequence: 1,
        startMs: 700,
        endMs: 60_700,
        commitReason: "max-duration",
      }),
      expect.objectContaining({
        sequence: 2,
        startMs: 60_700,
        endMs: 62_000,
        commitReason: "silence",
      }),
    ]);
  });
});
