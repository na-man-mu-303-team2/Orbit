import { describe, expect, it } from "vitest";
import {
  confirmRehearsalCommandCandidate,
  createRehearsalCommandConfirmationState,
  detectRehearsalCommandCandidate,
  getRehearsalCommandBiasTerms,
  normalizeRehearsalCommandTranscript
} from "./rehearsalCommands";

describe("rehearsalCommands", () => {
  it("normalizes Korean command transcript punctuation and whitespace", () => {
    expect(normalizeRehearsalCommandTranscript("  다음   슬라이드! ")).toBe(
      "다음 슬라이드"
    );
  });

  it("detects configured command phrases conservatively", () => {
    expect(
      detectRehearsalCommandCandidate({
        transcript: "다음 슬라이드.",
        isFinal: true,
        confidence: 0.9
      })
    ).toMatchObject({
      action: "advance-slide",
      phrase: "다음 슬라이드",
      isFinal: true,
      confidence: 0.9
    });

    expect(
      detectRehearsalCommandCandidate({
        transcript: "안녕하세요. 다음 슬라이드는.",
        isFinal: true,
        confidence: 0.9
      })
    ).toBeNull();
  });

  it("confirms final matches immediately and repeated partials within the window", () => {
    const state = createRehearsalCommandConfirmationState();
    const firstPartial = detectRehearsalCommandCandidate(
      {
        transcript: "강조",
        isFinal: false,
        confidence: null
      },
      { now: () => 1_000 }
    );
    const secondPartial = detectRehearsalCommandCandidate(
      {
        transcript: "강조",
        isFinal: false,
        confidence: null
      },
      { now: () => 1_500 }
    );
    const finalCandidate = detectRehearsalCommandCandidate(
      {
        transcript: "넘어가",
        isFinal: true,
        confidence: null
      },
      { now: () => 3_000 }
    );

    expect(confirmRehearsalCommandCandidate(state, firstPartial)).toBeNull();
    expect(confirmRehearsalCommandCandidate(state, secondPartial)).toMatchObject({
      action: "animation-cue",
      cue: "emphasis"
    });
    expect(confirmRehearsalCommandCandidate(state, finalCandidate)).toMatchObject({
      action: "advance-slide"
    });
  });

  it("확정 partial 뒤 같은 final은 다시 실행하지 않고 이후 utterance는 허용한다", () => {
    const state = createRehearsalCommandConfirmationState();
    const candidateAt = (matchedAt: number, isFinal: boolean) =>
      detectRehearsalCommandCandidate(
        {
          transcript: "강조",
          isFinal,
          confidence: null
        },
        { now: () => matchedAt }
      );

    expect(confirmRehearsalCommandCandidate(state, candidateAt(1_000, false))).toBeNull();
    expect(
      confirmRehearsalCommandCandidate(state, candidateAt(1_300, false))
    ).toMatchObject({ action: "animation-cue" });
    expect(confirmRehearsalCommandCandidate(state, candidateAt(1_500, true))).toBeNull();
    expect(
      confirmRehearsalCommandCandidate(state, candidateAt(4_000, true))
    ).toMatchObject({ action: "animation-cue" });
  });

  it("exports control phrases as live STT bias terms", () => {
    expect(getRehearsalCommandBiasTerms()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          text: "다음 슬라이드",
          source: "control-phrase"
        }),
        expect.objectContaining({
          text: "하이라이트",
          source: "control-phrase"
        })
      ])
    );
  });
});
