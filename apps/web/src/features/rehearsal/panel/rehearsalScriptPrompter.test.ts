import { describe, expect, it } from "vitest";

import type { ExtractedSentence } from "../speech/speechTrackingEvents";
import {
  createRehearsalScriptPrompterRows,
  getRehearsalScriptFocusSentenceId
} from "./rehearsalScriptPrompter";

describe("createRehearsalScriptPrompterRows", () => {
  it("keeps a candidate sentence current when coaching coverage changes", () => {
    const rows = createRehearsalScriptPrompterRows({
      sentences,
      coveredSentenceIds: ["sentence_1", "sentence_4"],
      coveredSentenceMatchKinds: {
        sentence_1: "covered",
        sentence_4: "covered"
      },
      prompterProgress: progress({
        phase: "candidate",
        candidateSentenceId: "sentence_1",
        candidateSinceMs: 1_000
      })
    });

    expect(rows.map((row) => [row.sentence.sentenceId, row.status])).toEqual([
      ["sentence_1", "current"],
      ["sentence_2", "unmatchable"],
      ["sentence_3", "next"],
      ["sentence_4", "covered"],
      ["sentence_5", "pending"]
    ]);
    expect(rows.find((row) => row.isFocusTarget)?.sentence.sentenceId).toBe(
      "sentence_1"
    );
    expect(rows[0]?.coverageStatus).toBe("covered");
  });

  it("moves current and next rows only after the prompter commits", () => {
    const rows = createRehearsalScriptPrompterRows({
      sentences,
      coveredSentenceIds: ["sentence_1"],
      coveredSentenceMatchKinds: {
        sentence_1: "covered"
      },
      prompterProgress: progress({
        currentSentenceId: "sentence_3",
        committedSentenceIds: ["sentence_1"],
        lastCommittedSentenceId: "sentence_1"
      })
    });

    expect(rows.map((row) => [row.sentence.sentenceId, row.status])).toEqual([
      ["sentence_1", "covered"],
      ["sentence_2", "unmatchable"],
      ["sentence_3", "current"],
      ["sentence_4", "next"],
      ["sentence_5", "pending"]
    ]);
    expect(rows.find((row) => row.isFocusTarget)?.sentence.sentenceId).toBe(
      "sentence_3"
    );
  });

  it("keeps the final committed row current when all matchable rows are committed", () => {
    const rows = createRehearsalScriptPrompterRows({
      sentences,
      coveredSentenceIds: ["sentence_1", "sentence_3", "sentence_4", "sentence_5"],
      prompterProgress: progress({
        currentSentenceId: null,
        committedSentenceIds: [
          "sentence_1",
          "sentence_3",
          "sentence_4",
          "sentence_5"
        ],
        lastCommittedSentenceId: "sentence_5",
        finalSentenceCommitted: true
      })
    });

    expect(rows.map((row) => row.status)).toEqual([
      "covered",
      "unmatchable",
      "covered",
      "covered",
      "current"
    ]);
    expect(rows.find((row) => row.isFocusTarget)?.sentence.sentenceId).toBe(
      "sentence_5"
    );
    expect(rows[4]?.coverageStatus).toBe("covered");
  });

  it("preserves a paraphrased badge on the current prompter sentence", () => {
    const rows = createRehearsalScriptPrompterRows({
      sentences,
      coveredSentenceIds: new Set(["sentence_1", "sentence_3"]),
      coveredSentenceMatchKinds: {
        sentence_3: "paraphrased"
      },
      prompterProgress: progress({ currentSentenceId: "sentence_3" })
    });

    expect(rows[2]?.status).toBe("current");
    expect(rows[2]?.coverageStatus).toBe("paraphrased");
    expect(getRehearsalScriptFocusSentenceId(sentences, progress({
      currentSentenceId: "sentence_3"
    }))).toBe(
      "sentence_3"
    );
    expect(getRehearsalScriptFocusSentenceId([], undefined)).toBeNull();
  });

  it("keeps the first matchable sentence current in legacy renders", () => {
    const rows = createRehearsalScriptPrompterRows({
      sentences,
      coveredSentenceIds: ["sentence_1", "sentence_3", "sentence_4"]
    });

    expect(rows[0]?.status).toBe("current");
    expect(rows[0]?.coverageStatus).toBe("covered");
    expect(rows[2]?.status).toBe("next");
    expect(getRehearsalScriptFocusSentenceId(sentences, undefined)).toBe(
      "sentence_1"
    );
  });
});

function progress(
  overrides: Partial<
    NonNullable<
      import("../speech/speechTrackingEvents").SpeechTrackerSnapshot["prompterProgress"]
    >
  > = {}
): NonNullable<
  import("../speech/speechTrackingEvents").SpeechTrackerSnapshot["prompterProgress"]
> {
  return {
    slideId: "slide_1",
    revision: 0,
    phase: "tracking",
    currentSentenceId: "sentence_1",
    candidateSentenceId: null,
    candidateSinceMs: null,
    committedSentenceIds: [],
    lastCommittedSentenceId: null,
    lastCommitSource: null,
    finalSentenceCommitted: false,
    ...overrides
  };
}

const sentences: ExtractedSentence[] = [
  {
    sentenceId: "sentence_1",
    text: "첫 줄",
    index: 0,
    isFinalTrigger: false,
    matchable: true,
    candidates: []
  },
  {
    sentenceId: "sentence_2",
    text: "짧음",
    index: 1,
    isFinalTrigger: false,
    matchable: false,
    candidates: []
  },
  {
    sentenceId: "sentence_3",
    text: "현재 줄",
    index: 2,
    isFinalTrigger: false,
    matchable: true,
    candidates: []
  },
  {
    sentenceId: "sentence_4",
    text: "다음 줄",
    index: 3,
    isFinalTrigger: false,
    matchable: true,
    candidates: []
  },
  {
    sentenceId: "sentence_5",
    text: "마지막 줄",
    index: 4,
    isFinalTrigger: true,
    matchable: true,
    candidates: []
  }
];
