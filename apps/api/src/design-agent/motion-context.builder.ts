import {
  getRichTextSemanticText,
  resolveEffectiveTypography,
} from "@orbit/editor-core";
import type { MotionPlanningContext, Slide } from "@orbit/shared";

export const MOTION_SPEAKER_NOTES_MAX_CHARS = 4_000;

export function buildMotionPlanningContext(
  slide: Slide,
  allowedTargetElementIds: readonly string[],
): MotionPlanningContext {
  const allowedIds = new Set(allowedTargetElementIds);
  const notes = selectBoundedSpeakerNotes(slide);
  return {
    allowedTargetElementIds: [...allowedTargetElementIds],
    effectiveTypography: slide.elements.flatMap((element) =>
      element.type === "text" && allowedIds.has(element.elementId)
        ? [
            {
              elementId: element.elementId,
              ...resolveEffectiveTypography(element.props),
            },
          ]
        : [],
    ),
    speakerNotes: notes.text,
    notesPresent: slide.speakerNotes.trim().length > 0,
    notesTruncated: notes.truncated,
  };
}

export function sanitizeSlideForMotionWorker(slide: Slide): Slide {
  return { ...slide, speakerNotes: "" };
}

function selectBoundedSpeakerNotes(slide: Slide): {
  text: string;
  truncated: boolean;
} {
  const source = slide.speakerNotes.trim();
  if (!source) return { text: "", truncated: false };
  const sentences = splitSentences(source);
  const priorityTokens = collectPriorityTokens(slide);
  const prioritized = sentences.filter((sentence) =>
    [...priorityTokens].some((token) => normalize(sentence).includes(token)),
  );
  const prioritizedSet = new Set(prioritized);
  const ordered = [
    ...prioritized,
    ...sentences.filter((sentence) => !prioritizedSet.has(sentence)),
  ];
  const selected: string[] = [];
  let used = 0;
  for (const sentence of ordered) {
    const separatorLength = selected.length === 0 ? 0 : 1;
    if (used + separatorLength + sentence.length > MOTION_SPEAKER_NOTES_MAX_CHARS) {
      continue;
    }
    selected.push(sentence);
    used += separatorLength + sentence.length;
  }
  if (selected.length === 0) {
    return {
      text: source.slice(0, MOTION_SPEAKER_NOTES_MAX_CHARS),
      truncated: source.length > MOTION_SPEAKER_NOTES_MAX_CHARS,
    };
  }
  return {
    text: selected.join("\n"),
    truncated:
      selected.length < sentences.length ||
      source.length > MOTION_SPEAKER_NOTES_MAX_CHARS,
  };
}

function collectPriorityTokens(slide: Slide): Set<string> {
  const values: string[] = [];
  for (const cue of slide.semanticCues) {
    if (cue.reviewStatus !== "approved" || cue.freshness !== "current") continue;
    values.push(cue.meaning, ...cue.candidateKeywords, ...cue.requiredConcepts);
  }
  values.push(...slide.keywords.flatMap((keyword) => [keyword.text, ...keyword.synonyms]));
  const focalId = slide.aiNotes?.compositionPlan?.primaryFocalElementId;
  const focal = slide.elements.find((element) => element.elementId === focalId);
  if (focal?.type === "text") values.push(getRichTextSemanticText(focal.props));
  return new Set(
    values
      .flatMap((value) => normalize(value).split(/[^\p{L}\p{N}]+/u))
      .filter((value) => value.length >= 2),
  );
}

function splitSentences(value: string): string[] {
  return value
    .replace(/\r\n?/g, "\n")
    .split(/(?<=[.!?。！？])\s+|\n+/u)
    .map((sentence) => sentence.trim())
    .filter(Boolean);
}

function normalize(value: string): string {
  return value.toLocaleLowerCase().normalize("NFKC");
}
