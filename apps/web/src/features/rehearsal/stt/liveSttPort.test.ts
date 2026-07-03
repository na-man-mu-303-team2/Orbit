import { describe, expect, it } from "vitest";
import {
  LiveSttError,
  mapPartialTranscriptToLiveSttResult,
  normalizeLiveSttBiasPhrases
} from "./liveSttPort";

describe("liveSttPort", () => {
  it("partial transcript event를 LiveSttResult로 변환한다", () => {
    expect(
      mapPartialTranscriptToLiveSttResult(
        {
          type: "partial-transcript",
          transcript: "오르빗 발표",
          isFinal: true,
          confidence: 0.72
        },
        1500
      )
    ).toEqual({
      text: "오르빗 발표",
      isFinal: true,
      confidence: 0.72,
      timestampMs: [1500, 1500]
    });
  });

  it("confidence가 null이면 결과에서 생략한다", () => {
    expect(
      mapPartialTranscriptToLiveSttResult(
        {
          type: "partial-transcript",
          transcript: "중간 인식",
          isFinal: false,
          confidence: null
        },
        250
      )
    ).toEqual({
      text: "중간 인식",
      isFinal: false,
      timestampMs: [250, 250]
    });
  });

  it("bias phrase를 trim, 공백 정규화, 중복 제거한다", () => {
    expect(
      normalizeLiveSttBiasPhrases(["  오르빗  ", "오르빗", "Live   STT", ""])
    ).toEqual(["오르빗", "Live STT"]);
  });

  it("typed error 이름을 고정한다", () => {
    const error = new LiveSttError("start_failed", "시작 실패");

    expect(error.name).toBe("LiveSttError");
    expect(error.code).toBe("start_failed");
    expect(error.message).toBe("시작 실패");
  });
});
