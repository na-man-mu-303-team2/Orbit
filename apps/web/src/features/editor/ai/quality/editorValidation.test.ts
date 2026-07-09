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
          x: 1110,
          y: 250,
          width: 520,
          height: 220,
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
});
