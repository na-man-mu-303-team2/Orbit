import { describe, expect, it } from "vitest";

import { createCueMatcher } from "./cueMatcher";
import type { RuntimeSpeechCue } from "./cueProvider";

describe("cueMatcher", () => {
  it("partial 결과는 cue match를 만들지 않는다", () => {
    const matcher = createCueMatcher();

    expect(
      matcher.acceptResult(
        { text: "핵심 지표", isFinal: false, timestampMs: [0, 300] },
        [createCue({ cueId: "cue_partial_1", phrase: "핵심 지표" })]
      )
    ).toEqual([]);
  });

  it("P3와 같은 final segment window로 경계에 걸친 phrase를 매칭한다", () => {
    const matcher = createCueMatcher({ tailCharacters: 20 });

    matcher.acceptResult(
      { text: "오늘은 핵심", isFinal: true, timestampMs: [0, 500] },
      [createCue({ cueId: "cue_boundary_1", phrase: "핵심 지표" })]
    );

    const matches = matcher.acceptResult(
      { text: "지표를 보겠습니다", isFinal: true, timestampMs: [500, 900] },
      [createCue({ cueId: "cue_boundary_1", phrase: "핵심 지표" })]
    );

    expect(matches).toMatchObject([
      {
        cueId: "cue_boundary_1",
        matchedPhrase: "핵심 지표",
        method: "substring",
        slideId: "slide_cue_1"
      }
    ]);
  });

  it("여러 cue가 동시에 매칭되면 provider 순서대로 반환한다", () => {
    const matcher = createCueMatcher();
    const matches = matcher.acceptResult(
      {
        text: "핵심 지표를 강조하고 다음으로 넘어갑니다",
        isFinal: true,
        timestampMs: [100, 1200]
      },
      [
        createCue({ cueId: "cue_highlight_1", phrase: "핵심 지표" }),
        createCue({
          cueId: "cue_advance_1",
          phrase: "다음으로",
          action: { type: "advance-slide" }
        })
      ]
    );

    expect(matches.map((match) => match.cueId)).toEqual([
      "cue_highlight_1",
      "cue_advance_1"
    ]);
    expect(matches.map((match) => match.atMs)).toEqual([1200, 1200]);
  });

  it("Dice 기준 매칭과 miss를 구분한다", () => {
    const matcher = createCueMatcher({ diceThreshold: 0.75 });

    const matches = matcher.acceptResult(
      {
        text: "실시간 발표 흐릅",
        isFinal: true,
        timestampMs: [0, 1000]
      },
      [
        createCue({ cueId: "cue_dice_1", phrase: "실시간 발표 흐름" }),
        createCue({ cueId: "cue_miss_1", phrase: "완전히 다른 지점" })
      ]
    );

    expect(matches.map((match) => [match.cueId, match.method])).toEqual([
      ["cue_dice_1", "dice"]
    ]);
  });

  it("match 결과에는 transcript 원문과 scriptAnchor 판단이 들어가지 않는다", () => {
    const matcher = createCueMatcher();
    const matches = matcher.acceptResult(
      { text: "핵심 지표", isFinal: true, timestampMs: [0, 1000] },
      [
        createCue({
          cueId: "cue_anchor_1",
          phrase: "핵심 지표",
          scriptAnchor: { start: 100, end: 120 }
        })
      ]
    );

    expect(matches).toHaveLength(1);
    expect(JSON.stringify(matches[0])).not.toContain("핵심 지표 핵심 지표");
    expect(matches[0]).not.toHaveProperty("text");
    expect(matches[0]).not.toHaveProperty("scriptAnchor");
  });
});

function createCue(options: {
  cueId: string;
  phrase: string;
  action?: RuntimeSpeechCue["action"];
  scriptAnchor?: RuntimeSpeechCue["trigger"]["scriptAnchor"];
}): RuntimeSpeechCue {
  return {
    slideId: "slide_cue_1",
    cueId: options.cueId,
    trigger: {
      phrases: [options.phrase],
      ...(options.scriptAnchor ? { scriptAnchor: options.scriptAnchor } : {})
    },
    action:
      options.action ?? {
        type: "highlight",
        elementId: "el_cue_body"
      },
    source: "user",
    enabled: true
  };
}
