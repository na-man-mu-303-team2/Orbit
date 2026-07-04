import { deckSchema, type Deck } from "@orbit/shared";
import { p0AnimationDeck } from "../../presenter/__fixtures__/animationDeck";

export const p5CueFixtureDeck: Deck = deckSchema.parse({
  ...p0AnimationDeck,
  deckId: "deck_p5_cues",
  title: "P5 발화 큐 검증 덱",
  slides: p0AnimationDeck.slides.map((slide, index) =>
    index === 0
      ? {
          ...slide,
          speechCues: [
            {
              cueId: "cue_p5_highlight_body",
              trigger: {
                phrases: ["본문 강조"]
              },
              action: {
                type: "highlight",
                elementId: "el_body"
              },
              source: "user"
            },
            {
              cueId: "cue_p5_animate_image",
              trigger: {
                phrases: ["이미지 확대"]
              },
              action: {
                type: "animation",
                animationId: "anim_image_zoom_in"
              },
              source: "user"
            },
            {
              cueId: "cue_p5_advance_gate",
              trigger: {
                phrases: ["다음 장으로"]
              },
              action: {
                type: "advance-slide"
              },
              source: "user"
            },
            {
              cueId: "cue_p5_disabled_chart",
              trigger: {
                phrases: ["차트 숨김"]
              },
              action: {
                type: "animation",
                animationId: "anim_chart_zoom_out"
              },
              source: "user",
              enabled: false
            }
          ]
        }
      : slide
  )
});
