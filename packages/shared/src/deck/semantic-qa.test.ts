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

  it("detects repeated speaker-note sentences across slides", () => {
    const deck = semanticDeck();
    const repeated =
      "이 문장은 발표 분량을 채우기 위한 반복이 아니라 반드시 한 번만 설명해야 하는 핵심 근거입니다.";
    deck.slides[0].speakerNotes = `${repeated} 첫 번째 장의 추가 설명입니다.`;
    deck.slides[1].speakerNotes = `${repeated} 두 번째 장의 추가 설명입니다.`;

    expect(getSemanticQaIssues(deck)).toContainEqual(
      expect.objectContaining({ code: "SPEAKER_NOTES_REPEATED" })
    );
  });

  it("detects a restated introduction within one speaker note", () => {
    const deck = semanticDeck();
    deck.slides[0].speakerNotes =
      "안녕하세요. 오늘은 원격 근무 환경의 집중력 저하를 설명합니다. " +
      "업무 도구 차이는 소통 지연과 혼선을 만듭니다. " +
      "안녕하세요, 오늘은 원격 팀의 업무 공간 개선안을 제안합니다.";

    expect(getSemanticQaIssues(deck)).toContainEqual(
      expect.objectContaining({ code: "SPEAKER_NOTES_REPEATED" })
    );
  });

  it("detects a lexical restatement within one speaker note", () => {
    const deck = semanticDeck();
    deck.slides[0].speakerNotes =
      "제안된 공간 운영안은 다음 분기 시범 운영부터 시작합니다. " +
      "사용자 피드백으로 운영 모델을 구체화합니다. " +
      "제안하는 공간 운영안은 다음 분기 시범 운영부터 시작합니다.";

    expect(getSemanticQaIssues(deck)).toContainEqual(
      expect.objectContaining({ code: "SPEAKER_NOTES_REPEATED" })
    );
  });

  it("detects a Korean product feature restatement", () => {
    const deck = semanticDeck();
    deck.slides[0].speakerNotes =
      "Nintendo Switch 2는 도킹 모드에서 4K 60fps를 지원하며, " +
      "휴대용 모드에서는 120fps 화면을 제공합니다. " +
      "더 큰 Joy-Con은 다양한 조작 방식을 지원합니다. " +
      "Nintendo Switch 2는 4K 60fps 도킹 모드와 휴대 모드의 " +
      "120fps 화면으로 게임 몰입감을 높입니다.";

    expect(getSemanticQaIssues(deck)).toContainEqual(
      expect.objectContaining({ code: "SPEAKER_NOTES_REPEATED" })
    );
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

  it("requires a logo element when the Brand Kit logo is locked", () => {
    const deck = semanticDeck();
    deck.metadata.brandKitSnapshot = {
      id: "brand_kit_1",
      organizationId: "organization_1",
      name: "ORBIT",
      version: 1,
      values: {
        logoAssetId: "file_logo",
        palette: {
          primary: "#2563EB",
          secondary: "#0F766E",
          background: "#FFFFFF",
          surface: "#FFFFFF",
          muted: "#E0F2FE",
          border: "#BAE6FD",
          text: "#0F172A",
          accentColor: "#F472B6"
        },
        forbiddenColors: [],
        typography: {
          headingFontFamily: "Pretendard",
          bodyFontFamily: "Pretendard",
          fallbackFamily: "Arial"
        },
        tone: "professional",
        mediaPolicy: "balanced",
        writingStyle: "",
        coverRules: "",
        footerRules: "",
        approvedAssetIds: [],
        lockedFields: ["logo"]
      }
    };

    expect(getSemanticQaIssues(deck).map((issue) => issue.code)).toContain(
      "BRAND_KIT_VIOLATION"
    );
    for (const slide of deck.slides) {
      slide.elements.push({
        elementId: `el_${slide.slideId}_brand_kit_logo`,
        type: "image",
        role: "footer",
        x: 1600,
        y: 88,
        width: 200,
        height: 64,
        rotation: 0,
        opacity: 1,
        zIndex: 1,
        locked: true,
        visible: true,
        props: {
          src: `/api/v1/projects/project_1/assets/file_logo/content`,
          alt: "ORBIT logo",
          fit: "contain",
          focusX: 0.5,
          focusY: 0.5
        }
      });
    }
    expect(getSemanticQaIssues(deck).map((issue) => issue.code)).not.toContain(
      "BRAND_KIT_VIOLATION"
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
