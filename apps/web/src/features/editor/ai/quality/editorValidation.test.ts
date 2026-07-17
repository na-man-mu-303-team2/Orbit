import type { Deck } from "@orbit/shared";
import { describe, expect, it } from "vitest";
import { getEditorValidationItems } from "./editorValidation";

const designPackDeck: Deck = {
  deckId: "deck_design_pack_quality",
  projectId: "project_demo_1",
  title: "Design Pack Quality",
  version: 1,
  targetDurationMinutes: 7,
  metadata: {
    language: "ko",
    locale: "ko-KR",
    sourceType: "ai",
    generatedBy: "ai",
    audience: "general",
    purpose: "inform",
    tone: "friendly",
    createdFrom: {
      topic: "Design Pack Quality",
      references: [{ fileId: "file_reference_1" }],
      designReferences: []
    }
  },
  canvas: {
    preset: "wide-16-9",
    width: 1920,
    height: 1080,
    aspectRatio: "16:9"
  },
  theme: {
    name: "brandlogy-modern",
    fontFamily: "Pretendard",
    backgroundColor: "#FFFFFF",
    textColor: "#111827",
    accentColor: "#2563EB",
    palette: {
      primary: "#2563EB",
      secondary: "#0F766E",
      surface: "#FFFFFF",
      muted: "#F3F4F6",
      border: "#D1D5DB"
    },
    typography: {
      headingFontFamily: "Pretendard",
      bodyFontFamily: "Pretendard",
      titleSize: 48,
      headingSize: 34,
      bodySize: 20,
      captionSize: 16
    },
    effects: {
      borderRadius: 8
    }
  },
  slides: [
    {
      slideId: "slide_1",
      order: 1,
      title: "Visual Plan",
      thumbnailUrl: "",
      estimatedSeconds: 60,
      style: {
        layout: "title-content",
        backgroundColor: "#FFFFFF",
        textColor: "#111827",
        accentColor: "#2563EB"
      },
      speakerNotes:
        "이 슬라이드는 Design Pack 결과의 이미지 계획과 편집 가능 슬롯을 설명합니다.",
      elements: [
        {
          elementId: "el_1_design_pack_background",
          type: "rect",
          role: "background",
          x: 0,
          y: 0,
          width: 1920,
          height: 1080,
          rotation: 0,
          opacity: 1,
          zIndex: 0,
          locked: true,
          visible: true,
          props: {
            fill: "#FFFFFF",
            stroke: "transparent",
            strokeWidth: 0,
            borderRadius: 0
          }
        },
        {
          elementId: "el_1_title",
          type: "text",
          role: "title",
          x: 120,
          y: 120,
          width: 1040,
          height: 96,
          rotation: 0,
          opacity: 1,
          zIndex: 4,
          locked: false,
          visible: true,
          props: {
            text: "Visual Plan",
            fontFamily: "Pretendard",
            fontSize: 48,
            fontWeight: "bold",
            color: "#111827",
            align: "left",
            verticalAlign: "top",
            lineHeight: 1.12
          }
        },
        {
          elementId: "el_1_body",
          type: "text",
          role: "body",
          x: 120,
          y: 260,
          width: 760,
          height: 156,
          rotation: 0,
          opacity: 1,
          zIndex: 4,
          locked: false,
          visible: true,
          props: {
            text: "AI 이미지 구조를 선택한 경우에도 실제 파일은 만들지 않고, Deck JSON에 교체 가능한 visual slot과 rationale을 남깁니다.",
            fontFamily: "Pretendard",
            fontSize: 22,
            fontWeight: "normal",
            color: "#334155",
            align: "left",
            verticalAlign: "top",
            lineHeight: 1.14
          }
        },
        {
          elementId: "el_1_design_pack_visual_media_placeholder",
          type: "rect",
          role: "media",
          x: 1114,
          y: 250,
          width: 686,
          height: 420,
          rotation: 0,
          opacity: 1,
          zIndex: 4,
          locked: false,
          visible: true,
          props: {
            fill: "#F3F4F6",
            stroke: "#2563EB",
            strokeWidth: 2,
            borderRadius: 8
          }
        }
      ],
      keywords: [],
      semanticCues: [],
      animations: [],
      actions: [],
      aiNotes: {
        emphasisPoints: ["visual plan"],
        sourceEvidence: [],
        visualPlan: {
          visualType: "layout",
          imageNeeded: true,
          imageSourcePolicy: "ai-generated",
          reason: "AI visual plan slot is intentionally editable."
        },
        sourceLedger: [
          {
            claim: "visual plan",
            source: "file_reference_1",
            sourceType: "uploaded",
            confidence: 0.8,
            usedInSlideId: "slide_1"
          }
        ],
        timingPlan: {
          charsPerMinute: 260,
          targetTotalChars: 20,
          targetSlideCount: 1,
          targetSeconds: 60,
          targetSpeakerNotesChars: 20,
          actualSpeakerNotesChars: 72
        }
      }
    }
  ]
};

describe("editor design-pack validation", () => {
  it("accepts generated text fitting and expected media placeholders", () => {
    const items = getEditorValidationItems(designPackDeck);

    expect(items).not.toContainEqual(
      expect.objectContaining({ issue: "textOverflow" })
    );
    expect(items).not.toContainEqual(
      expect.objectContaining({ issue: "mediaSlotMissing" })
    );
    expect(items).not.toContainEqual(
      expect.objectContaining({
        elementId: "el_1_design_pack_visual_media_placeholder"
      })
    );
  });

  it("accepts hybrid official asset placeholders before resolution", () => {
    const deck = structuredClone(designPackDeck);
    const visualPlan = deck.slides[0].aiNotes?.visualPlan;
    if (!visualPlan) throw new Error("visual plan missing");
    visualPlan.imageSourcePolicy = "official-assets";

    expect(getEditorValidationItems(deck)).not.toContainEqual(
      expect.objectContaining({
        elementId: "el_1_design_pack_visual_media_placeholder"
      })
    );
  });

  it("reports undersized planned media with the canonical hierarchy issue", () => {
    const deck = structuredClone(designPackDeck);
    deck.metadata.presentationProfile = "general-inform";
    const media = deck.slides[0].elements.find(
      (element) => element.elementId === "el_1_design_pack_visual_media_placeholder"
    );
    if (!media) throw new Error("media placeholder missing");
    media.width = 420;
    media.height = 180;

    expect(getEditorValidationItems(deck, deck.slides[0])).toContainEqual(
      expect.objectContaining({ issue: "VISUAL_HIERARCHY_WEAK" })
    );
  });

  it("measures body occupancy without using the title bounds", () => {
    const deck = structuredClone(designPackDeck);
    deck.metadata.presentationProfile = "general-inform";
    const slide = deck.slides[0];
    if (!slide.aiNotes?.visualPlan) throw new Error("visual plan missing");
    slide.aiNotes.visualPlan.imageNeeded = false;
    slide.elements = slide.elements.filter((element) => element.role !== "media");
    const body = slide.elements.find((element) => element.role === "body");
    if (!body) throw new Error("body missing");
    Object.assign(body, { x: 120, y: 420, width: 300, height: 100 });

    expect(getEditorValidationItems(deck, slide)).toContainEqual(
      expect.objectContaining({ issue: "VISUAL_HIERARCHY_WEAK" })
    );
  });

  it("accepts generated media geometry and warns after an off-grid edit", () => {
    const deck = structuredClone(designPackDeck);
    deck.metadata.presentationProfile = "general-inform";
    const slide = deck.slides[0];
    const title = slide.elements.find((element) => element.role === "title");
    const body = slide.elements.find((element) => element.role === "body");
    const media = slide.elements.find((element) => element.role === "media");
    if (!title || !body || !media) throw new Error("quality fixture elements missing");
    Object.assign(title, { x: 120, y: 120, width: 970, height: 112 });
    Object.assign(body, { x: 120, y: 256, width: 970, height: 360 });
    Object.assign(media, { x: 1114, y: 256, width: 686, height: 520 });

    expect(getEditorValidationItems(deck, slide)).not.toContainEqual(
      expect.objectContaining({ issue: "GRID_ALIGNMENT_INCONSISTENT" })
    );

    Object.assign(media, {
      x: 511.8055687730131,
      y: 31.80522661562667,
      width: 1348.9886308346456,
      height: 1022.556979641422
    });
    expect(getEditorValidationItems(deck, slide)).toContainEqual(
      expect.objectContaining({ issue: "GRID_ALIGNMENT_INCONSISTENT" })
    );
  });

  it("accepts program-v2 text inset inside a grid-aligned content panel", () => {
    const deck = structuredClone(designPackDeck);
    deck.metadata.presentationProfile = "general-inform";
    const slide = deck.slides[0];
    const title = slide.elements.find((element) => element.role === "title");
    const body = slide.elements.find((element) => element.role === "body");
    const media = slide.elements.find((element) => element.role === "media");
    const background = slide.elements.find((element) => element.role === "background");
    if (!title || !body || !media || !background) {
      throw new Error("quality fixture elements missing");
    }
    Object.assign(title, { x: 120, y: 120, width: 970, height: 112 });
    Object.assign(body, { x: 148, y: 288, width: 914, height: 296 });
    Object.assign(media, { x: 1114, y: 256, width: 686, height: 520 });
    const panel = structuredClone(background);
    Object.assign(panel, {
      elementId: "el_1_program_v2_card_field",
      role: "decoration",
      x: 120,
      y: 256,
      width: 970,
      height: 360,
      zIndex: Math.max(0, body.zIndex - 1),
      locked: false
    });
    slide.elements.push(panel);

    expect(getEditorValidationItems(deck, slide)).not.toContainEqual(
      expect.objectContaining({ issue: "GRID_ALIGNMENT_INCONSISTENT" })
    );
  });

  it("links editor overflow repair items to TEXT_OVERFLOW", () => {
    const deck = structuredClone(designPackDeck);
    const body = deck.slides[0].elements.find(
      (element) => element.elementId === "el_1_body"
    );
    if (!body || body.type !== "text") throw new Error("body missing");
    body.height = 20;

    expect(getEditorValidationItems(deck, deck.slides[0])).toContainEqual(
      expect.objectContaining({
        issue: "textOverflow",
        canonicalIssue: "TEXT_OVERFLOW"
      })
    );
  });

  it("allows a two-line design-pack title and warns at three lines", () => {
    const deck = structuredClone(designPackDeck);
    deck.metadata.presentationProfile = "product-launch";
    const slide = deck.slides[0];
    const title = slide.elements.find(
      (element) => element.type === "text" && element.role === "title"
    );
    if (!title || title.type !== "text") throw new Error("title missing");
    title.props.text = "Nintendo Switch 2, 기대를 뛰어넘는 혁신적 하이브리드 콘솔";
    title.width = 970;

    expect(getEditorValidationItems(deck, slide)).not.toContainEqual(
      expect.objectContaining({ issue: "titleWrap" })
    );

    title.width = 360;
    expect(getEditorValidationItems(deck, slide)).toContainEqual(
      expect.objectContaining({ issue: "titleWrap" })
    );
  });

  it("uses the topmost local solid shape for text contrast", () => {
    const deck = structuredClone(designPackDeck);
    const slide = deck.slides[0];
    slide.elements.push(
      {
        elementId: "el_1_dark_card",
        type: "rect",
        role: "decoration",
        x: 100,
        y: 80,
        width: 1200,
        height: 180,
        rotation: 0,
        opacity: 1,
        zIndex: 3,
        locked: false,
        visible: true,
        props: {
          fill: "#5A3E9D",
          stroke: "transparent",
          strokeWidth: 0,
          borderRadius: 8
        }
      }
    );
    const title = slide.elements.find((element) => element.elementId === "el_1_title");
    if (!title || title.type !== "text") throw new Error("title missing");
    title.zIndex = 4;
    title.props.color = "#111827";

    const items = getEditorValidationItems(deck, slide);

    expect(items).toContainEqual(
      expect.objectContaining({
        elementId: "el_1_title",
        issue: "textContrast"
      })
    );
  });

  it("reports gradient or transparent local backgrounds as unverifiable", () => {
    const deck = structuredClone(designPackDeck);
    const slide = deck.slides[0];
    slide.elements.push({
      elementId: "el_1_gradient_card",
      type: "rect",
      role: "decoration",
      x: 100,
      y: 80,
      width: 1200,
      height: 180,
      rotation: 0,
      opacity: 0.8,
      zIndex: 3,
      locked: false,
      visible: true,
      props: {
        fill: {
          type: "linear-gradient",
          angle: 0,
          stops: [
            { offset: 0, color: "#111827", opacity: 1 },
            { offset: 1, color: "#5A3E9D", opacity: 1 }
          ]
        },
        stroke: "transparent",
        strokeWidth: 0,
        borderRadius: 8
      }
    });

    const items = getEditorValidationItems(deck, slide);

    expect(items).toContainEqual(
      expect.objectContaining({
        elementId: "el_1_title",
        issue: "contrastUnverifiable",
        severity: "risk"
      })
    );
  });

  it("validates the 80 percent speaker-note floor per slide", () => {
    const deck = structuredClone(designPackDeck);
    const slide = deck.slides[0];
    if (!slide.aiNotes?.timingPlan) throw new Error("timing plan missing");
    slide.aiNotes.timingPlan.targetSpeakerNotesChars = 100;
    slide.speakerNotes = "짧은 메모";

    const items = getEditorValidationItems(deck, slide);

    expect(items).toContainEqual(
      expect.objectContaining({
        issue: "speakerNotesShort",
        slideId: slide.slideId
      })
    );
  });

  it("uses synchronized design-pack speaker-note density codes", () => {
    const deck = structuredClone(designPackDeck);
    deck.metadata.presentationProfile = "general-inform";
    const slide = deck.slides[0];
    if (!slide.aiNotes?.timingPlan) throw new Error("timing plan missing");
    slide.aiNotes.timingPlan.targetSpeakerNotesChars = 100;

    slide.speakerNotes = "가".repeat(89);
    expect(getEditorValidationItems(deck, slide)).toContainEqual(
      expect.objectContaining({ issue: "SPEAKER_NOTES_SHORT" })
    );

    slide.speakerNotes = "가".repeat(111);
    expect(getEditorValidationItems(deck, slide)).toContainEqual(
      expect.objectContaining({ issue: "SPEAKER_NOTES_DENSE" })
    );
  });

  it("detects structural body duplication without matching distinct support", () => {
    const deck = structuredClone(designPackDeck);
    deck.metadata.presentationProfile = "general-inform";
    const slide = deck.slides[0];
    const body = slide.elements.find(
      (element) => element.type === "text" && element.role === "body"
    );
    if (!body || body.type !== "text") throw new Error("body missing");
    body.props.text = "Alpha evidence and beta evidence";
    for (const [index, text] of ["Alpha evidence", "beta evidence"].entries()) {
      slide.elements.push({
        ...structuredClone(body),
        elementId: `el_1_duplicate_${index + 1}`,
        y: body.y + (index + 1) * 80,
        props: { ...body.props, text }
      });
    }

    expect(getEditorValidationItems(deck, slide)).toContainEqual(
      expect.objectContaining({ issue: "CONTENT_DUPLICATED" })
    );

    body.props.text = "Evidence supports the decision";
    expect(
      getEditorValidationItems(deck, slide).filter(
        (item) => item.issue === "CONTENT_DUPLICATED"
      )
    ).toHaveLength(0);
  });

  it("mirrors presentation profile quality issue codes", () => {
    const deck = structuredClone(designPackDeck);
    deck.metadata.presentationProfile = "proposal";
    const slide = structuredClone(deck.slides[0]);
    slide.slideId = "slide_2";
    slide.order = 2;
    slide.title = "현황";
    slide.aiNotes = structuredClone(slide.aiNotes);
    if (!slide.aiNotes?.visualPlan) throw new Error("visual plan missing");
    slide.aiNotes.visualPlan.visualType = "layout";
    for (const element of slide.elements) {
      element.elementId = element.elementId.replace("el_1_", "el_2_");
      if (element.type !== "text") continue;
      if (element.role === "title") {
        element.x = 133;
        element.props.text = "현황";
        element.props.fontFamily = "Heading Test";
      }
      if (element.role === "body") {
        element.props.text = Array.from(
          { length: 7 },
          (_, index) => `항목 ${index + 1}`
        ).join("\n");
        element.props.fontFamily = "Body Test";
        element.props.fontSize = 17;
        element.props.lineHeight = 1.1;
      }
    }
    const title = slide.elements.find(
      (element) => element.type === "text" && element.role === "title"
    );
    const media = slide.elements.find((element) => element.role === "media");
    if (!title || title.type !== "text" || !media) {
      throw new Error("fixture elements missing");
    }
    slide.elements.push({
      ...structuredClone(title),
      elementId: "el_2_caption_test",
      role: "caption",
      props: {
        ...title.props,
        text: "보조 설명",
        fontFamily: "Caption Test",
        fontSize: 16,
        lineHeight: 1.1
      }
    });
    slide.elements.push({
      ...structuredClone(media),
      elementId: "el_2_secondary_media",
      x: media.x + 120
    });
    deck.slides.push(slide);

    const issues = new Set(
      getEditorValidationItems(deck).map((item) => item.issue)
    );

    for (const issue of [
      "ACTION_TITLE_WEAK",
      "BODY_CONTENT_DENSE",
      "FONT_SIZE_BELOW_MINIMUM",
      "FONT_FAMILY_OVERUSED",
      "LINE_HEIGHT_OUT_OF_RANGE",
      "VISUAL_HIERARCHY_WEAK",
      "CTA_MISSING",
      "GRID_ALIGNMENT_INCONSISTENT"
    ] as const) {
      expect(issues.has(issue)).toBe(true);
    }
  });

  it("mirrors the shared phase-three semantic QA issue codes", () => {
    const deck = structuredClone(designPackDeck);
    deck.metadata.presentationProfile = "proposal";
    const first = deck.slides[0];
    if (!first.aiNotes?.visualPlan) throw new Error("fixture visual plan missing");
    first.aiNotes.emphasisPoints = [
      "고객 전환율을 높입니다",
      "구매 여정을 단축합니다"
    ];
    first.aiNotes.sourceLedger = [
      {
        claim: "서버 지연 시간은 20ms입니다",
        source: "report",
        sourceType: "uploaded",
        confidence: 0.9,
        usedInSlideId: first.slideId
      }
    ];
    first.aiNotes.visualPlan.imageSourcePolicy = "public-assets";
    first.aiNotes.visualPlan.asset = {
      fileId: "file_public",
      provider: "openverse"
    };
    first.elements.push({
      elementId: "el_semantic_image",
      type: "image",
      role: "media",
      x: 1100,
      y: 500,
      width: 640,
      height: 360,
      rotation: 0,
      opacity: 1,
      zIndex: 20,
      locked: false,
      visible: true,
      props: {
        src: "/api/v1/projects/project_demo/assets/file_public/content",
        alt: "unrelated mountain",
        fit: "cover",
        focusX: 0.5,
        focusY: 0.5
      }
    });
    deck.slides.push({
      ...structuredClone(first),
      slideId: "slide_semantic_duplicate",
      order: 2
    });
    const issues = new Set(
      getEditorValidationItems(deck).map((item) => item.issue)
    );
    expect(Array.from(issues)).toEqual(expect.arrayContaining([
      "SLIDE_MESSAGE_MULTIPLE",
      "NARRATIVE_FLOW_WEAK",
      "EVIDENCE_MISMATCH",
      "IMAGE_RELEVANCE_WEAK",
      "IMAGE_LICENSE_MISSING"
    ]));
  });

  it("shows the current slide semantic issue in the editor panel", () => {
    const deck = structuredClone(designPackDeck);
    deck.metadata.presentationProfile = "proposal";
    const slide = deck.slides[0];
    slide.speakerNotes =
      "안녕하세요. 오늘은 원격 근무 환경의 집중력 저하를 설명합니다. " +
      "업무 도구 차이는 소통 지연과 혼선을 만듭니다. " +
      "안녕하세요, 오늘은 원격 팀의 업무 공간 개선안을 제안합니다.";

    expect(getEditorValidationItems(deck, slide)).toContainEqual(
      expect.objectContaining({
        issue: "SPEAKER_NOTES_REPEATED",
        slideId: slide.slideId
      })
    );
  });

  it("accepts an intentional multi-line program-v2 focal label", () => {
    const deck = structuredClone(designPackDeck);
    const slide = deck.slides[0];
    slide.elements = [
      {
        elementId: "el_1_program_v2_hub",
        type: "text",
        role: "highlight",
        x: 724,
        y: 384,
        width: 472,
        height: 256,
        rotation: 0,
        opacity: 1,
        zIndex: 5,
        locked: false,
        visible: true,
        props: {
          text: "3가지\n핵심 축",
          fontFamily: "Pretendard",
          fontSize: 56,
          fontWeight: "bold",
          color: "#111827",
          align: "center",
          verticalAlign: "middle",
          lineHeight: 1.2
        }
      }
    ];

    expect(
      getEditorValidationItems(deck, slide).filter((item) => item.issue === "labelWrap")
    ).toEqual([]);
  });
});
