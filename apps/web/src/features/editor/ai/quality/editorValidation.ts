import type { Deck, DeckElement, Slide, TextElementProps } from "@orbit/shared";
import {
  getKonvaFontStyle,
  getPrimaryTextRun,
  getTextElementText,
  measureTextContentBounds
} from "../../canvas/text/textLayout";

const editorTextOverlapWarningRatio = 0.15;
const editorDuplicateTextMinimumLength = 6;

export type EditorValidationItem = {
  elementId?: string;
  elementIds?: string[];
  issue?: "textOverflow" | "titleWrap" | "labelWrap";
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
  return slides.flatMap((targetSlide) =>
    getEditorSlideValidationItems(deck, targetSlide)
  );
}

function getEditorSlideValidationItems(
  deck: Deck,
  slide: Slide
): EditorValidationItem[] {
  const backgroundColor = slide.style.backgroundColor ?? deck.theme.backgroundColor;
  const items: EditorValidationItem[] = [];

  for (const element of slide.elements) {
    if (!element.visible) continue;

    if (element.elementId.endsWith("_media_placeholder")) {
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

      if (
        isHexColor(color) &&
        isHexColor(backgroundColor) &&
        contrastRatio(color, backgroundColor) < 4.5
      ) {
        items.push({
          elementId: element.elementId,
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
  items.push(...getEditorDuplicateTextValidationItems(slide));

  return items;
}

function shouldReportExportShapeRisk(element: DeckElement) {
  if (element.type === "group") return true;
  if (element.type !== "customShape") return false;
  return !(element.role === "decoration" && element.elementId.includes("_imported_"));
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

function getEditorDuplicateTextValidationItems(slide: Slide): EditorValidationItem[] {
  const groups = new Map<string, Extract<DeckElement, { type: "text" }>[]>();

  for (const element of slide.elements) {
    if (!isReadableEditorTextElement(element)) continue;

    const textKey = normalizeComparableText(
      getTextElementText(element.props as TextElementProps)
    );
    if (textKey.length < editorDuplicateTextMinimumLength) continue;

    const group = groups.get(textKey) ?? [];
    group.push(element);
    groups.set(textKey, group);
  }

  return Array.from(groups.values())
    .filter((elements) => elements.length > 1)
    .map((elements) => ({
      elementIds: elements.map((element) => element.elementId),
      level: "warning" as const,
      message: "같은 텍스트가 여러 요소에 반복되어 있습니다.",
      severity: "warning" as const,
      slideId: slide.slideId
    }));
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
