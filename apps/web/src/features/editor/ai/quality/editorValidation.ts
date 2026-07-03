import type { Deck, DeckElement, Slide } from "@orbit/shared";

const editorTextOverlapWarningRatio = 0.15;

export type EditorValidationItem = {
  elementId?: string;
  elementIds?: string[];
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
      if (isEditorTextOverflowing(element)) {
        items.push({
          elementId: element.elementId,
          message: "텍스트가 상자 높이를 넘을 수 있습니다.",
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

  items.push(...getEditorTextOverlapValidationItems(slide));

  return items;
}

function shouldReportExportShapeRisk(element: DeckElement) {
  if (element.type === "group") return true;
  if (element.type !== "customShape") return false;
  return !(element.role === "decoration" && element.elementId.includes("_imported_"));
}

function isEditorTextOverflowing(element: Extract<DeckElement, { type: "text" }>) {
  const text = element.props.text;
  if (!text) return false;

  const fontSize = element.props.fontSize;
  const characterWidth = Math.max(1, fontSize * 0.56);
  const charactersPerLine = Math.max(1, Math.floor(element.width / characterWidth));
  const estimatedLines = text
    .split("\n")
    .reduce(
      (sum, line) => sum + Math.max(1, Math.ceil(line.length / charactersPerLine)),
      0
    );

  return estimatedLines * fontSize * element.props.lineHeight > element.height * 1.08;
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

function getEditorTextOverlapValidationItems(slide: Slide): EditorValidationItem[] {
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

      if (getElementOverlapRatio(first, second) < editorTextOverlapWarningRatio) {
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

function isReadableEditorTextElement(element: DeckElement) {
  return (
    element.type === "text" &&
    element.visible !== false &&
    element.role !== "footer" &&
    element.props.text.trim().length > 0
  );
}

function getElementOverlapRatio(first: DeckElement, second: DeckElement) {
  const firstArea = getElementArea(first);
  const secondArea = getElementArea(second);

  if (firstArea <= 0 || secondArea <= 0) {
    return 0;
  }

  const left = Math.max(first.x, second.x);
  const top = Math.max(first.y, second.y);
  const right = Math.min(first.x + first.width, second.x + second.width);
  const bottom = Math.min(first.y + first.height, second.y + second.height);

  return (
    (Math.max(0, right - left) * Math.max(0, bottom - top)) /
    Math.min(firstArea, secondArea)
  );
}

function getElementArea(element: DeckElement) {
  return Math.max(0, element.width) * Math.max(0, element.height);
}
