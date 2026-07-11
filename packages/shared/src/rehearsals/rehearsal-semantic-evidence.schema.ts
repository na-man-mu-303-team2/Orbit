import { z } from "zod";

export const rehearsalSemanticEvidenceSegmentSchema = z
  .object({
    startMs: z.number().finite().nonnegative(),
    endMs: z.number().finite().nonnegative(),
    text: z
      .string()
      .min(1)
      .max(100_000)
      .refine((value) => value.trim().length > 0, "segment text must not be blank")
  })
  .strict()
  .superRefine((segment, context) => {
    if (segment.endMs < segment.startMs) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "semantic evidence endMs must be greater than or equal to startMs.",
        path: ["endMs"]
      });
    }
  });

export const rehearsalSemanticEvidenceSchema = z
  .object({
    segments: z.array(rehearsalSemanticEvidenceSegmentSchema).max(5_000)
  })
  .strict()
  .superRefine((evidence, context) => {
    const totalTextLength = evidence.segments.reduce(
      (total, segment) => total + segment.text.length,
      0
    );
    if (totalTextLength > 1_000_000) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "semantic evidence text exceeds the cache limit.",
        path: ["segments"]
      });
    }
  });

export const rehearsalSemanticEvaluationJobPayloadSchema = z
  .object({
    jobId: z.string().min(1),
    projectId: z.string().min(1),
    runId: z.string().min(1)
  })
  .strict();

export function rehearsalSemanticEvidenceCacheKey(runId: string) {
  return `rehearsal:semantic-evidence:${runId}`;
}

export type RehearsalSemanticEvidence = z.infer<
  typeof rehearsalSemanticEvidenceSchema
>;
export type RehearsalSemanticEvidenceSegment = z.infer<
  typeof rehearsalSemanticEvidenceSegmentSchema
>;
export type RehearsalSemanticEvaluationJobPayload = z.infer<
  typeof rehearsalSemanticEvaluationJobPayloadSchema
>;
