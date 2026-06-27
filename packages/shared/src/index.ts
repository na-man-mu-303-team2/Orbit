import { z } from "zod";
export * from "./config/runtime";

export const demoIds = {
  userId: "user_demo_1",
  workspaceId: "workspace_demo_1",
  projectId: "project_demo_1",
  deckId: "deck_demo_1",
  sessionId: "session_demo_1"
} as const;

export const isoDateTimeSchema = z.string().datetime({ offset: true });

export const deckElementTypeSchema = z.enum([
  "text",
  "image",
  "shape",
  "chart",
  "video"
]);

export const animationTypeSchema = z.enum([
  "fade-in",
  "fade-out",
  "appear",
  "slide-in",
  "none"
]);

export const animationSchema = z.object({
  animationId: z.string().min(1),
  elementId: z.string().min(1).optional(),
  type: animationTypeSchema,
  order: z.number().int().nonnegative()
});

export const keywordSchema = z.object({
  keywordId: z.string().min(1),
  text: z.string().min(1),
  synonyms: z.array(z.string()).default([]),
  abbreviations: z.array(z.string()).default([])
});

export const deckElementSchema = z.object({
  elementId: z.string().min(1),
  type: deckElementTypeSchema,
  x: z.number(),
  y: z.number(),
  width: z.number().positive(),
  height: z.number().positive(),
  props: z.record(z.unknown()).default({}),
  animations: z.array(animationSchema).default([])
});

export const slideSchema = z.object({
  slideId: z.string().min(1),
  order: z.number().int().positive(),
  title: z.string().default(""),
  thumbnailUrl: z.string().default(""),
  speakerNotes: z.string().default(""),
  elements: z.array(deckElementSchema).default([]),
  keywords: z.array(keywordSchema).default([]),
  animations: z.array(animationSchema).default([])
});

export const deckSchema = z.object({
  deckId: z.string().min(1),
  projectId: z.string().min(1),
  title: z.string().min(1),
  version: z.number().int().positive(),
  slides: z.array(slideSchema)
});

export type Deck = z.infer<typeof deckSchema>;
export type Slide = z.infer<typeof slideSchema>;
export type DeckElement = z.infer<typeof deckElementSchema>;
export type Keyword = z.infer<typeof keywordSchema>;
export type DeckAnimation = z.infer<typeof animationSchema>;

export const filePurposeSchema = z.enum([
  "pptx-import",
  "reference-material",
  "rehearsal-audio",
  "export-result",
  "report-result",
  "thumbnail"
]);

export const uploadedFileSchema = z.object({
  fileId: z.string().min(1),
  projectId: z.string().min(1),
  originalName: z.string().min(1),
  mimeType: z.string().min(1),
  size: z.number().int().nonnegative(),
  url: z.string().min(1),
  purpose: filePurposeSchema,
  createdAt: isoDateTimeSchema
});

export type FilePurpose = z.infer<typeof filePurposeSchema>;
export type UploadedFile = z.infer<typeof uploadedFileSchema>;

export const jobStatusSchema = z.enum([
  "queued",
  "running",
  "succeeded",
  "failed"
]);

export const jobTypeSchema = z.enum([
  "pptx-import",
  "deck-export",
  "reference-extract",
  "ai-deck-generation",
  "rehearsal-stt",
  "final-report-generation",
  "report-pdf-export"
]);

export const jobSchema = z.object({
  jobId: z.string().min(1),
  projectId: z.string().min(1),
  type: jobTypeSchema,
  status: jobStatusSchema,
  progress: z.number().int().min(0).max(100),
  message: z.string().default(""),
  result: z.record(z.unknown()).nullable(),
  error: z
    .object({
      code: z.string().min(1),
      message: z.string().min(1)
    })
    .nullable(),
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema
});

export type Job = z.infer<typeof jobSchema>;
export type JobStatus = z.infer<typeof jobStatusSchema>;
export type JobType = z.infer<typeof jobTypeSchema>;

export const websocketEventTypeSchema = z.enum([
  "project-joined",
  "deck-updated",
  "slide-changed",
  "highlight-changed",
  "presentation-started",
  "audience-joined",
  "question-created",
  "poll-voted",
  "survey-submitted"
]);

export const websocketEventSchema = z.object({
  type: websocketEventTypeSchema,
  roomId: z.string().min(1),
  sessionId: z.string().min(1).optional(),
  userId: z.string().min(1),
  payload: z.record(z.unknown()).default({}),
  sentAt: isoDateTimeSchema
});

export const slideChangedPayloadSchema = z.object({
  deckId: z.string().min(1),
  slideId: z.string().min(1),
  slideIndex: z.number().int().nonnegative()
});

export const highlightChangedPayloadSchema = z.object({
  slideId: z.string().min(1),
  elementId: z.string().min(1),
  state: z.enum(["active", "inactive"])
});

export type WebsocketEvent = z.infer<typeof websocketEventSchema>;
export type WebsocketEventType = z.infer<typeof websocketEventTypeSchema>;
export type SlideChangedPayload = z.infer<typeof slideChangedPayloadSchema>;
export type HighlightChangedPayload = z.infer<
  typeof highlightChangedPayloadSchema
>;

export const presentationSessionSchema = z.object({
  sessionId: z.string().min(1),
  projectId: z.string().min(1),
  deckId: z.string().min(1),
  presenterUserId: z.string().min(1),
  status: z.enum(["draft", "live", "ended"]),
  startedAt: isoDateTimeSchema.nullable(),
  endedAt: isoDateTimeSchema.nullable()
});

export const rehearsalMetricsSchema = z.object({
  runId: z.string().min(1),
  projectId: z.string().min(1),
  deckId: z.string().min(1),
  durationSeconds: z.number().nonnegative(),
  wordsPerMinute: z.number().nonnegative(),
  fillerWordCount: z.number().int().nonnegative(),
  pauseCount: z.number().int().nonnegative(),
  keywordCoverage: z.number().min(0).max(1)
});

export const reportSchema = z.object({
  reportId: z.string().min(1),
  projectId: z.string().min(1),
  sessionId: z.string().min(1),
  summary: z.string().default(""),
  questionCount: z.number().int().nonnegative(),
  pollCount: z.number().int().nonnegative(),
  createdAt: isoDateTimeSchema
});

export type PresentationSession = z.infer<typeof presentationSessionSchema>;
export type RehearsalMetrics = z.infer<typeof rehearsalMetricsSchema>;
export type PresentationReport = z.infer<typeof reportSchema>;

export function nowIso(): string {
  return new Date().toISOString();
}
