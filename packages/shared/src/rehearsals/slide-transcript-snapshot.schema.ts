import { z } from "zod";

export const slideTranscriptSnapshotSchema = z
  .object({
    slideId: z.string().min(1),
    slideNum: z.number().int().positive(),
    visitedVer: z.number().int().positive(),
    transcript: z.string().max(200_000),
    visitedAt: z.string().datetime(),
    capturedAt: z.string().datetime(),
    reason: z.enum(["slide-change", "rehearsal-end"]),
  })
  .strict();

export const slideTranscriptSnapshotsSchema = z
  .array(slideTranscriptSnapshotSchema)
  .max(1_000);

export type SlideTranscriptSnapshot = z.infer<
  typeof slideTranscriptSnapshotSchema
>;
