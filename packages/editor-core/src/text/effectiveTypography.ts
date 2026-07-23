import type {
  TextElementParagraph,
  TextElementProps,
  TextElementRun
} from "@orbit/shared";

import { normalizeRichTextProps } from "./richTextOperations";

export type EffectiveTypography = {
  characterCount: number;
  dominantFontSize: number;
  effectiveFontSize: number;
  effectiveLetterSpacing: number;
  effectiveLineHeight: number;
  resolvedFontScale: number;
};

type WeightedSample = {
  characters: number;
  fontSize: number;
  letterSpacing: number;
  lineHeight: number;
};

/**
 * Resolves typography with the same shrink-text inheritance used by the Web
 * rich-text renderer, without depending on Canvas or Konva.
 */
export function resolveEffectiveTypography(
  input: TextElementProps
): EffectiveTypography {
  const props = normalizeRichTextProps(input);
  const resolvedFontScale =
    props.autoFit === "shrink-text" ? (props.fontScale ?? 1) : 1;
  const lineSpaceScale =
    props.autoFit === "shrink-text"
      ? 1 - (props.lineSpaceReduction ?? 0)
      : 1;
  const samples = collectSamples(
    props,
    resolvedFontScale,
    lineSpaceScale
  );
  const characterCount = samples.reduce(
    (total, sample) => total + sample.characters,
    0
  );
  const weighted = samples.length
    ? samples
    : [
        {
          characters: 1,
          fontSize: props.fontSize * resolvedFontScale,
          letterSpacing: (props.letterSpacing ?? 0) * resolvedFontScale,
          lineHeight: props.lineHeight * resolvedFontScale * lineSpaceScale
        }
      ];

  return {
    characterCount,
    dominantFontSize: dominantValue(weighted, "fontSize"),
    effectiveFontSize: weightedMedian(weighted, "fontSize"),
    effectiveLetterSpacing: weightedMedian(weighted, "letterSpacing"),
    effectiveLineHeight: weightedMedian(weighted, "lineHeight"),
    resolvedFontScale
  };
}

function collectSamples(
  props: TextElementProps,
  fontScale: number,
  lineSpaceScale: number
): WeightedSample[] {
  return (props.paragraphs ?? []).flatMap((paragraph) => {
    const runs = paragraph.runs?.length
      ? paragraph.runs
      : [{ text: paragraph.text, baseline: "normal" as const }];
    return runs.flatMap((run) => {
      const characters = Array.from(run.text).length;
      if (characters === 0) return [];
      const rawFontSize = inherited(run, paragraph, props, "fontSize");
      const rawLetterSpacing =
        inherited(run, paragraph, props, "letterSpacing") ?? 0;
      const rawLineHeight = paragraph.lineHeight ?? props.lineHeight;
      return [
        {
          characters,
          fontSize: (rawFontSize ?? props.fontSize) * fontScale,
          letterSpacing: rawLetterSpacing * fontScale,
          lineHeight: rawLineHeight * fontScale * lineSpaceScale
        }
      ];
    });
  });
}

function inherited<K extends "fontSize" | "letterSpacing">(
  run: TextElementRun,
  paragraph: TextElementParagraph,
  props: TextElementProps,
  key: K
): TextElementRun[K] | TextElementParagraph[K] | TextElementProps[K] {
  return run[key] ?? paragraph[key] ?? props[key];
}

function weightedMedian(
  samples: WeightedSample[],
  key: keyof Omit<WeightedSample, "characters">
): number {
  const ordered = [...samples].sort((left, right) => left[key] - right[key]);
  const total = ordered.reduce((sum, sample) => sum + sample.characters, 0);
  let seen = 0;
  for (const sample of ordered) {
    seen += sample.characters;
    if (seen * 2 >= total) return sample[key];
  }
  return ordered.at(-1)?.[key] ?? 0;
}

function dominantValue(
  samples: WeightedSample[],
  key: keyof Omit<WeightedSample, "characters">
): number {
  const weights = new Map<number, number>();
  for (const sample of samples) {
    weights.set(sample[key], (weights.get(sample[key]) ?? 0) + sample.characters);
  }
  return [...weights].sort(
    ([leftValue, leftWeight], [rightValue, rightWeight]) =>
      rightWeight - leftWeight || rightValue - leftValue
  )[0]?.[0] ?? 0;
}
