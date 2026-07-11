import type { Deck } from "../deck/deck.schema";
import {
  rehearsalEvaluationSnapshotSchema,
  type RehearsalEvaluationSnapshot
} from "./rehearsal.schema";
import type { RehearsalEvaluationPlan } from "../coaching/evaluator-lens.schema";

export function createRehearsalEvaluationSnapshot(
  deck: Deck,
  capturedAt: string = new Date().toISOString(),
  options: {
    deckContentHash?: string | null;
    evaluationPlan?: RehearsalEvaluationPlan | null;
  } = {}
): RehearsalEvaluationSnapshot {
  const fallbackEstimatedSeconds = Math.max(
    1,
    Math.round((deck.targetDurationMinutes * 60) / deck.slides.length)
  );

  return rehearsalEvaluationSnapshotSchema.parse({
    deckId: deck.deckId,
    deckVersion: deck.version,
    deckContentHash: options.deckContentHash ?? null,
    evaluationPlan: options.evaluationPlan ?? null,
    capturedAt,
    slides: deck.slides.map((slide) => ({
      slideId: slide.slideId,
      order: slide.order,
      title: slide.title,
      estimatedSeconds: slide.estimatedSeconds ?? fallbackEstimatedSeconds,
      keywords: slide.keywords.map((keyword) => ({
        keywordId: keyword.keywordId,
        text: keyword.text,
        synonyms: keyword.synonyms,
        abbreviations: keyword.abbreviations,
        required: keyword.required
      })),
      semanticCues: slide.semanticCues.filter(
        (cue) => cue.reviewStatus === "approved" || cue.reviewStatus === "excluded"
      )
    }))
  });
}
