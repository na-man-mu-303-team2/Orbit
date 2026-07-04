import { deckSchema, type Deck } from "@orbit/shared";
import { describe, expect, it } from "vitest";

import {
  createDeckCueProvider,
  createInternalCueProvider,
  createPresenterCueProvider,
  getCuePhrasesForSlide,
  getCueReferencedAnimationIds,
  hasEnabledAdvanceCue
} from "./cueProvider";

type SpeechCueInput = {
  cueId: string;
  trigger: {
    phrases: string[];
    scriptAnchor?: {
      start: number;
      end: number;
    };
  };
  action: Deck["slides"][number]["speechCues"][number]["action"];
  source: "ai" | "user";
  enabled?: boolean;
};

describe("cueProvider", () => {
  it("Deck speechCues가 없으면 빈 provider로 동작한다", () => {
    const deck = createCueDeck({ speechCues: [] });
    const provider = createDeckCueProvider(deck);

    expect(provider.getCues("slide_cue_1")).toEqual([]);
    expect(getCuePhrasesForSlide(provider, "slide_cue_1")).toEqual([]);
    expect(getCueReferencedAnimationIds(provider, "slide_cue_1")).toEqual([]);
    expect(hasEnabledAdvanceCue(provider, "slide_cue_1")).toBe(false);
  });

  it("enabled cue만 반환하고 helper 출력을 파생한다", () => {
    const deck = createCueDeck({
      speechCues: [
        {
          cueId: "cue_highlight_1",
          trigger: { phrases: ["핵심 지표"] },
          action: { type: "highlight", elementId: "el_cue_body" },
          source: "user"
        },
        {
          cueId: "cue_animation_1",
          trigger: { phrases: ["전환 효과"] },
          action: { type: "animation", animationId: "anim_cue_body" },
          source: "ai"
        },
        {
          cueId: "cue_advance_1",
          trigger: { phrases: ["다음으로"] },
          action: { type: "advance-slide" },
          source: "user"
        },
        {
          cueId: "cue_disabled_1",
          trigger: { phrases: ["무시"] },
          action: { type: "animation", animationId: "anim_cue_body" },
          source: "user",
          enabled: false
        }
      ]
    });
    const provider = createDeckCueProvider(deck);

    expect(provider.getCues("slide_cue_1").map((cue) => cue.cueId)).toEqual([
      "cue_highlight_1",
      "cue_animation_1",
      "cue_advance_1"
    ]);
    expect(getCuePhrasesForSlide(provider, "slide_cue_1")).toEqual([
      "핵심 지표",
      "전환 효과",
      "다음으로"
    ]);
    expect(getCueReferencedAnimationIds(provider, "slide_cue_1")).toEqual([
      "anim_cue_body"
    ]);
    expect(hasEnabledAdvanceCue(provider, "slide_cue_1")).toBe(true);
  });

  it("Deck cue가 있으면 내부 fallback보다 Deck cue를 우선한다", () => {
    const deck = createCueDeck({
      speechCues: [
        {
          cueId: "cue_deck_1",
          trigger: { phrases: ["덱 큐"] },
          action: { type: "highlight", elementId: "el_cue_body" },
          source: "user"
        }
      ]
    });
    const provider = createPresenterCueProvider({
      deck,
      internalProvider: createInternalCueProvider([
        {
          slideId: "slide_cue_1",
          cueId: "cue_internal_1",
          trigger: { phrases: ["내부 큐"] },
          action: { type: "animation", animationId: "anim_cue_body" },
          source: "ai"
        }
      ])
    });

    expect(provider.getCues("slide_cue_1").map((cue) => cue.cueId)).toEqual([
      "cue_deck_1"
    ]);
  });

  it("Deck enabled cue가 없으면 내부 fallback을 사용한다", () => {
    const deck = createCueDeck({
      speechCues: [
        {
          cueId: "cue_disabled_deck_1",
          trigger: { phrases: ["비활성"] },
          action: { type: "highlight", elementId: "el_cue_body" },
          source: "user",
          enabled: false
        }
      ]
    });
    const provider = createPresenterCueProvider({
      deck,
      internalProvider: createInternalCueProvider([
        {
          slideId: "slide_cue_1",
          cueId: "cue_internal_1",
          trigger: { phrases: ["내부 큐"] },
          action: { type: "animation", animationId: "anim_cue_body" },
          source: "ai"
        }
      ])
    });

    expect(provider.getCues("slide_cue_1").map((cue) => cue.cueId)).toEqual([
      "cue_internal_1"
    ]);
  });

  it("legacy slide.actions는 provider 출력에 영향을 주지 않는다", () => {
    const deck = createCueDeck({
      actions: [
        {
          actionId: "act_legacy_1",
          trigger: { kind: "cue", cue: "강조" },
          effect: { kind: "play-animation", animationId: "anim_cue_body" }
        }
      ],
      speechCues: []
    });
    const provider = createDeckCueProvider(deck);

    expect(provider.getCues("slide_cue_1")).toEqual([]);
  });
});

function createCueDeck(options: {
  actions?: Deck["slides"][number]["actions"];
  speechCues: SpeechCueInput[];
}) {
  return deckSchema.parse({
    deckId: "deck_cue_provider",
    projectId: "project_cue_provider",
    title: "Cue Provider",
    version: 1,
    canvas: {
      preset: "wide-16-9",
      width: 1920,
      height: 1080,
      aspectRatio: "16:9"
    },
    slides: [
      {
        slideId: "slide_cue_1",
        order: 1,
        title: "Cue slide",
        speakerNotes: "핵심 지표를 설명하고 다음으로 넘어갑니다.",
        style: {},
        elements: [
          {
            elementId: "el_cue_body",
            type: "text",
            role: "body",
            x: 10,
            y: 10,
            width: 400,
            height: 80,
            props: { text: "Cue body" }
          }
        ],
        keywords: [],
        animations: [
          {
            animationId: "anim_cue_body",
            elementId: "el_cue_body",
            type: "fade-in",
            order: 1
          }
        ],
        actions: options.actions ?? [],
        speechCues: options.speechCues
      }
    ]
  });
}
