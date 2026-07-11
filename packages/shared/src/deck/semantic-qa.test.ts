import { describe, expect, it } from "vitest";
import { deckSchema } from "./deck.schema";
import { getSemanticQaIssues, repairSemanticQaOnce } from "./semantic-qa";

describe("semantic QA", () => {
  it("detects multiple messages, weak flow, and evidence mismatch", () => {
    const deck = semanticDeck();
    const codes = getSemanticQaIssues(deck).map((issue) => issue.code);

    expect(codes).toContain("SLIDE_MESSAGE_MULTIPLE");
    expect(codes).toContain("NARRATIVE_FLOW_WEAK");
    expect(codes).toContain("EVIDENCE_MISMATCH");
  });

  it("performs only deterministic message and image-alt repair", () => {
    const deck = semanticDeck();
    const repaired = repairSemanticQaOnce(deck);

    expect(repaired.slides[0].aiNotes?.emphasisPoints).toHaveLength(1);
    const image = repaired.slides[0].elements.find(
      (element) => element.type === "image"
    );
    expect(image?.props.alt).toContain("고객 전환율");
  });

  it("does not apply phase-three semantic QA to legacy decks", () => {
    const deck = semanticDeck();
    delete deck.metadata.presentationProfile;

    expect(getSemanticQaIssues(deck)).toEqual([]);
  });

  it("accepts a distinct claim that supports the primary message", () => {
    const deck = semanticDeck();
    for (const slide of deck.slides) {
      if (!slide.aiNotes) throw new Error("semantic fixture notes missing");
      slide.aiNotes.emphasisPoints = ["고객 전환율을 높입니다"];
      slide.aiNotes.sourceLedger = [
        {
          claim: "고객 전환율은 구매 단계 단축 후 18% 상승했습니다",
          source: "experiment",
          sourceType: "uploaded",
          confidence: 0.9,
          usedInSlideId: slide.slideId
        }
      ];
    }

    expect(getSemanticQaIssues(deck).map((issue) => issue.code)).not.toContain(
      "EVIDENCE_MISMATCH"
    );
  });
});

function semanticDeck() {
  return deckSchema.parse({
    deckId: "deck_semantic",
    projectId: "project_1",
    title: "Growth",
    version: 1,
    metadata: {
      language: "ko",
      locale: "ko-KR",
      sourceType: "ai",
      presentationProfile: "proposal"
    },
    canvas: {
      preset: "wide-16-9",
      width: 1920,
      height: 1080,
      aspectRatio: "16:9"
    },
    slides: [1, 2].map((order) => ({
      slideId: `slide_${order}`,
      order,
      title: "고객 전환율을 높입니다",
      style: {},
      elements: [
        {
          elementId: `el_${order}`,
          type: "image",
          role: "media",
          x: 120,
          y: 120,
          width: 640,
          height: 360,
          props: { src: "https://example.com/image.png", alt: "unrelated mountain" }
        }
      ],
      aiNotes: {
        emphasisPoints: ["고객 전환율을 높입니다", "구매 여정을 단축합니다"],
        visualPlan: {
          visualType: "image",
          imageNeeded: true,
          imageSourcePolicy: "ai-generated",
          reason: "고객 전환율 개선 과정을 보여줍니다"
        },
        sourceLedger: [
          {
            claim: "서버 지연 시간은 20ms입니다",
            source: "report",
            sourceType: "uploaded",
            confidence: 0.9,
            usedInSlideId: `slide_${order}`
          }
        ]
      }
    }))
  });
}
