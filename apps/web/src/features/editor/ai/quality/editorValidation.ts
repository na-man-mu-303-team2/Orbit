import type { Deck, DeckElement, Slide, TextElementProps } from "@orbit/shared";
import { getSemanticQaIssues } from "@orbit/shared";
import {
  getKonvaFontStyle,
  getPrimaryTextRun,
  getTextElementText,
  measureTextContentBounds
} from "../../canvas/text/textLayout";

const editorTextOverlapWarningRatio = 0.15;
const editorDuplicateTextMinimumLength = 6;
const presentationGridColumnCount = 12;
const presentationGridColumnWidth = 118;
const presentationGridGutter = 24;
const presentationGridStep = presentationGridColumnWidth + presentationGridGutter;
const presentationGridSafeX = 120;
const presentationGridSpacing = 8;
const presentationGridTolerance = 4;

export type EditorValidationItem = {
  elementId?: string;
  elementIds?: string[];
  issue?:
    | "textOverflow"
    | "titleWrap"
    | "labelWrap"
    | "speakerNotesShort"
    | "textContrast"
    | "contrastUnverifiable"
    | "mediaSlotMissing"
    | "sourceLedgerMissing"
    | "slideCountMismatch"
    | "ACTION_TITLE_WEAK"
    | "BODY_CONTENT_DENSE"
    | "FONT_SIZE_BELOW_MINIMUM"
    | "FONT_FAMILY_OVERUSED"
    | "LINE_HEIGHT_OUT_OF_RANGE"
    | "VISUAL_HIERARCHY_WEAK"
    | "CTA_MISSING"
    | "GRID_ALIGNMENT_INCONSISTENT"
    | "CONTENT_DUPLICATED"
    | "SPEAKER_NOTES_SHORT"
    | "SPEAKER_NOTES_DENSE"
    | "SLIDE_MESSAGE_MULTIPLE"
    | "NARRATIVE_FLOW_WEAK"
    | "EVIDENCE_MISMATCH"
    | "IMAGE_RELEVANCE_WEAK"
    | "BRAND_KIT_VIOLATION"
    | "IMAGE_LICENSE_MISSING";
  level?: "warning";
  message: string;
  slideId?: string;
  severity: "warning" | "risk";
};

export function getEditorValidationItems(
  deck: Deck,
  slide?: Slide
): EditorValidationItem[] {
  const slides = slide ? [slide] : deck.slides;
  const slideItems = slides.flatMap((targetSlide) =>
    getEditorSlideValidationItems(deck, targetSlide)
  );
  return slide ? slideItems : [...getEditorDeckValidationItems(deck), ...slideItems];
}

function getEditorDeckValidationItems(deck: Deck): EditorValidationItem[] {
  const items: EditorValidationItem[] = [];
  const presentationRules = Boolean(deck.metadata.presentationProfile);
  const timingPlan = deck.slides.find(
    (slide) => slide.aiNotes?.timingPlan
  )?.aiNotes?.timingPlan;

  if (timingPlan?.targetSlideCount) {
    const slideCount = deck.slides.length;
    if (
      slideCount < Math.max(1, timingPlan.targetSlideCount - 1) ||
      slideCount > timingPlan.targetSlideCount + 2
    ) {
      items.push({
        issue: "slideCountMismatch",
        message: `발표 시간 기준 권장 장수는 ${timingPlan.targetSlideCount}장인데 현재 ${slideCount}장입니다.`,
        severity: "warning"
      });
    }
  }

  const targetTotalChars = timingPlan?.targetTotalChars ?? 0;
  if (targetTotalChars > 0) {
    const actualTotalChars = deck.slides.reduce(
      (total, slide) => total + countSpokenChars(slide.speakerNotes),
      0
    );
    const charsPerMinute = timingPlan?.charsPerMinute ?? 0;
    const minimumTotalChars = Math.round(
      deck.targetDurationMinutes * charsPerMinute * 0.75
    );
    const maximumTotalChars = Math.round(
      deck.targetDurationMinutes * charsPerMinute * 0.85
    );
    if (presentationRules && minimumTotalChars > 0 && actualTotalChars < minimumTotalChars) {
      items.push({
        issue: "SPEAKER_NOTES_SHORT",
        message: `전체 실제 발화 시간이 발표 제한 시간의 75%보다 짧습니다. 최소 ${minimumTotalChars}자 대비 현재 ${actualTotalChars}자입니다.`,
        severity: "warning"
      });
    } else if (
      presentationRules &&
      maximumTotalChars > 0 &&
      actualTotalChars > maximumTotalChars
    ) {
      items.push({
        issue: "SPEAKER_NOTES_DENSE",
        message: `전체 실제 발화 시간이 발표 제한 시간의 85%를 초과합니다. 최대 ${maximumTotalChars}자 대비 현재 ${actualTotalChars}자입니다.`,
        severity: "warning"
      });
    } else if (!presentationRules && actualTotalChars < Math.round(targetTotalChars * 0.8)) {
      items.push({
        issue: "speakerNotesShort",
        message: `발표자 노트가 발표 시간 기준보다 짧습니다. 목표 ${targetTotalChars}자 대비 현재 ${actualTotalChars}자입니다.`,
        severity: "warning"
      });
    }
  }

  for (const slide of deck.slides) {
    if (slide.aiNotes?.visualPlan?.imageNeeded && !hasVisibleVisualSlot(slide)) {
      items.push({
        issue: "mediaSlotMissing",
        message: "이미지/시각 자료 정책이 선택됐지만 보이는 visual slot이 없습니다.",
        severity: "warning",
        slideId: slide.slideId
      });
    }

    if (
      slide.aiNotes?.visualPlan &&
      (!slide.aiNotes.sourceLedger || slide.aiNotes.sourceLedger.length === 0)
    ) {
      items.push({
        issue: "sourceLedgerMissing",
        message: "핵심 주장에 대한 sourceLedger가 필요합니다.",
        severity: "warning",
        slideId: slide.slideId
      });
    }
  }

  items.push(...getEditorPresentationDeckValidationItems(deck));
  items.push(
    ...getSemanticQaIssues(deck).map((issue) => ({
      issue: issue.code as EditorValidationItem["issue"],
      message: issue.message,
      severity: "warning" as const,
      slideId: slideIdFromIssuePath(deck, issue.path)
    }))
  );

  return items;
}

function slideIdFromIssuePath(deck: Deck, path: string) {
  const match = path.match(/^slides\.(\d+)/);
  return match ? deck.slides[Number(match[1])]?.slideId : undefined;
}

function getEditorSlideValidationItems(
  deck: Deck,
  slide: Slide
): EditorValidationItem[] {
  const backgroundColor = slide.style.backgroundColor ?? deck.theme.backgroundColor;
  const items: EditorValidationItem[] = [];
  const targetSpeakerNotesChars = slide.aiNotes?.timingPlan?.targetSpeakerNotesChars ?? 0;
  const actualSpeakerNotesChars = countSpokenChars(slide.speakerNotes);
  const presentationRules = Boolean(deck.metadata.presentationProfile);

  if (
    presentationRules &&
    targetSpeakerNotesChars > 0 &&
    actualSpeakerNotesChars < Math.round(targetSpeakerNotesChars * 0.7)
  ) {
    items.push({
      issue: "SPEAKER_NOTES_SHORT",
      message: `발표자 메모가 장표별 발화 목표의 70%보다 짧습니다. 목표 ${targetSpeakerNotesChars}자, 현재 ${actualSpeakerNotesChars}자입니다.`,
      slideId: slide.slideId,
      severity: "warning"
    });
  } else if (
    presentationRules &&
    targetSpeakerNotesChars > 0 &&
    actualSpeakerNotesChars > Math.round(targetSpeakerNotesChars * 1.15)
  ) {
    items.push({
      issue: "SPEAKER_NOTES_DENSE",
      message: `발표자 메모가 장표별 발화 목표의 115%를 초과합니다. 목표 ${targetSpeakerNotesChars}자, 현재 ${actualSpeakerNotesChars}자입니다.`,
      slideId: slide.slideId,
      severity: "warning"
    });
  } else if (
    !presentationRules &&
    targetSpeakerNotesChars > 0 &&
    actualSpeakerNotesChars < Math.round(targetSpeakerNotesChars * 0.8)
  ) {
    items.push({
      issue: "speakerNotesShort",
      message: `발표자 메모가 슬라이드 목표 분량의 80%보다 짧습니다. 목표 ${targetSpeakerNotesChars}자, 현재 ${countSpokenChars(slide.speakerNotes)}자입니다.`,
      slideId: slide.slideId,
      severity: "warning"
    });
  }

  for (const element of slide.elements) {
    if (!element.visible) continue;

    if (
      element.elementId.endsWith("_media_placeholder") &&
      !isExpectedEditorMediaPlaceholder(slide)
    ) {
      items.push({
        elementId: element.elementId,
        message: "이미지 자리 표시자가 남아 있습니다.",
        severity: "warning"
      });
    }

    if (
      (element.type === "image" || element.type === "svg") &&
      !element.props.alt.trim()
    ) {
      items.push({
        elementId: element.elementId,
        message: "이미지 대체 텍스트가 비어 있습니다.",
        severity: "warning"
      });
    }

    if (element.type === "chart" && element.props.data.length === 0) {
      items.push({
        elementId: element.elementId,
        message: "차트 데이터가 비어 있습니다.",
        severity: "warning"
      });
    }

    if (element.type === "text") {
      if (isEditorTextOverflowing(deck, slide, element)) {
        items.push({
          elementId: element.elementId,
          issue: "textOverflow",
          message: "텍스트가 상자 높이를 넘을 수 있습니다.",
          severity: "warning"
        });
      }

      if (isEditorTitleTextWrapped(deck, slide, element)) {
        items.push({
          elementId: element.elementId,
          issue: "titleWrap",
          message: "제목이 여러 줄로 줄바꿈되었습니다.",
          severity: "warning"
        });
      }

      if (isEditorLabelTextWrapped(deck, slide, element)) {
        items.push({
          elementId: element.elementId,
          issue: "labelWrap",
          message: "짧은 라벨이 여러 줄로 줄바꿈되었습니다.",
          severity: "warning"
        });
      }

      const color = element.props.color ?? slide.style.textColor ?? deck.theme.textColor;
      const effectiveBackground = getEffectiveTextBackground(
        slide,
        element,
        backgroundColor
      );

      if (effectiveBackground.kind === "unverifiable") {
        items.push({
          elementId: element.elementId,
          issue: "contrastUnverifiable",
          message: "이미지, 그라데이션 또는 반투명 배경의 텍스트 대비는 자동 검증할 수 없습니다.",
          severity: "risk"
        });
        continue;
      }

      if (
        isHexColor(color) &&
        contrastRatio(color, effectiveBackground.color) < 4.5
      ) {
        items.push({
          elementId: element.elementId,
          issue: "textContrast",
          message: "텍스트와 배경 대비가 낮습니다.",
          severity: "warning"
        });
      }
    }

    if (shouldReportExportShapeRisk(element)) {
      items.push({
        elementId: element.elementId,
        message: "내보내기에서 모양이 달라질 수 있습니다.",
        severity: "risk"
      });
    }
  }

  items.push(...getEditorTextOverlapValidationItems(deck, slide));
  items.push(...getEditorDuplicateTextValidationItems(slide, presentationRules));
  items.push(...getEditorPresentationSlideValidationItems(deck, slide));

  return items;
}

const genericActionTitles = new Set([
  "개요",
  "배경",
  "현황",
  "시장 현황",
  "문제",
  "해결책",
  "결과",
  "성과",
  "요약",
  "결론",
  "핵심 특징",
  "주요 포인트"
]);

const actionClosingTokens = [
  "다음",
  "지금",
  "시작",
  "신청",
  "참여",
  "확인",
  "선택",
  "도입",
  "실행",
  "문의",
  "출시",
  "구매",
  "예약",
  "체험",
  "next",
  "start",
  "join",
  "contact",
  "launch",
  "pre-order"
];

const executiveClosingTokens = [
  "결정",
  "승인",
  "확정",
  "선택",
  "검토",
  "의사결정",
  "decision",
  "approve",
  "approval"
];

function getEditorPresentationDeckValidationItems(
  deck: Deck
): EditorValidationItem[] {
  const profile = deck.metadata.presentationProfile;
  if (!profile) return [];

  const items: EditorValidationItem[] = [];
  const fontFamilies = new Set(
    deck.slides.flatMap((slide) =>
      slide.elements
        .filter(
          (element): element is Extract<DeckElement, { type: "text" }> =>
            element.visible && element.type === "text"
        )
        .map((element) =>
          (element.props as TextElementProps).fontFamily
            ?.trim()
            .toLocaleLowerCase()
        )
        .filter(Boolean)
    )
  );
  if (fontFamilies.size > 2) {
    items.push({
      issue: "FONT_FAMILY_OVERUSED",
      message: "발표 자료에는 최대 두 개의 글꼴 패밀리만 사용할 수 있습니다.",
      severity: "warning"
    });
  }

  if (["proposal", "product-launch", "executive-report"].includes(profile)) {
    const closing = deck.slides.at(-1);
    if (closing) {
      const tokens =
        profile === "executive-report"
          ? executiveClosingTokens
          : actionClosingTokens;
      const closingText = getVisibleSlideText(closing).toLocaleLowerCase();
      if (!tokens.some((token) => closingText.includes(token))) {
        items.push({
          issue: "CTA_MISSING",
          message:
            profile === "executive-report"
              ? "마지막 슬라이드에 결정 또는 승인 요청이 필요합니다."
              : "마지막 슬라이드에 구체적인 다음 행동이 필요합니다.",
          severity: "warning",
          slideId: closing.slideId
        });
      }
    }
  }
  return items;
}

function getEditorPresentationSlideValidationItems(
  deck: Deck,
  slide: Slide
): EditorValidationItem[] {
  if (!deck.metadata.presentationProfile) return [];
  const items: EditorValidationItem[] = [];
  const slideIndex = deck.slides.findIndex(
    (candidate) => candidate.slideId === slide.slideId
  );
  const visualType = slide.aiNotes?.visualPlan?.visualType ?? "";

  if (
    slideIndex > 0 &&
    !["cover", "quote", "summary"].includes(visualType) &&
    actionTitleRequiresAttention(slide.title)
  ) {
    items.push({
      issue: "ACTION_TITLE_WEAK",
      message: "본문 슬라이드 제목은 40자 이내의 결론형 문장이어야 합니다.",
      severity: "warning",
      slideId: slide.slideId
    });
  }

  if (
    !["cover", "quote"].includes(visualType) &&
    slide.style.layout !== "chart-focus" &&
    slide.style.layout !== "quote" &&
    slide.elements.some(
      (element) =>
        element.visible &&
        element.type === "text" &&
        ["body", "highlight"].includes(element.role ?? "") &&
        getEditorTextContentMetrics(
          deck,
          slide,
          element,
          getTextElementText(element.props as TextElementProps)
        ).lineCount > 6
    )
  ) {
    items.push({
      issue: "BODY_CONTENT_DENSE",
      message: "본문 텍스트 박스는 실제 렌더링 기준 6줄 이내여야 합니다.",
      severity: "warning",
      slideId: slide.slideId
    });
  }

  items.push(...getEditorTypographyValidationItems(slide, slideIndex));
  items.push(...getEditorVisualHierarchyValidationItems(slide, visualType));
  items.push(...getEditorGridValidationItems(slide));
  return items;
}

function actionTitleRequiresAttention(title: string) {
  const normalized = title
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^[ .,:;!?\-_]+|[ .,:;!?\-_]+$/g, "")
    .toLocaleLowerCase();
  return normalized.length > 40 || genericActionTitles.has(normalized);
}

function getEditorTypographyValidationItems(
  slide: Slide,
  slideIndex: number
): EditorValidationItem[] {
  return slide.elements.flatMap((element) => {
    if (!element.visible || element.type !== "text") return [];
    const role = element.role ?? "";
    const minimumSize = minimumPresentationFontSize(slideIndex, role);
    const items: EditorValidationItem[] = [];
    if (element.props.fontSize < minimumSize) {
      items.push({
        elementId: element.elementId,
        issue: "FONT_SIZE_BELOW_MINIMUM",
        message: `${role || "text"} 텍스트는 최소 ${minimumSize}pt가 필요합니다.`,
        severity: "warning" as const,
        slideId: slide.slideId
      });
    }
    const lineHeight = element.props.lineHeight;
    const validLineHeight =
      role === "title"
        ? lineHeight >= 1.05 && lineHeight <= 1.2
        : ["body", "highlight", "subtitle"].includes(role)
          ? lineHeight >= 1.2 && lineHeight <= 1.3
          : true;
    if (!validLineHeight) {
      items.push({
        elementId: element.elementId,
        issue: "LINE_HEIGHT_OUT_OF_RANGE",
        message: "제목과 본문의 역할별 권장 행간 범위를 벗어났습니다.",
        severity: "warning" as const,
        slideId: slide.slideId
      });
    }
    return items;
  });
}

function minimumPresentationFontSize(slideIndex: number, role: string) {
  if (role === "title") return slideIndex === 0 ? 44 : 32;
  if (["body", "highlight", "subtitle"].includes(role)) return 18;
  if (role === "caption") return 14;
  if (role === "footer") return 12;
  return 12;
}

function getEditorVisualHierarchyValidationItems(
  slide: Slide,
  visualType: string
): EditorValidationItem[] {
  if (["cover", "quote"].includes(visualType)) return [];
  const visible = slide.elements.filter((element) => element.visible);
  const contentElements = visible.filter(
    (element) =>
      (element.type === "text" &&
        ["body", "highlight"].includes(element.role ?? "") &&
        getTextElementText(element.props as TextElementProps).trim().length > 0) ||
      element.type === "image" ||
      element.type === "chart" ||
      element.role === "media"
  );
  const primaryVisuals = visible.filter(
    (element) =>
      element.type === "image" || element.type === "chart" || element.role === "media"
  );
  if (contentElements.length > 0 && primaryVisuals.length <= 1) return [];
  return [
    {
      issue: "VISUAL_HIERARCHY_WEAK",
      message: "본문 슬라이드에는 하나의 명확한 시각적 중심 요소가 필요합니다.",
      severity: "warning",
      slideId: slide.slideId
    }
  ];
}

function getEditorGridValidationItems(slide: Slide): EditorValidationItem[] {
  const element = slide.elements.find(
    (candidate) =>
      isPresentationGridElement(candidate, slide.elements) &&
      !isPresentationGridAligned(candidate)
  );
  return element
    ? [
        {
          elementId: element.elementId,
          issue: "GRID_ALIGNMENT_INCONSISTENT",
          message: "핵심 레이아웃 요소가 12열 grid와 8px 간격 기준에서 벗어났습니다.",
          severity: "warning",
          slideId: slide.slideId
        }
      ]
    : [];
}

function isPresentationGridElement(
  element: DeckElement,
  elements: DeckElement[]
) {
  if (!element.visible || isFullBleedElement(element)) return false;
  const role = element.role ?? "";
  if (role === "background" || role === "footer" || isDesignPackChrome(element)) {
    return false;
  }
  if (
    ["_card_", "_accent", "_divider", "_number", "_label"].some((token) =>
      element.elementId.includes(token)
    )
  ) {
    return false;
  }
  if (role === "title" || role === "media" || element.type === "chart") return true;
  if (role === "body" || role === "subtitle") {
    return !isContainedByGridPanel(element, elements);
  }
  return (
    role === "highlight" &&
    element.type !== "text" &&
    element.width >= 400 &&
    element.height >= 120 &&
    ["_panel", "_block"].some((token) => element.elementId.includes(token))
  );
}

function isFullBleedElement(element: DeckElement) {
  return (
    element.x <= 0 &&
    element.y <= 0 &&
    element.width >= 1920 &&
    element.height >= 1080
  );
}

function isDesignPackChrome(element: DeckElement) {
  return [
    "_design_pack_section_number",
    "_design_pack_section_label",
    "_design_pack_page_marker"
  ].some((token) => element.elementId.includes(token));
}

function isContainedByGridPanel(element: DeckElement, elements: DeckElement[]) {
  return elements.some(
    (candidate) =>
      candidate.elementId !== element.elementId &&
      candidate.visible &&
      candidate.role === "highlight" &&
      candidate.type !== "text" &&
      getTextBackgroundCoverage(element, candidate) >= 0.9
  );
}

function isPresentationGridAligned(element: DeckElement) {
  const horizontal = Array.from({ length: presentationGridColumnCount }).some(
    (_, column) =>
      Array.from({ length: presentationGridColumnCount - column }).some((__, index) => {
        const span = index + 1;
        const x = presentationGridSafeX + column * presentationGridStep;
        const width =
          span * presentationGridColumnWidth + (span - 1) * presentationGridGutter;
        return (
          Math.abs(element.x - x) <= presentationGridTolerance &&
          Math.abs(element.width - width) <= presentationGridTolerance
        );
      })
  );
  return (
    horizontal &&
    distanceToSpacing(element.y, presentationGridSpacing) <= presentationGridTolerance &&
    distanceToSpacing(element.height, presentationGridSpacing) <=
      presentationGridTolerance
  );
}

function distanceToSpacing(value: number, spacing: number) {
  return Math.abs(value - Math.round(value / spacing) * spacing);
}

function getVisibleSlideText(slide: Slide) {
  return [
    slide.title,
    ...slide.elements
      .filter(
        (element): element is Extract<DeckElement, { type: "text" }> =>
          element.visible &&
          element.type === "text" &&
          !["caption", "footer"].includes(element.role ?? "")
      )
      .map((element) => getTextElementText(element.props as TextElementProps))
  ]
    .filter(Boolean)
    .join(" ");
}

function shouldReportExportShapeRisk(element: DeckElement) {
  if (element.type === "group") return true;
  if (element.type !== "customShape") return false;
  return !(element.role === "decoration" && element.elementId.includes("_imported_"));
}

function countSpokenChars(text: string) {
  return text.replace(/\s+/g, "").length;
}

function hasVisibleVisualSlot(slide: Slide) {
  return slide.elements.some(
    (element) =>
      element.visible &&
      (element.type === "image" ||
        element.elementId.endsWith("_media_placeholder"))
  );
}

function isExpectedEditorMediaPlaceholder(slide: Slide) {
  const visualPlan = slide.aiNotes?.visualPlan;
  return Boolean(
    visualPlan?.imageNeeded &&
      ["ai-generated", "public-assets", "placeholder-ok"].includes(
        visualPlan.imageSourcePolicy
      )
  );
}

function isEditorTextOverflowing(
  deck: Deck,
  slide: Slide,
  element: Extract<DeckElement, { type: "text" }>
) {
  const text = getTextElementText(element.props as TextElementProps);
  if (!text) return false;

  const metrics = getEditorTextContentMetrics(deck, slide, element, text);

  return metrics.height > Math.max(1, element.height - 8);
}

function isEditorTitleTextWrapped(
  deck: Deck,
  slide: Slide,
  element: Extract<DeckElement, { type: "text" }>
) {
  const text = getTextElementText(element.props as TextElementProps);
  if (!text || !isTitleLikeTextElement(deck, slide, element)) return false;

  return getEditorTextContentMetrics(deck, slide, element, text).lineCount > 1;
}

function isTitleLikeTextElement(
  deck: Deck,
  slide: Slide,
  element: Extract<DeckElement, { type: "text" }>
) {
  if (element.role === "title") return true;
  if (element.role) return false;
  const largestFontSize = Math.max(
    0,
    ...slide.elements
      .filter((candidate): candidate is Extract<DeckElement, { type: "text" }> =>
        candidate.type === "text"
      )
      .map((candidate) => candidate.props.fontSize)
  );

  return (
    element.props.fontSize >= Math.max(36, largestFontSize * 0.85) &&
    element.y <= deck.canvas.height * 0.45
  );
}

function isEditorLabelTextWrapped(
  deck: Deck,
  slide: Slide,
  element: Extract<DeckElement, { type: "text" }>
) {
  const text = getTextElementText(element.props as TextElementProps);
  const normalizedText = text.replace(/\s+/g, " ").trim();
  if (
    !normalizedText ||
    isTitleLikeTextElement(deck, slide, element) ||
    (element.role && element.role !== "caption" && element.role !== "highlight") ||
    !isShortLabelText(normalizedText)
  ) {
    return false;
  }

  const metrics = getEditorTextContentMetrics(deck, slide, element, text);

  return metrics.lineCount > 1 || isShortLabelTextBoxTooNarrow(deck, slide, element, text);
}

function isShortLabelText(text: string) {
  return text.length <= 36 && text.split(" ").filter(Boolean).length <= 5;
}

function isShortLabelTextBoxTooNarrow(
  deck: Deck,
  slide: Slide,
  element: Extract<DeckElement, { type: "text" }>,
  text: string
) {
  const singleLineText = text.replace(/\s+/g, " ").trim();
  const metrics = getEditorTextContentMetrics(deck, slide, element, singleLineText, {
    width: 10000
  });

  return metrics.width + 8 > element.width;
}

function isHexColor(value: string) {
  return /^#[0-9a-f]{6}$/i.test(value);
}

type PaintedBackgroundElement = Extract<
  DeckElement,
  {
    type:
      | "rect"
      | "ellipse"
      | "polygon"
      | "star"
      | "ring"
      | "customShape";
  }
>;

function isPaintedBackgroundElement(
  element: DeckElement
): element is PaintedBackgroundElement {
  return ["rect", "ellipse", "polygon", "star", "ring", "customShape"].includes(
    element.type
  );
}

function getEffectiveTextBackground(
  slide: Slide,
  textElement: Extract<DeckElement, { type: "text" }>,
  slideBackgroundColor: string
): { kind: "solid"; color: string } | { kind: "unverifiable" } {
  const candidates = slide.elements
    .filter(
      (candidate) =>
        candidate.elementId !== textElement.elementId &&
        candidate.visible &&
        candidate.zIndex < textElement.zIndex &&
        (isPaintedBackgroundElement(candidate) ||
          candidate.type === "image" ||
          candidate.type === "svg") &&
        getTextBackgroundCoverage(textElement, candidate) >= 0.5
    )
    .sort((first, second) => second.zIndex - first.zIndex);

  for (const candidate of candidates) {
    if (candidate.type === "image" || candidate.type === "svg") {
      return { kind: "unverifiable" };
    }
    if (candidate.opacity < 1) return { kind: "unverifiable" };
    if (!isPaintedBackgroundElement(candidate)) continue;
    const fill = candidate.props.fill;
    if (fill === "transparent") continue;
    if (typeof fill === "string" && isHexColor(fill)) {
      return { kind: "solid", color: fill };
    }
    return { kind: "unverifiable" };
  }

  if (slide.style.backgroundImage?.src) return { kind: "unverifiable" };
  return isHexColor(slideBackgroundColor)
    ? { kind: "solid", color: slideBackgroundColor }
    : { kind: "unverifiable" };
}

function getTextBackgroundCoverage(textElement: DeckElement, backgroundElement: DeckElement) {
  const left = Math.max(textElement.x, backgroundElement.x);
  const top = Math.max(textElement.y, backgroundElement.y);
  const right = Math.min(
    textElement.x + textElement.width,
    backgroundElement.x + backgroundElement.width
  );
  const bottom = Math.min(
    textElement.y + textElement.height,
    backgroundElement.y + backgroundElement.height
  );
  if (right <= left || bottom <= top) return 0;
  return (
    ((right - left) * (bottom - top)) /
    Math.max(1, textElement.width * textElement.height)
  );
}

function contrastRatio(first: string, second: string) {
  const lighter = Math.max(relativeLuminance(first), relativeLuminance(second));
  const darker = Math.min(relativeLuminance(first), relativeLuminance(second));
  return (lighter + 0.05) / (darker + 0.05);
}

function relativeLuminance(color: string) {
  const values = [1, 3, 5].map((index) => parseInt(color.slice(index, index + 2), 16) / 255);
  const [red, green, blue] = values.map((value) =>
    value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4
  );
  return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
}

function getEditorTextOverlapValidationItems(
  deck: Deck,
  slide: Slide
): EditorValidationItem[] {
  const textElements = slide.elements.filter(isReadableEditorTextElement);
  const items: EditorValidationItem[] = [];

  for (let leftIndex = 0; leftIndex < textElements.length; leftIndex += 1) {
    for (
      let rightIndex = leftIndex + 1;
      rightIndex < textElements.length;
      rightIndex += 1
    ) {
      const first = textElements[leftIndex];
      const second = textElements[rightIndex];

      if (getElementOverlapRatio(deck, slide, first, second) < editorTextOverlapWarningRatio) {
        continue;
      }

      items.push({
        elementIds: [first.elementId, second.elementId],
        level: "warning",
        message: "텍스트 요소가 겹쳐 읽기 어려울 수 있습니다.",
        severity: "warning",
        slideId: slide.slideId
      });
    }
  }

  return items;
}

function getEditorDuplicateTextValidationItems(
  slide: Slide,
  presentationRules: boolean
): EditorValidationItem[] {
  const groups = new Map<string, Extract<DeckElement, { type: "text" }>[]>();
  const textElements = slide.elements.filter(
    (element): element is Extract<DeckElement, { type: "text" }> =>
      presentationRules
        ? isPresentationDuplicateCandidate(element)
        : isReadableEditorTextElement(element)
  );

  for (const element of textElements) {
    const textKey = (presentationRules ? normalizeStructuralText : normalizeComparableText)(
      getTextElementText(element.props as TextElementProps)
    );
    if (textKey.length < editorDuplicateTextMinimumLength) continue;

    const group = groups.get(textKey) ?? [];
    group.push(element);
    groups.set(textKey, group);
  }

  const duplicateGroups = Array.from(groups.values())
    .filter((elements) => elements.length > 1)
    .map((elements) => elements.map((element) => element.elementId));

  if (presentationRules) {
    const keys = new Map<string, string>();
    for (const element of textElements) {
      const key = normalizeStructuralText(
        getTextElementText(element.props as TextElementProps)
      );
      if (key.length >= editorDuplicateTextMinimumLength) {
        keys.set(element.elementId, key);
      }
    }
    for (const [primaryId, primaryKey] of keys) {
      const supporting = Array.from(keys).filter(
        ([elementId, key]) => elementId !== primaryId && primaryKey.includes(key)
      );
      if (
        supporting.length >= 2 &&
        supporting.reduce((total, [, key]) => total + key.length, 0) >=
          primaryKey.length * 0.8
      ) {
        duplicateGroups.push([primaryId, ...supporting.map(([elementId]) => elementId)]);
      }
    }
  }

  const uniqueGroups = new Map(
    duplicateGroups.map((elementIds) => [Array.from(new Set(elementIds)).sort().join("|"), elementIds])
  );
  return Array.from(uniqueGroups.values()).map((elementIds) => ({
      elementIds,
      issue: presentationRules ? ("CONTENT_DUPLICATED" as const) : undefined,
      level: "warning" as const,
      message: presentationRules
        ? "같은 핵심 내용이 본문 요소에 구조적으로 반복되어 있습니다."
        : "같은 텍스트가 여러 요소에 반복되어 있습니다.",
      severity: "warning" as const,
      slideId: slide.slideId
    }));
}

function isPresentationDuplicateCandidate(
  element: DeckElement
): element is Extract<DeckElement, { type: "text" }> {
  return (
    isReadableEditorTextElement(element) &&
    ["subtitle", "body", "highlight"].includes(element.role ?? "")
  );
}

function isReadableEditorTextElement(
  element: DeckElement
): element is Extract<DeckElement, { type: "text" }> {
  return (
    element.type === "text" &&
    element.visible !== false &&
    element.role !== "footer" &&
    getTextElementText(element.props as TextElementProps).trim().length > 0
  );
}

function normalizeComparableText(text: string) {
  return text.replace(/\s+/g, " ").trim().toLocaleLowerCase();
}

function normalizeStructuralText(text: string) {
  return text.normalize("NFKC").toLocaleLowerCase().replace(/[^\p{L}\p{N}]/gu, "");
}

function getElementOverlapRatio(
  deck: Deck,
  slide: Slide,
  first: DeckElement,
  second: DeckElement
) {
  const firstBounds = first.type === "text"
    ? getEditorTextBounds(deck, slide, first)
    : getElementBounds(first);
  const secondBounds = second.type === "text"
    ? getEditorTextBounds(deck, slide, second)
    : getElementBounds(second);
  const firstArea = getElementArea(firstBounds);
  const secondArea = getElementArea(secondBounds);

  if (firstArea <= 0 || secondArea <= 0) {
    return 0;
  }

  const left = Math.max(firstBounds.x, secondBounds.x);
  const top = Math.max(firstBounds.y, secondBounds.y);
  const right = Math.min(firstBounds.x + firstBounds.width, secondBounds.x + secondBounds.width);
  const bottom = Math.min(firstBounds.y + firstBounds.height, secondBounds.y + secondBounds.height);

  return (
    (Math.max(0, right - left) * Math.max(0, bottom - top)) /
    Math.min(firstArea, secondArea)
  );
}

function getElementBounds(element: DeckElement) {
  return {
    x: element.x,
    y: element.y,
    width: element.width,
    height: element.height
  };
}

function getEditorTextBounds(
  deck: Deck,
  slide: Slide,
  element: Extract<DeckElement, { type: "text" }>
) {
  const text = getTextElementText(element.props as TextElementProps);
  const metrics = getEditorTextContentMetrics(deck, slide, element, text);
  return {
    x: element.x,
    y: element.y,
    width: Math.max(1, element.width),
    height: Math.max(1, metrics.height + 8, element.height)
  };
}

function getEditorTextContentMetrics(
  deck: Deck,
  slide: Slide,
  element: Extract<DeckElement, { type: "text" }>,
  text: string,
  options: { width?: number } = {}
) {
  const props = element.props as TextElementProps;
  const primaryRun = getPrimaryTextRun(props);

  return measureTextContentBounds({
    align: props.align,
    fontFamily:
      primaryRun?.fontFamily ??
      props.fontFamily ??
      slide.style.fontFamily ??
      deck.theme.typography.bodyFontFamily,
    fontSize: primaryRun?.fontSize ?? props.fontSize,
    fontStyle: getKonvaFontStyle(primaryRun?.fontWeight ?? props.fontWeight),
    lineHeight: props.lineHeight,
    text,
    width: Math.max(1, options.width ?? element.width - 8)
  });
}

function getElementArea(element: { width: number; height: number }) {
  return Math.max(0, element.width) * Math.max(0, element.height);
}
