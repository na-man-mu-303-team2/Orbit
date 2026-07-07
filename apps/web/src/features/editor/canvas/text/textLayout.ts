import type {
  Deck,
  Slide,
  TextElementParagraph,
  TextElementProps
} from "@orbit/shared";
import { Text as KonvaTextShape } from "konva/lib/shapes/Text";

const textElementPadding = 4;

export function getCssFontWeight(fontWeight: TextElementProps["fontWeight"]) {
  if (typeof fontWeight === "number") {
    return fontWeight;
  }

  switch (fontWeight) {
    case "medium":
      return 500;
    case "semibold":
      return 600;
    case "bold":
      return 700;
    case "normal":
    default:
      return 400;
  }
}

export function getKonvaFontStyle(
  fontWeight: TextElementProps["fontWeight"]
): "normal" | "bold" {
  return getCssFontWeight(fontWeight) >= 600 ? "bold" : "normal";
}

export function getTextElementText(props: TextElementProps) {
  if (props.paragraphs?.length) {
    return props.paragraphs.map(getParagraphText).join("\n");
  }

  if (props.runs?.length) {
    return props.runs.map((run) => run.text).join("");
  }

  return props.text;
}

function getPrimaryTextRun(props: TextElementProps) {
  const paragraph = props.paragraphs?.find((item) => getParagraphText(item).trim());
  const paragraphRun =
    paragraph?.runs?.find((run) => run.text.trim().length > 0) ??
    paragraph?.runs?.[0];
  if (paragraphRun) {
    return {
      ...paragraphRun,
      color: paragraphRun.color ?? paragraph?.color,
      fontFamily: paragraphRun.fontFamily ?? paragraph?.fontFamily,
      fontSize: paragraphRun.fontSize ?? paragraph?.fontSize,
      fontWeight: paragraphRun.fontWeight ?? paragraph?.fontWeight
    };
  }

  return props.runs?.find((run) => run.text.trim().length > 0) ?? props.runs?.[0];
}

function getParagraphText(paragraph: TextElementParagraph) {
  if (paragraph.runs?.length) {
    return paragraph.runs.map((run) => run.text).join("");
  }

  return paragraph.text;
}

export function getTextElementLayout(args: {
  frame: {
    x: number;
    y: number;
    width: number;
    height: number;
    rotation: number;
  };
  props: TextElementProps;
  slide: Slide;
  theme: Deck["theme"];
}) {
  const { frame, props, slide, theme } = args;
  const primaryRun = getPrimaryTextRun(props);
  const fontFamily =
    primaryRun?.fontFamily ??
    props.fontFamily ??
    slide.style.fontFamily ??
    theme.typography.bodyFontFamily;
  const color = primaryRun?.color ?? props.color ?? slide.style.textColor ?? theme.textColor;
  const fontSize = primaryRun?.fontSize ?? props.fontSize;
  const fontWeight = primaryRun?.fontWeight ?? props.fontWeight;
  const fontStyle = getKonvaFontStyle(fontWeight);
  const text = getTextElementText(props);
  const width = Math.max(1, frame.width - textElementPadding * 2);
  const availableHeight = Math.max(1, frame.height - textElementPadding * 2);
  const contentMetrics = measureTextContentBounds({
    align: props.align,
    fontFamily,
    fontSize,
    fontStyle,
    lineHeight: props.lineHeight,
    text,
    width
  });
  const contentHeight = Math.min(contentMetrics.height, availableHeight);
  const spareHeight = Math.max(0, availableHeight - contentHeight);
  const contentWidth =
    props.align === "justify"
      ? width
      : Math.max(1, Math.min(contentMetrics.width, width));
  let y = textElementPadding;
  let contentX = textElementPadding;

  if (props.verticalAlign === "middle") {
    y += spareHeight / 2;
  } else if (props.verticalAlign === "bottom") {
    y += spareHeight;
  }

  if (props.align === "center") {
    contentX += Math.max(0, (width - contentWidth) / 2);
  } else if (props.align === "right") {
    contentX += Math.max(0, width - contentWidth);
  }

  return {
    color,
    contentHeight,
    contentWidth,
    contentX,
    fontFamily,
    fontSize,
    fontStyle,
    text,
    width,
    x: textElementPadding,
    y
  };
}

export function estimateTextContentBounds(args: {
  text: string;
  width: number;
  fontSize: number;
  lineHeight: number;
}) {
  const { text, width, fontSize, lineHeight } = args;
  const charsPerLine = Math.max(1, Math.floor(width / Math.max(fontSize * 0.55, 1)));
  const paragraphs = text.replace(/\r\n/g, "\n").split("\n");
  const estimatedLineLengths: number[] = [];

  for (const paragraph of paragraphs) {
    if (paragraph.length === 0) {
      estimatedLineLengths.push(0);
      continue;
    }

    for (let start = 0; start < paragraph.length; start += charsPerLine) {
      estimatedLineLengths.push(Math.min(charsPerLine, paragraph.length - start));
    }
  }

  const maxCharsInLine = Math.max(0, ...estimatedLineLengths);
  const lineCount = Math.max(1, estimatedLineLengths.length);

  return {
    height: lineCount * fontSize * lineHeight,
    width: Math.min(width, maxCharsInLine * fontSize * 0.55)
  };
}

export function measureTextContentBounds(args: {
  align: TextElementProps["align"];
  fontFamily: string;
  fontSize: number;
  fontStyle: "normal" | "bold";
  lineHeight: number;
  text: string;
  width: number;
}) {
  if (typeof document === "undefined") {
    return estimateTextContentBounds({
      text: args.text,
      width: args.width,
      fontSize: args.fontSize,
      lineHeight: args.lineHeight
    });
  }

  const measureNode = new KonvaTextShape({
    align: args.align,
    fontFamily: args.fontFamily,
    fontSize: args.fontSize,
    fontStyle: args.fontStyle,
    lineHeight: args.lineHeight,
    padding: 0,
    text: args.text,
    width: args.width,
    wrap: "word"
  });
  const contentHeight = measureNode.height();
  const contentWidth = Math.min(
    args.width,
    measureNode.textArr.reduce((maxWidth, line) => Math.max(maxWidth, line.width), 0)
  );

  measureNode.destroy();

  return {
    height: contentHeight,
    width: contentWidth
  };
}
