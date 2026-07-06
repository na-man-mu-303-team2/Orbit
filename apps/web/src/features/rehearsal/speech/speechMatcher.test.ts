import { describe, expect, it } from "vitest";

import {
  calculateWordMultisetRecall,
  createFinalSegmentWindow,
  matchKeywordAliases,
  matchPhraseCandidate
} from "./speechMatcher";

describe("matchPhraseCandidate", () => {
  it("정규화된 substring이면 즉시 매칭한다", () => {
    expect(
      matchPhraseCandidate({
        candidateText: "오르빗 리허설 화면",
        finalSegmentWindow: "오늘은 오르빗으로 리허설 화면을 점검합니다"
      })
    ).toMatchObject({ matched: true, method: "substring" });
  });

  it("substring이 아니면 문자 bigram Dice 기준으로 매칭한다", () => {
    expect(
      matchPhraseCandidate({
        candidateText: "실시간 발표 흐름",
        finalSegmentWindow: "실시간 발표 흐릅",
        diceThreshold: 0.75
      })
    ).toMatchObject({ matched: true, method: "dice" });
  });

  it("Dice 기준보다 낮으면 매칭하지 않는다", () => {
    expect(
      matchPhraseCandidate({
        candidateText: "자동 전환 조건",
        finalSegmentWindow: "완전히 다른 이야기",
        diceThreshold: 0.75
      })
    ).toEqual({ matched: false, method: "none", score: 0 });
  });
});

describe("createFinalSegmentWindow", () => {
  it("이전 final 꼬리 40자와 최신 final 세그먼트만 사용한다", () => {
    const previous =
      "가".repeat(45) + "오르빗 리허설 화면에서 이전 꼬리만 남겨야 합니다";

    expect(
      createFinalSegmentWindow({
        previousFinalTranscript: previous,
        latestFinalSegment: "마지막 문장입니다",
        tailCharacters: 40
      })
    ).toBe(`${previous.slice(-40)} 마지막 문장입니다`);
  });
});

describe("matchKeywordAliases", () => {
  it("키워드는 fuzzy 없이 정규화 exact/substring으로만 매칭한다", () => {
    const result = matchKeywordAliases({
      transcript: "오늘은 오르빗 리허설 화면을 설명합니다",
      keywords: [
        {
          keywordId: "kw_orbit",
          aliases: ["오르빗", "Orbit"]
        },
        {
          keywordId: "kw_noise",
          aliases: ["오르박"]
        }
      ]
    });

    expect(result.map((match) => match.keywordId)).toEqual(["kw_orbit"]);
  });

  it("짧은 영문 약어는 단어 경계를 요구한다", () => {
    expect(
      matchKeywordAliases({
        transcript: "AIX 실험을 설명합니다",
        keywords: [{ keywordId: "kw_ai", aliases: ["AI"] }]
      })
    ).toEqual([]);
    expect(
      matchKeywordAliases({
        transcript: "AI 실험을 설명합니다",
        keywords: [{ keywordId: "kw_ai", aliases: ["AI"] }]
      })
    ).toEqual([{ keywordId: "kw_ai", matchedAlias: "AI" }]);
  });

  it("같은 primary text가 반복되면 transcript 출현 횟수만큼만 순서대로 매칭한다", () => {
    expect(
      matchKeywordAliases({
        transcript: "처리합니다",
        keywords: [
          {
            keywordId: "kw_first",
            text: "처리합니다",
            noteOccurrence: 0,
            aliases: ["처리합니다"]
          },
          {
            keywordId: "kw_second",
            text: "처리합니다",
            noteOccurrence: 1,
            aliases: ["처리합니다"]
          }
        ]
      }).map((match) => match.keywordId)
    ).toEqual(["kw_first"]);

    expect(
      matchKeywordAliases({
        transcript: "처리합니다 다시 처리합니다",
        keywords: [
          {
            keywordId: "kw_first",
            text: "처리합니다",
            noteOccurrence: 0,
            aliases: ["처리합니다"]
          },
          {
            keywordId: "kw_second",
            text: "처리합니다",
            noteOccurrence: 1,
            aliases: ["처리합니다"]
          }
        ]
      }).map((match) => match.keywordId)
    ).toEqual(["kw_first", "kw_second"]);
  });
});

describe("calculateWordMultisetRecall", () => {
  it("대본 기준 multiset recall을 계산하고 반복 발화 과대계산을 막는다", () => {
    expect(
      calculateWordMultisetRecall({
        scriptText: "오르빗 리허설 리허설 화면",
        transcriptText: "오르빗 리허설 리허설 리허설"
      })
    ).toBe(0.75);
  });

  it("대본 어절이 없으면 0을 반환한다", () => {
    expect(
      calculateWordMultisetRecall({
        scriptText: "",
        transcriptText: "아무 말"
      })
    ).toBe(0);
  });
});
