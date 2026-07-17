import {
  jobSchema,
  slideQuestionGuideItemCoreSchema,
  slideQuestionGuideItemSchema,
  slideQuestionGuideJobPayloadSchema,
  slideQuestionGuideJobResultSchema,
  slideQuestionGuideResearchSchema,
  slideQuestionGuideSourceSnapshotSchema,
  slideQuestionGuideWebSourceRefSchema,
  type Job,
} from "@orbit/shared";
import type { DataSource } from "typeorm";
import { z } from "zod";

const generatedItemSchema = slideQuestionGuideItemCoreSchema.omit({ questionId: true });
const responseSchema = z.object({
  items: z.array(generatedItemSchema).length(3),
  model: z.string().trim().min(1).max(100),
  research: slideQuestionGuideResearchSchema,
  webSources: z.array(slideQuestionGuideWebSourceRefSchema).max(5),
}).strict().superRefine((response, context) => {
  if (response.research.officialSourceCount !== response.webSources.length) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["research", "officialSourceCount"],
      message: "Official source count must match the returned web source allowlist",
    });
  }
});
const briefContextSchema = z.object({
  audience: z.enum(["novice", "practitioner", "decision-maker"]),
  purpose: z.enum(["inform", "persuade", "teach", "report"]),
  desiredOutcome: z.string().trim().min(1).max(240),
  requirements: z.array(z.object({
    text: z.string().trim().min(1).max(240),
    reviewStatus: z.enum(["approved", "excluded"]),
  })).max(5),
  terminology: z.array(z.object({
    term: z.string().trim().min(1).max(120),
    explanation: z.string().trim().min(1).max(120),
  })).max(10),
  challengeTopics: z.array(z.string().trim().min(1).max(120)).max(3),
});

export async function processSlideQuestionGuideGenerationJob(
  dataSource: DataSource,
  pythonWorkerUrl: string,
  rawPayload: unknown,
  onEvent?: (event: SlideQuestionGuideBusinessEvent) => void,
): Promise<Job> {
  const payload = slideQuestionGuideJobPayloadSchema.parse(rawPayload);
  const guide = firstRow(await dataSource.query(
    `SELECT * FROM slide_question_guides
     WHERE guide_id = $1 AND project_id = $2`,
    [payload.guideId, payload.projectId],
  ));
  if (!guide || !["queued", "running"].includes(String(guide.status))) {
    return currentJob(dataSource, payload.jobId);
  }

  await dataSource.query(
    `UPDATE slide_question_guides SET status = 'running', error_code = NULL, updated_at = now()
     WHERE guide_id = $1 AND project_id = $2 AND status = 'queued'`,
    [payload.guideId, payload.projectId],
  );
  await updateJob(dataSource, payload.jobId, "running", 20, "슬라이드 질문 근거 확인 중", null, null);

  const startedAt = Date.now();
  let failureStage: SlideQuestionGuideFailureStage = "source-snapshot-validation";
  try {
    const sourceSnapshot = slideQuestionGuideSourceSnapshotSchema.parse(
      typeof guide.source_snapshot_json === "string"
        ? JSON.parse(guide.source_snapshot_json)
        : guide.source_snapshot_json,
    );
    if (
      sourceSnapshot.slideId !== guide.slide_id ||
      sourceSnapshot.deckVersion !== Number(guide.deck_version) ||
      sourceSnapshot.contentHash !== guide.slide_content_hash
    ) {
      throw new Error("SLIDE_QUESTION_GUIDE_SOURCE_STALE");
    }

    failureStage = "brief-context-load";
    const briefRow = firstRow(await dataSource.query(
      `SELECT content_json FROM presentation_briefs WHERE project_id = $1`,
      [payload.projectId],
    ));
    const brief = briefRow ? briefContextSchema.parse(briefRow.content_json) : null;
    failureStage = "approved-reference-load";
    const references = await dataSource.query(
      `SELECT chunks.id::text AS chunk_id, chunks.file_id, chunks.content, chunks.content_hash
       FROM presentation_brief_approved_references approved
       JOIN project_assets assets
         ON assets.project_id = approved.project_id
        AND assets.file_id = approved.file_id
        AND assets.content_hash = approved.file_content_hash
       JOIN reference_chunks chunks
         ON chunks.project_id = approved.project_id
        AND chunks.file_id = approved.file_id
       WHERE approved.project_id = $1 AND assets.status = 'uploaded'
       ORDER BY approved.display_order, chunks.id LIMIT 8`,
      [payload.projectId],
    );
    const request = {
      slide: {
        slideId: guide.slide_id,
        deckVersion: sourceSnapshot.deckVersion,
        contentHash: sourceSnapshot.contentHash,
        title: sourceSnapshot.title,
        content: sourceSnapshot.content,
      },
      references: references.map((reference: Record<string, unknown>) => ({
        fileId: String(reference.file_id),
        chunkId: String(reference.chunk_id),
        contentHash: String(reference.content_hash),
        content: stringValue(reference.content).slice(0, 2_000),
      })),
      brief,
      questionCount: 3,
    };
    failureStage = "python-worker-request";
    const response = await fetch(new URL("/slide-question-guides/generate", pythonWorkerUrl), {
      method: "POST",
      headers: { "content-type": "application/json" },
      signal: AbortSignal.timeout(120_000),
      body: JSON.stringify(request),
    });
    if (!response.ok) throw new Error("SLIDE_QUESTION_GUIDE_PROVIDER_FAILED");
    failureStage = "provider-response-validation";
    const generated = responseSchema.parse(await response.json());
    emitBusinessEvent(onEvent, {
      event: "slide_question_guide.web_research.completed",
      projectId: payload.projectId,
      guideId: payload.guideId,
      status: generated.research.status,
      attempts: generated.research.attempts,
      officialSourceCount: generated.research.officialSourceCount,
      issueCodes: generated.research.issueCodes,
    });
    failureStage = "source-ref-validation";
    validateSourceRefs(generated.items, sourceSnapshot, references, generated.webSources);
    const generatedAt = new Date().toISOString();
    const items = generated.items.map((item, index) => slideQuestionGuideItemSchema.parse({
      ...item,
      questionId: `slide_question_${payload.guideId}_${index + 1}`.slice(0, 128),
    }));

    failureStage = "guide-persistence";
    await dataSource.transaction(async (manager) => {
      const locked = firstRow(await manager.query(
        `SELECT status, deck_version, slide_content_hash FROM slide_question_guides
         WHERE guide_id = $1 AND project_id = $2 FOR UPDATE`,
        [payload.guideId, payload.projectId],
      ));
      if (!locked || locked.status !== "running") return;
      if (Number(locked.deck_version) !== Number(guide.deck_version) || locked.slide_content_hash !== guide.slide_content_hash) {
        throw new Error("SLIDE_QUESTION_GUIDE_SOURCE_STALE");
      }
      await manager.query(`DELETE FROM slide_question_guide_items WHERE guide_id = $1`, [payload.guideId]);
      for (const [index, item] of items.entries()) {
        await manager.query(
          `INSERT INTO slide_question_guide_items (
            guide_id, project_id, question_id, question_order, item_json, created_at
          ) VALUES ($1,$2,$3,$4,$5,$6)`,
          [payload.guideId, payload.projectId, item.questionId, index + 1, item, generatedAt],
        );
      }
      await manager.query(
        `UPDATE slide_question_guides SET
          status = 'succeeded', model = $3, error_code = NULL,
          research_status = $4, research_attempts = $5,
          official_source_count = $6, research_issue_codes = $7::jsonb,
          researched_at = $8, generated_at = $9, updated_at = $9
         WHERE guide_id = $1 AND project_id = $2`,
        [
          payload.guideId,
          payload.projectId,
          generated.model,
          generated.research.status,
          generated.research.attempts,
          generated.research.officialSourceCount,
          JSON.stringify(generated.research.issueCodes),
          generated.research.researchedAt,
          generatedAt,
        ],
      );
    });

    failureStage = "job-result-validation";
    const result = slideQuestionGuideJobResultSchema.parse({
      guideId: payload.guideId,
      projectId: payload.projectId,
      deckId: guide.deck_id,
      deckVersion: guide.deck_version,
      slideId: guide.slide_id,
      itemCount: items.length,
      generatedAt,
    });
    failureStage = "job-persistence";
    return await updateJob(dataSource, payload.jobId, "succeeded", 100, "슬라이드 질문 준비 완료", result, null);
  } catch (error) {
    const errorCode = error instanceof Error && error.message === "SLIDE_QUESTION_GUIDE_SOURCE_STALE"
      ? "SLIDE_QUESTION_GUIDE_SOURCE_STALE"
      : "SLIDE_QUESTION_GUIDE_GENERATION_FAILED";
    const postgresErrorCode = safePostgresErrorCode(error);
    emitBusinessEvent(onEvent, {
      event: "slide_question_guide.generation.failed",
      jobId: payload.jobId,
      projectId: payload.projectId,
      guideId: payload.guideId,
      stage: failureStage,
      errorCode,
      ...(postgresErrorCode ? { postgresErrorCode } : {}),
      durationMs: Math.max(0, Date.now() - startedAt),
    });
    await dataSource.query(
      `UPDATE slide_question_guides SET status = 'failed', error_code = $3, updated_at = now()
       WHERE guide_id = $1 AND project_id = $2 AND status IN ('queued','running')`,
      [payload.guideId, payload.projectId, errorCode],
    );
    return updateJob(dataSource, payload.jobId, "failed", 100, "슬라이드 질문 준비 실패", null, {
      code: errorCode,
      message: errorCode === "SLIDE_QUESTION_GUIDE_SOURCE_STALE"
        ? "The deck changed before question generation completed."
        : "Slide question guide generation failed.",
    });
  }
}

function validateSourceRefs(
  items: z.infer<typeof responseSchema>["items"],
  sourceSnapshot: z.infer<typeof slideQuestionGuideSourceSnapshotSchema>,
  references: Array<Record<string, unknown>>,
  webSources: Array<z.infer<typeof slideQuestionGuideWebSourceRefSchema>>,
) {
  const allowedReferences = new Set(
    references.map((reference) => (
      `${reference.file_id}:${reference.chunk_id}:${reference.content_hash}`
    )),
  );
  const sourceRefs = items.flatMap((item) => [
    ...item.sourceRefs,
    ...item.keyConcepts.flatMap((concept) => concept.sourceRefs),
  ]);
  const allowedWebSources = new Set(webSources.map(webSourceKey));
  for (const reference of sourceRefs) {
    const allowed = reference.kind === "slide"
      ? reference.slideId === sourceSnapshot.slideId
        && reference.deckVersion === sourceSnapshot.deckVersion
        && reference.contentHash === sourceSnapshot.contentHash
      : reference.kind === "reference"
        ? allowedReferences.has(`${reference.fileId}:${reference.chunkId}:${reference.contentHash}`)
        : allowedWebSources.has(webSourceKey(reference));
    if (!allowed) throw new Error("SLIDE_QUESTION_GUIDE_SOURCE_NOT_APPROVED");
  }
}

function webSourceKey(reference: z.infer<typeof slideQuestionGuideWebSourceRefSchema>) {
  return JSON.stringify([
    reference.sourceId,
    reference.url,
    reference.title,
    reference.authority,
    reference.contentHash,
    reference.retrievedAt,
  ]);
}

export type SlideQuestionGuideResearchBusinessEvent = {
  event: "slide_question_guide.web_research.completed";
  projectId: string;
  guideId: string;
  status: "succeeded" | "unavailable";
  attempts: number;
  officialSourceCount: number;
  issueCodes: string[];
};

export type SlideQuestionGuideFailureStage =
  | "source-snapshot-validation"
  | "brief-context-load"
  | "approved-reference-load"
  | "python-worker-request"
  | "provider-response-validation"
  | "source-ref-validation"
  | "guide-persistence"
  | "job-result-validation"
  | "job-persistence";

export type SlideQuestionGuideFailureBusinessEvent = {
  event: "slide_question_guide.generation.failed";
  jobId: string;
  projectId: string;
  guideId: string;
  stage: SlideQuestionGuideFailureStage;
  errorCode:
    | "SLIDE_QUESTION_GUIDE_SOURCE_STALE"
    | "SLIDE_QUESTION_GUIDE_GENERATION_FAILED";
  postgresErrorCode?: string;
  durationMs: number;
};

export type SlideQuestionGuideBusinessEvent =
  | SlideQuestionGuideResearchBusinessEvent
  | SlideQuestionGuideFailureBusinessEvent;

function emitBusinessEvent(
  onEvent: ((event: SlideQuestionGuideBusinessEvent) => void) | undefined,
  event: SlideQuestionGuideBusinessEvent,
) {
  try {
    onEvent?.(event);
  } catch {
    // Diagnostic logging must not change question guide generation behavior.
  }
}

function safePostgresErrorCode(error: unknown): string | undefined {
  if (typeof error !== "object" || error === null) return undefined;
  const record = error as {
    code?: unknown;
    driverError?: { code?: unknown };
  };
  const value = record.driverError?.code ?? record.code;
  return typeof value === "string" && /^[0-9A-Z]{5}$/.test(value)
    ? value
    : undefined;
}

function updateJob(
  dataSource: DataSource,
  jobId: string,
  status: "running" | "succeeded" | "failed",
  progress: number,
  message: string,
  result: Record<string, unknown> | null,
  error: { code: string; message: string } | null,
) {
  return dataSource.query(
    `UPDATE jobs SET status=$2,progress=$3,message=$4,result=$5,error=$6,updated_at=now()
     WHERE job_id=$1 RETURNING *`,
    [jobId, status, progress, message, result, error],
  ).then((rows) => toJob(firstRow(rows)));
}

function currentJob(dataSource: DataSource, jobId: string) {
  return dataSource.query(`SELECT * FROM jobs WHERE job_id=$1`, [jobId])
    .then((rows) => toJob(firstRow(rows)));
}

function toJob(row: Record<string, any> | null) {
  if (!row) throw new Error("Slide question guide job not found.");
  return jobSchema.parse({
    jobId: row.job_id,
    projectId: row.project_id,
    type: row.type,
    status: row.status,
    progress: row.progress,
    message: row.message,
    result: row.result,
    error: row.error,
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at),
  });
}

function firstRow(value: unknown): Record<string, any> | null {
  if (!Array.isArray(value)) return null;
  const first = value[0];
  return Array.isArray(first) ? (first[0] ?? null) : (first ?? null);
}

function toIso(value: unknown) {
  return value instanceof Date ? value.toISOString() : new Date(String(value)).toISOString();
}

function stringValue(value: unknown) {
  return typeof value === "string" ? value : "";
}
