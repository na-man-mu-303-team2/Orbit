import { describe, expect, it } from "vitest";

import {
  buildContextMatchCandidateWindows,
  isContextItemCovered,
  selectBestContextItemMatch,
} from "./contextCoverageMatcher";

describe("buildContextMatchCandidateWindows", () => {
  it("keeps the full transcript and meaningful suffix windows", () => {
    expect(
      buildContextMatchCandidateWindows(
        "컨디션에 대해 들어보신 적 있으신가요 레이스 컨디션은 여러 작업이 동시에 실행될 때 발생하는 예측 불가능한 결과를 뜻합니다",
      ),
    ).toContain(
      "레이스 컨디션은 여러 작업이 동시에 실행될 때 발생하는 예측 불가능한 결과를 뜻합니다",
    );
  });
});

describe("isContextItemCovered", () => {
  it("accepts a required sentence when an intro phrase is prepended", () => {
    expect(
      isContextItemCovered({
        itemSentence:
          "레이스 컨디션은 여러 작업이 동시에 실행될 때 발생하는 예측 불가능한 결과를 뜻합니다.",
        transcriptWindow:
          "컨디션에 대해 들어보신 적 있으신가요 레이스 컨디션은 여러 작업이 동시에 실행될 때 발생하는 예측 불가능한 결과를 뜻합니다",
        semanticSimilarity: 0.71,
      }),
    ).toBe(true);
  });

  it("rejects unrelated transcript even when semantic similarity is low", () => {
    expect(
      isContextItemCovered({
        itemSentence: "동시 실행 작업의 문제점을 설명합니다.",
        transcriptWindow: "정글에서 배운 세마포어와 락 도구를 소개하겠습니다",
        semanticSimilarity: 0.42,
      }),
    ).toBe(false);
  });

  it("accepts paraphrased wording when semantic similarity is high and lexical anchors remain", () => {
    expect(
      isContextItemCovered({
        itemSentence:
          "두 스레드가 같은 데이터를 동시에 바꾸면 데이터 경쟁이 발생하는 예시를 설명합니다.",
        transcriptWindow:
          "같은 데이터를 동시에 수정하면 데이터 경쟁 같은 충돌 사례가 생길 수 있다고 설명하겠습니다",
        semanticSimilarity: 0.86,
      }),
    ).toBe(true);
  });

  it("accepts TC-02 slide 1 자연스러운 재표현 when semantic similarity is high", () => {
    const transcriptWindow =
      "학교 카페에서 나오는 일회용컵 양이 꽤 많습니다 매일 버려지는 컵 때문에 처리 비용도 계속 부담이 됩니다 학생들이 다회용컵을 안 쓰는 이유는 의지가 없어서라기보다 어디에 돌려줘야 하는지 불편하고 절차가 귀찮기 때문입니다 그래서 쉽게 반납할 수 있는 구조가 필요합니다";

    expect(
      isContextItemCovered({
        itemSentence: "일회용컵 다량 사용 문제",
        transcriptWindow,
        semanticSimilarity: 0.81,
      }),
    ).toBe(true);
    expect(
      isContextItemCovered({
        itemSentence: "폐기물 처리 비용 증가",
        transcriptWindow,
        semanticSimilarity: 0.81,
      }),
    ).toBe(true);
    expect(
      isContextItemCovered({
        itemSentence: "반납 시스템의 불편함",
        transcriptWindow,
        semanticSimilarity: 0.81,
      }),
    ).toBe(true);
    expect(
      isContextItemCovered({
        itemSentence: "편리한 반납 시스템 필요성",
        transcriptWindow,
        semanticSimilarity: 0.81,
      }),
    ).toBe(true);
  });

  it("does not cover cost increase when the user only says disposable cup volume is high", () => {
    const transcriptWindow = "학교 카페에서 나오는 일회용컵 양이 꽤 많습니다";

    expect(
      isContextItemCovered({
        itemSentence: "일회용컵 다량 사용 문제",
        transcriptWindow,
        semanticSimilarity: 0.86,
      }),
    ).toBe(true);
    expect(
      isContextItemCovered({
        itemSentence: "폐기물 처리 비용 증가",
        transcriptWindow,
        semanticSimilarity: 0.86,
      }),
    ).toBe(false);
  });

  it("does not cover solution necessity when the user only explains return friction", () => {
    const transcriptWindow =
      "학생들이 다회용컵을 안 쓰는 이유는 의지가 없어서라기보다 어디에 돌려줘야 하는지 불편하고 절차가 귀찮기 때문입니다";

    expect(
      isContextItemCovered({
        itemSentence: "반납 시스템 불편함",
        transcriptWindow,
        semanticSimilarity: 0.86,
      }),
    ).toBe(true);
    expect(
      isContextItemCovered({
        itemSentence: "편리한 반납 시스템 필요성",
        transcriptWindow,
        semanticSimilarity: 0.86,
      }),
    ).toBe(false);
  });

  it("does not accept semantic-only matches without enough lexical grounding", () => {
    expect(
      isContextItemCovered({
        itemSentence: "데이터 경쟁 예시를 설명합니다.",
        transcriptWindow:
          "레이스 컨디션은 여러 작업이 동시에 실행될 때 실행 순서에 따라 결과가 달라지는 예측하기 어려운 상황을 말합니다",
        semanticSimilarity: 0.89,
      }),
    ).toBe(false);
  });
});

describe("selectBestContextItemMatch", () => {
  it("selects only the strongest item for a single intro+definition utterance window", () => {
    const selected = selectBestContextItemMatch({
      items: [
        {
          itemId: "item-1",
          sentence:
            "레이스 컨디션은 여러 작업이 동시에 실행될 때 발생하는 예측 불가능한 결과를 뜻합니다.",
        },
        {
          itemId: "item-2",
          sentence: "동시 실행 작업이 겹치면 결과가 달라질 수 있는 문제를 설명합니다.",
        },
        {
          itemId: "item-3",
          sentence: "두 스레드가 같은 데이터를 동시에 바꾸는 데이터 경쟁 예시를 설명합니다.",
        },
      ],
      semanticSimilarities: new Map([
        ["item-1", 0.88],
        ["item-2", 0.86],
        ["item-3", 0.84],
      ]),
      transcriptWindow:
        "여러분 레이스 컨디션에 대해 들어보신 적 있으신가요 레이스 컨디션은 여러 작업이 동시에 실행될 때 실행 순서에 따라 결과가 달라지는 예측하기 어려운 상황을 말합니다",
    });

    expect(selected?.item.itemId).toBe("item-1");
    expect(selected?.evaluation.method).toBe("semantic");
  });
});
