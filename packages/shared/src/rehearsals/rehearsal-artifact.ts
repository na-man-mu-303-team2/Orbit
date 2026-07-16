import { z } from "zod";

export const rehearsalTranscriptSegmentSchema = z
  .object({
    text: z.string(),
    start: z.number().finite().nonnegative(),
    end: z.number().finite().nonnegative(),
  })
  .strict()
  .refine((segment) => segment.end >= segment.start, {
    message: "Transcript segment end must be greater than or equal to start.",
    path: ["end"],
  });

export const rehearsalTranscriptArtifactSchema = z
  .object({
    text: z.string(),
    language: z.string().min(1).nullable(),
    duration: z.number().finite().nonnegative().nullable(),
    provider: z.string().min(1),
    segments: z.array(rehearsalTranscriptSegmentSchema),
  })
  .strict();

export type RehearsalTranscriptArtifact = z.infer<
  typeof rehearsalTranscriptArtifactSchema
>;

export function formatAsiaSeoulDate(value: Date): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(value);
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((item) => item.type === type)?.value;
  const year = part("year");
  const month = part("month");
  const day = part("day");

  if (!year || !month || !day) {
    throw new Error("Failed to format the rehearsal artifact date.");
  }

  return `${year}-${month}-${day}`;
}

export function createRehearsalArtifactPrefix(input: {
  createdAt: Date;
  projectId: string;
  runId: string;
}): string {
  return `rehearsals/${formatAsiaSeoulDate(input.createdAt)}/${input.projectId}/${input.runId}`;
}
