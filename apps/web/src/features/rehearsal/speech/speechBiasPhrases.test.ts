import { describe, expect, it } from "vitest";

import { buildSpeechTrackingBiasPhrases } from "./speechBiasPhrases";

describe("buildSpeechTrackingBiasPhrases", () => {
  it("예산 압박에서도 컨트롤, 종결, 큐, 키워드 순서로 우선 보존한다", () => {
    const terms = buildSpeechTrackingBiasPhrases({
      budget: 6,
      controlPhrases: ["다음 슬라이드", "강조"],
      finalTriggerPhrases: ["마지막 결론"],
      cuePhrases: ["중요 지표"],
      keywords: [
        {
          keywordId: "kw_orbit",
          text: "오르빗",
          synonyms: ["리허설 도구"],
          abbreviations: ["Orbit"]
        }
      ],
      representativePhrases: ["발표 흐름 점검", "실시간 피드백"],
      legacyPhrases: ["레거시 제목", "레거시 본문"]
    });

    expect(terms.map((term) => term.text)).toEqual([
      "다음 슬라이드",
      "강조",
      "마지막 결론",
      "중요 지표",
      "오르빗",
      "리허설 도구"
    ]);
    expect(terms.map((term) => term.source)).toEqual([
      "control-phrase",
      "control-phrase",
      "final-trigger",
      "cue-trigger",
      "keyword",
      "synonym"
    ]);
  });

  it("상위 우선순위 문구와 중복되는 legacy 문구는 제거한다", () => {
    const terms = buildSpeechTrackingBiasPhrases({
      budget: 8,
      controlPhrases: ["다음 슬라이드"],
      finalTriggerPhrases: ["발표 마무리"],
      cuePhrases: [],
      keywords: [
        {
          keywordId: "kw_finish",
          text: "발표 마무리",
          synonyms: [],
          abbreviations: []
        }
      ],
      representativePhrases: ["발표 마무리"],
      legacyPhrases: ["발표 마무리", "레거시 제목"]
    });

    expect(terms.map((term) => term.text)).toEqual([
      "다음 슬라이드",
      "발표 마무리",
      "레거시 제목"
    ]);
    expect(terms[1].source).toBe("final-trigger");
    expect("keywordId" in terms[1]).toBe(false);
  });

  it("예산이 남을 때만 대표 구절과 legacy 문구를 포함한다", () => {
    const terms = buildSpeechTrackingBiasPhrases({
      budget: 10,
      controlPhrases: ["다음 슬라이드"],
      finalTriggerPhrases: ["마지막 결론"],
      cuePhrases: ["강조 지점"],
      keywords: [
        {
          keywordId: "kw_ai",
          text: "AI",
          synonyms: [],
          abbreviations: []
        }
      ],
      representativePhrases: ["발표 흐름 점검"],
      legacyPhrases: ["레거시 제목"]
    });

    expect(terms.map((term) => term.source)).toEqual([
      "control-phrase",
      "final-trigger",
      "cue-trigger",
      "keyword",
      "representative-phrase",
      "legacy"
    ]);
  });
});
