import { describe, expect, it } from "vitest";

import type { ExtractedSentence } from "../speech/speechTrackingEvents";
import {
  createRehearsalScriptPrompterRows,
  getRehearsalScriptFocusSentenceId
} from "./rehearsalScriptPrompter";

describe("createRehearsalScriptPrompterRows", () => {
  it("marks covered, current, and next rows from line-level coverage", () => {
    const rows = createRehearsalScriptPrompterRows({
      sentences,
      coveredSentenceIds: ["sentence_1"],
      coveredSentenceMatchKinds: {
        sentence_1: "covered"
      }
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

  it("keeps the final covered row focused when all matchable rows are covered", () => {
    const rows = createRehearsalScriptPrompterRows({
      sentences,
      coveredSentenceIds: ["sentence_1", "sentence_3", "sentence_4", "sentence_5"]
    });

    expect(rows.map((row) => row.status)).toEqual([
      "covered",
      "unmatchable",
      "covered",
      "covered",
      "covered"
    ]);
    expect(rows.find((row) => row.isFocusTarget)?.sentence.sentenceId).toBe(
      "sentence_5"
    );
  });

  it("preserves paraphrased covered rows", () => {
    const rows = createRehearsalScriptPrompterRows({
      sentences,
      coveredSentenceIds: new Set(["sentence_1", "sentence_3"]),
      coveredSentenceMatchKinds: {
        sentence_3: "paraphrased"
      }
    });

    expect(rows[2]?.status).toBe("paraphrased");
    expect(getRehearsalScriptFocusSentenceId(sentences, ["sentence_1"])).toBe(
      "sentence_3"
    );
    expect(getRehearsalScriptFocusSentenceId([], [])).toBeNull();
  });
});

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
