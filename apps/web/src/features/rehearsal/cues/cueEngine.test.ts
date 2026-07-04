import { describe, expect, it } from "vitest";

import { createCueEngine } from "./cueEngine";
import type { CueMatch } from "./cueMatcher";

describe("cueEngine", () => {
  it("match action을 presenter command로 변환한다", () => {
    const engine = createCueEngine();

    expect(
      engine.executeMatches([
        createMatch({
          cueId: "cue_highlight_1",
          action: { type: "highlight", elementId: "el_target" }
        }),
        createMatch({
          cueId: "cue_animation_1",
          action: { type: "animation", animationId: "anim_target" }
        }),
        createMatch({
          cueId: "cue_advance_1",
          action: { type: "advance-slide" }
        })
      ])
    ).toEqual([
      {
        type: "set-highlight",
        active: true,
        cueId: "cue_highlight_1",
        elementId: "el_target",
        slideId: "slide_cue_1"
      },
      {
        type: "next-step",
        animationId: "anim_target",
        cueId: "cue_animation_1",
        slideId: "slide_cue_1"
      },
      {
        type: "mark-advance-cue-matched",
        cueId: "cue_advance_1",
        slideId: "slide_cue_1"
      }
    ]);
  });

  it("같은 slide visit에서는 cueId별 1회만 실행한다", () => {
    const engine = createCueEngine();
    const match = createMatch({
      cueId: "cue_once_1",
      action: { type: "animation", animationId: "anim_once" }
    });

    expect(engine.executeMatches([match])).toHaveLength(1);
    expect(engine.executeMatches([match])).toEqual([]);
  });

  it("slide visit reset 이후 같은 cue를 다시 실행할 수 있다", () => {
    const engine = createCueEngine();
    const match = createMatch({
      cueId: "cue_revisit_1",
      action: { type: "highlight", elementId: "el_target" }
    });

    engine.executeMatches([match]);
    engine.resetForSlideVisit();

    expect(engine.executeMatches([match])).toEqual([
      {
        type: "set-highlight",
        active: true,
        cueId: "cue_revisit_1",
        elementId: "el_target",
        slideId: "slide_cue_1"
      }
    ]);
  });

  it("여러 match는 입력 순서대로 실행한다", () => {
    const engine = createCueEngine();

    expect(
      engine
        .executeMatches([
          createMatch({ cueId: "cue_first_1" }),
          createMatch({ cueId: "cue_second_1" })
        ])
        .map((command) => command.cueId)
    ).toEqual(["cue_first_1", "cue_second_1"]);
  });
});

function createMatch(options: {
  cueId: string;
  action?: CueMatch["action"];
}): CueMatch {
  return {
    cueId: options.cueId,
    slideId: "slide_cue_1",
    action:
      options.action ?? {
        type: "highlight",
        elementId: "el_target"
      },
    matchedPhrase: "핵심 지표",
    method: "substring",
    score: 1,
    atMs: 1000
  };
}
