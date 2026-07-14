import { describe, expect, it } from "vitest";

import { createPrompterProgressTracker } from "./prompterProgressTracker";

const sentences = [
  {
    sentenceId: "sentence_1",
    index: 0,
    matchable: true,
    isFinalTrigger: false
  },
  {
    sentenceId: "sentence_ignored",
    index: 1,
    matchable: false,
    isFinalTrigger: false
  },
  {
    sentenceId: "sentence_2",
    index: 2,
    matchable: true,
    isFinalTrigger: true
  }
] as const;

describe("createPrompterProgressTracker", () => {
  it("matchable한 첫 문장을 current로 시작하고 evidence만으로 commit하지 않는다", () => {
    const tracker = createTracker();

    expect(tracker.acceptEvidence(evidence())).toBe(true);
    expect(tracker.snapshot()).toMatchObject({
      phase: "candidate",
      currentSentenceId: "sentence_1",
      candidateSentenceId: "sentence_1",
      committedSentenceIds: []
    });
  });

  it("다른 문장과 이전 revision evidence를 거부한다", () => {
    const tracker = createTracker();

    expect(
      tracker.acceptEvidence(evidence({ sentenceId: "sentence_2" }))
    ).toBe(false);
    tracker.manualNext(1_100);
    expect(
      tracker.acceptEvidence(
        evidence({ sentenceId: "sentence_2", revision: 0, atMs: 1_200 })
      )
    ).toBe(false);
  });

  it("신선한 candidate를 boundary에서 한 문장만 commit한다", () => {
    const tracker = createTracker();
    tracker.acceptEvidence(evidence());

    expect(tracker.acceptBoundary({ type: "stt-final", atMs: 1_100 })).toBe(
      true
    );
    expect(tracker.snapshot()).toMatchObject({
      revision: 1,
      phase: "committed",
      currentSentenceId: "sentence_2",
      committedSentenceIds: ["sentence_1"],
      lastCommitSource: "lexical"
    });
    expect(tracker.acceptBoundary({ type: "stt-final", atMs: 1_200 })).toBe(
      false
    );
  });

  it("오래된 evidence와 boundary보다 나중인 evidence는 commit하지 않는다", () => {
    const tracker = createTracker();
    tracker.acceptEvidence(evidence());

    expect(tracker.acceptBoundary({ type: "pause-started", atMs: 2_501 })).toBe(
      false
    );
    expect(tracker.snapshot().phase).toBe("tracking");

    tracker.acceptEvidence(evidence({ atMs: 3_000 }));
    expect(tracker.acceptBoundary({ type: "stt-final", atMs: 2_999 })).toBe(
      false
    );
  });

  it("manual next는 한 문장만 이동하고 previous는 해당 commit만 되돌린다", () => {
    const tracker = createTracker();

    expect(tracker.manualNext(1_000)).toBe(true);
    expect(tracker.snapshot()).toMatchObject({
      currentSentenceId: "sentence_2",
      committedSentenceIds: ["sentence_1"],
      lastCommitSource: "manual"
    });

    expect(tracker.manualPrevious(1_100)).toBe(true);
    expect(tracker.snapshot()).toMatchObject({
      currentSentenceId: "sentence_1",
      committedSentenceIds: [],
      finalSentenceCommitted: false
    });
  });

  it("마지막 문장 commit과 reset을 명시적으로 관리한다", () => {
    const tracker = createTracker();
    tracker.manualNext(1_000);
    tracker.manualNext(1_100);

    expect(tracker.snapshot()).toMatchObject({
      currentSentenceId: null,
      committedSentenceIds: ["sentence_1", "sentence_2"],
      finalSentenceCommitted: true
    });

    tracker.reset();
    expect(tracker.snapshot()).toMatchObject({
      currentSentenceId: "sentence_1",
      committedSentenceIds: [],
      finalSentenceCommitted: false,
      phase: "tracking"
    });
  });
});

function createTracker() {
  return createPrompterProgressTracker({
    slideId: "slide_1",
    sentences,
    maxEvidenceAgeMs: 1_500
  });
}

function evidence(
  override: Partial<Parameters<ReturnType<typeof createTracker>["acceptEvidence"]>[0]> = {}
) {
  return {
    sentenceId: "sentence_1",
    revision: 0,
    candidate: true,
    commitEligible: true,
    source: "lexical" as const,
    atMs: 1_000,
    ...override
  };
}
