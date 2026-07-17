import { createDemoDeck } from "@orbit/editor-core";
import { describe, expect, it } from "vitest";

import {
  buildEditorSlideRehearsalBiasPhrases,
  getEditorLiveAudioLevelPercent,
  getHitSlideKeywordIds
} from "./useEditorSlideRehearsal";

describe("useEditorSlideRehearsal utilities", () => {
  it("현재 슬라이드의 제목과 키워드를 음성 인식 힌트로 만든다", () => {
    const slide = createDemoDeck().slides[0]!;
    const phrases = buildEditorSlideRehearsalBiasPhrases(slide);

    expect(phrases.some((phrase) => phrase.text === slide.title)).toBe(true);
    expect(
      slide.keywords.every((keyword) =>
        phrases.some(
          (phrase) =>
            phrase.keywordId === keyword.keywordId &&
            phrase.text === keyword.text,
        ),
      ),
    ).toBe(true);
  });

  it("동의어와 약어 발화도 체크포인트 달성으로 처리한다", () => {
    const slide = createDemoDeck().slides[0]!;
    slide.keywords = [
      {
        abbreviations: ["STT"],
        keywordId: "kw_voice",
        required: true,
        synonyms: ["음성 변환"],
        text: "음성 인식",
      },
    ];

    expect(getHitSlideKeywordIds(slide, "STT 결과를 확인합니다")).toEqual([
      "kw_voice",
    ]);
    expect(
      getHitSlideKeywordIds(slide, "음성 변환 결과를 확인합니다"),
    ).toEqual(["kw_voice"]);
  });

  it("음량 dB를 0~100 범위로 제한한다", () => {
    expect(
      getEditorLiveAudioLevelPercent({
        isLikelySilence: false,
        peak: 1,
        peakDb: 0,
        rms: 1,
        rmsDb: 10,
        type: "audio-level",
      }),
    ).toBe(100);
    expect(
      getEditorLiveAudioLevelPercent({
        isLikelySilence: true,
        peak: 0,
        peakDb: -80,
        rms: 0,
        rmsDb: -80,
        type: "audio-level",
      }),
    ).toBe(0);
  });
});
