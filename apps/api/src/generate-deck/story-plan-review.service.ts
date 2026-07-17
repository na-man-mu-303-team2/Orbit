import {
  generateDeckRepairReasonSchema,
  generateDeckStoredJobPayloadSchema,
  jobErrorSchema,
  storyPlanApproveRequestSchema,
  storyPlanEditRequestSchema,
  storyPlanRegenerateRequestSchema,
  storyPlanReviewResponseSchema,
  type StoryPlanApproveRequest,
  type StoryPlanEditRequest,
  type StoryPlanReviewResponse,
} from "@orbit/shared";
import {
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { InjectDataSource } from "@nestjs/typeorm";
import { InjectPinoLogger, PinoLogger } from "nestjs-pino";
import type { DataSource, EntityManager } from "typeorm";
import { z } from "zod";
import { parseRequest } from "../common/zod-request";

const jobRowSchema = z.object({
  job_id: z.string().min(1),
  project_id: z.string().min(1),
  status: z.enum(["queued", "running", "succeeded", "failed"]),
  payload: z.unknown().optional(),
  error: jobErrorSchema.nullable().optional(),
});
const reviewRowSchema = z.object({
  status: z.enum(["review-pending", "regenerating", "approved", "cancelled"]),
  revision: z.number().int().min(0),
  regeneration_count: z.number().int().min(0).max(5),
  last_error_json: z
    .object({ code: z.string(), message: z.string() })
    .nullable()
    .optional(),
});
const artifactRowSchema = z.object({
  artifact_id: z.string().uuid().optional(),
  payload_json: z.unknown(),
  updated_at: z.union([z.date(), z.string().min(1)]),
});

type Queryable = Pick<EntityManager, "query">;
type StorySnapshot = {
  job: z.infer<typeof jobRowSchema>;
  review: z.infer<typeof reviewRowSchema> | null;
  artifact: z.infer<typeof artifactRowSchema> | null;
};

@Injectable()
export class StoryPlanReviewService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    @InjectPinoLogger(StoryPlanReviewService.name)
    private readonly logger: PinoLogger,
  ) {}

  async get(
    projectId: string,
    jobId: string,
  ): Promise<StoryPlanReviewResponse> {
    return projectStoryPlanReview(
      await loadStorySnapshot(this.dataSource, projectId, jobId),
    );
  }

  async edit(
    projectId: string,
    jobId: string,
    body: unknown,
  ): Promise<StoryPlanReviewResponse> {
    const request = parseRequest(storyPlanEditRequestSchema, body);
    await this.dataSource.transaction(async (manager) => {
      const state = await lockStoryState(manager, projectId, jobId);
      if (!state.review || state.review.status !== "review-pending") {
        throw new ConflictException("Story plan cannot be edited now.");
      }
      if (state.review.revision !== request.expectedRevision) {
        throw new ConflictException("Story plan revision is stale.");
      }
      const artifact = firstRow(
        await manager.query(
          `
            SELECT payload_json
            FROM ai_deck_planning_artifacts
            WHERE pipeline_job_id = $1
              AND project_id = $2
              AND stage = 'content-planning'
            FOR UPDATE
          `,
          [jobId, projectId],
        ),
      );
      if (!artifact) {
        throw new ConflictException("Story plan artifact is unavailable.");
      }
      const payload = applyStoryPlanEdit(artifact.payload_json, request);
      await manager.query(
        `
          UPDATE ai_deck_planning_artifacts
          SET payload_json = $3::jsonb, updated_at = now()
          WHERE pipeline_job_id = $1
            AND project_id = $2
            AND stage = 'content-planning'
        `,
        [jobId, projectId, payload],
      );
      await manager.query(
        `
          UPDATE ai_deck_story_reviews
          SET revision = revision + 1, last_error_json = NULL, updated_at = now()
          WHERE pipeline_job_id = $1
            AND project_id = $2
            AND status = 'review-pending'
        `,
        [jobId, projectId],
      );
    });
    this.logger.info(
      {
        event: "ai_ppt.story_review.edited",
        jobId,
        projectId,
        kind: request.kind,
      },
      "AI deck story plan edited.",
    );
    return this.get(projectId, jobId);
  }

  async approve(
    projectId: string,
    jobId: string,
    body: unknown,
  ): Promise<StoryPlanReviewResponse> {
    const request = parseRequest(storyPlanApproveRequestSchema, body);
    await this.dataSource.transaction(async (manager) => {
      const state = await lockStoryState(manager, projectId, jobId);
      if (!state.review) {
        throw new ConflictException("Story plan is not ready for approval.");
      }
      if (state.review.revision !== request.expectedRevision) {
        throw new ConflictException("Story plan revision is stale.");
      }
      if (state.review.status === "approved") return;
      if (state.review.status !== "review-pending") {
        throw new ConflictException("Story plan cannot be approved now.");
      }
      const artifact = firstRow(
        await manager.query(
          `
            SELECT artifact_id, payload_json
            FROM ai_deck_planning_artifacts
            WHERE pipeline_job_id = $1
              AND project_id = $2
              AND stage = 'content-planning'
            FOR UPDATE
          `,
          [jobId, projectId],
        ),
      );
      const artifactId = z.string().uuid().parse(artifact?.artifact_id);
      let contentPayload = artifact?.payload_json;
      if (request.slides) {
        contentPayload = applyStoryPlanApprovalDraft(
          contentPayload,
          request.slides,
        );
      }
      if (request.designSelection) {
        contentPayload = applyStoryPlanDesignSelection(
          contentPayload,
          request.designSelection,
          storyStyleContext(state.job.payload)?.tone ?? "professional",
        );
        const jobPayload = applyStoredJobDesignSelection(
          state.job.payload,
          request.designSelection,
        );
        await manager.query(
          `
            UPDATE jobs
            SET payload = $3::jsonb, updated_at = now()
            WHERE job_id = $1 AND project_id = $2
              AND type = 'ai-deck-generation'
          `,
          [jobId, projectId, jobPayload],
        );
      }
      if (request.slides || request.designSelection) {
        await manager.query(
          `
            UPDATE ai_deck_planning_artifacts
            SET payload_json = $3::jsonb, updated_at = now()
            WHERE pipeline_job_id = $1
              AND project_id = $2
              AND stage = 'content-planning'
          `,
          [jobId, projectId, contentPayload],
        );
      }
      await manager.query(
        `
          UPDATE ai_deck_story_reviews
          SET status = 'approved', last_error_json = NULL, updated_at = now()
          WHERE pipeline_job_id = $1
            AND project_id = $2
            AND status = 'review-pending'
        `,
        [jobId, projectId],
      );
      await manager.query(
        `
          INSERT INTO ai_deck_generation_stages (
            pipeline_job_id, stage, shard_key, status, attempt, input_ref_json
          )
          SELECT jobs.job_id, 'design-planning', '', 'queued', 0, $3::jsonb
          FROM jobs
          WHERE jobs.job_id = $1
            AND jobs.project_id = $2
            AND jobs.type = 'ai-deck-generation'
            AND jobs.status IN ('queued','running')
          ON CONFLICT (pipeline_job_id, stage, shard_key) DO NOTHING
        `,
        [jobId, projectId, { planningArtifactId: artifactId }],
      );
      await manager.query(
        `
          UPDATE jobs
          SET status = 'running', progress = GREATEST(progress, 40),
              message = 'AI deck generation approved.', updated_at = now()
          WHERE job_id = $1 AND project_id = $2
            AND type = 'ai-deck-generation'
            AND status IN ('queued','running')
        `,
        [jobId, projectId],
      );
    });
    this.logger.info(
      { event: "ai_ppt.story_review.approved", jobId, projectId },
      "AI deck story plan approved.",
    );
    return this.get(projectId, jobId);
  }

  async regenerate(
    projectId: string,
    jobId: string,
    body: unknown,
  ): Promise<StoryPlanReviewResponse> {
    const request = parseRequest(storyPlanRegenerateRequestSchema, body);
    await this.dataSource.transaction(async (manager) => {
      const state = await lockStoryState(manager, projectId, jobId);
      if (!state.review || state.review.status !== "review-pending") {
        throw new ConflictException("Story plan cannot be regenerated now.");
      }
      if (state.review.revision !== request.expectedRevision) {
        throw new ConflictException("Story plan revision is stale.");
      }
      if (state.review.regeneration_count >= 5) {
        throw new ConflictException("Story plan regeneration limit reached.");
      }
      await manager.query(
        `
          UPDATE ai_deck_story_reviews
          SET status = 'regenerating',
              regeneration_count = regeneration_count + 1,
              regeneration_instruction = $3,
              last_error_json = NULL,
              updated_at = now()
          WHERE pipeline_job_id = $1 AND project_id = $2
        `,
        [jobId, projectId, request.instruction ?? null],
      );
      const reset = await manager.query(
        `
          UPDATE ai_deck_generation_stages stages
          SET status = 'queued', attempt = 0, result_ref_json = NULL,
              error_json = NULL, lease_owner = NULL,
              lease_expires_at = NULL, dispatched_at = NULL, updated_at = now()
          FROM jobs
          WHERE jobs.job_id = stages.pipeline_job_id
            AND jobs.project_id = $2
            AND jobs.type = 'ai-deck-generation'
            AND stages.pipeline_job_id = $1
            AND stages.stage = 'content-planning'
            AND stages.status IN ('succeeded','failed')
          RETURNING stages.pipeline_job_id
        `,
        [jobId, projectId],
      );
      if (!firstRow(reset)) {
        throw new ConflictException(
          "Content planning checkpoint is unavailable.",
        );
      }
      await manager.query(
        `
          UPDATE jobs
          SET status = 'running', progress = 25,
              message = 'AI deck story plan regenerating.',
              error = NULL, updated_at = now()
          WHERE job_id = $1 AND project_id = $2
            AND type = 'ai-deck-generation'
            AND status IN ('queued','running')
        `,
        [jobId, projectId],
      );
    });
    this.logger.info(
      { event: "ai_ppt.story_review.regeneration_requested", jobId, projectId },
      "AI deck story plan regeneration requested.",
    );
    return this.get(projectId, jobId);
  }

  async cancel(
    projectId: string,
    jobId: string,
  ): Promise<StoryPlanReviewResponse> {
    await this.dataSource.transaction(async (manager) => {
      const state = await lockStoryState(manager, projectId, jobId);
      if (state.review?.status === "approved") {
        throw new ConflictException(
          "Approved generation cannot be cancelled here.",
        );
      }
      if (state.review?.status === "cancelled") return;
      await manager.query(
        `
          INSERT INTO ai_deck_story_reviews (
            pipeline_job_id, project_id, status, revision, regeneration_count
          )
          VALUES ($1, $2, 'cancelled', 0, 0)
          ON CONFLICT (pipeline_job_id) DO UPDATE
          SET status = 'cancelled', regeneration_instruction = NULL,
              last_error_json = NULL, updated_at = now()
        `,
        [jobId, projectId],
      );
      const cancellation = {
        code: "AI_DECK_GENERATION_CANCELLED",
        message: "AI deck generation was cancelled by the user.",
        retryable: false,
      };
      await manager.query(
        `
          UPDATE ai_deck_generation_stages stages
          SET status = 'failed', error_json = $3::jsonb,
              lease_owner = NULL, lease_expires_at = NULL, updated_at = now()
          FROM jobs
          WHERE jobs.job_id = stages.pipeline_job_id
            AND jobs.project_id = $2
            AND jobs.type = 'ai-deck-generation'
            AND stages.pipeline_job_id = $1
            AND stages.status IN ('queued','running')
        `,
        [jobId, projectId, cancellation],
      );
      await manager.query(
        `
          UPDATE jobs
          SET status = 'failed', message = 'AI deck generation cancelled.',
              error = $3::jsonb, updated_at = now()
          WHERE job_id = $1 AND project_id = $2
            AND type = 'ai-deck-generation'
            AND status IN ('queued','running')
        `,
        [jobId, projectId, cancellation],
      );
    });
    this.logger.info(
      { event: "ai_ppt.story_review.cancelled", jobId, projectId },
      "AI deck story plan cancelled.",
    );
    return this.get(projectId, jobId);
  }
}

async function loadStorySnapshot(
  db: Pick<DataSource, "query">,
  projectId: string,
  jobId: string,
): Promise<StorySnapshot> {
  const job = firstRow(
    await db.query(
      `
        SELECT job_id, project_id, status, payload, error
        FROM jobs
        WHERE job_id = $1 AND project_id = $2
          AND type = 'ai-deck-generation'
      `,
      [jobId, projectId],
    ),
  );
  if (!job) throw new NotFoundException(`Job not found: ${jobId}`);
  const review = firstRow(
    await db.query(
      `
        SELECT status, revision, regeneration_count, last_error_json
        FROM ai_deck_story_reviews
        WHERE pipeline_job_id = $1 AND project_id = $2
      `,
      [jobId, projectId],
    ),
  );
  const artifact = firstRow(
    await db.query(
      `
        SELECT artifact_id, payload_json, updated_at
        FROM ai_deck_planning_artifacts
        WHERE pipeline_job_id = $1 AND project_id = $2
          AND stage = 'content-planning'
      `,
      [jobId, projectId],
    ),
  );
  return {
    job: jobRowSchema.parse(job),
    review: review ? reviewRowSchema.parse(review) : null,
    artifact: artifact ? artifactRowSchema.parse(artifact) : null,
  };
}

async function lockStoryState(
  manager: Queryable,
  projectId: string,
  jobId: string,
): Promise<Pick<StorySnapshot, "job" | "review">> {
  const job = firstRow(
    await manager.query(
      `
        SELECT job_id, project_id, status, payload, error
        FROM jobs
        WHERE job_id = $1 AND project_id = $2
          AND type = 'ai-deck-generation'
        FOR UPDATE
      `,
      [jobId, projectId],
    ),
  );
  if (!job) throw new NotFoundException(`Job not found: ${jobId}`);
  const review = firstRow(
    await manager.query(
      `
        SELECT status, revision, regeneration_count, last_error_json
        FROM ai_deck_story_reviews
        WHERE pipeline_job_id = $1 AND project_id = $2
        FOR UPDATE
      `,
      [jobId, projectId],
    ),
  );
  return {
    job: jobRowSchema.parse(job),
    review: review ? reviewRowSchema.parse(review) : null,
  };
}

function firstRow(value: unknown): Record<string, unknown> | null {
  if (!Array.isArray(value)) return null;
  const first = Array.isArray(value[0]) ? value[0][0] : value[0];
  return first && typeof first === "object"
    ? (first as Record<string, unknown>)
    : null;
}

const sourceRecordSchema = z
  .object({
    sourceId: z.string().optional(),
    source_id: z.string().optional(),
    sourceType: z
      .enum(["topic", "uploaded", "web", "generated", "none"])
      .optional(),
    source_type: z
      .enum(["topic", "uploaded", "web", "generated", "none"])
      .optional(),
    title: z.string().default(""),
    authority: z
      .enum(["official", "independent", "unknown"])
      .default("unknown"),
  })
  .passthrough();
const storySlideSchema = z
  .object({
    order: z.number().int().min(1),
    slide_type: z.string().optional(),
    slideType: z.string().optional(),
    title: z.string().default(""),
    message: z.string().default(""),
    speaker_notes: z.string().optional(),
    speakerNotes: z.string().optional(),
    target_seconds: z.number().int().nonnegative().optional(),
    targetSeconds: z.number().int().nonnegative().optional(),
    source_refs: z.array(z.string()).optional(),
    sourceRefs: z.array(z.string()).optional(),
  })
  .passthrough();
const contentArtifactPayloadSchema = z
  .object({
    artifactVersion: z.literal(2).optional(),
    rawInput: z
      .object({
        research_quality: z.string().optional(),
        researchQuality: z.string().optional(),
        source_records: z.array(sourceRecordSchema).optional(),
        sourceRecords: z.array(sourceRecordSchema).optional(),
        repair_reason_codes: z.array(z.string()).optional(),
        repairReasonCodes: z.array(z.string()).optional(),
      })
      .passthrough(),
    contentPlan: z
      .object({
        outline: z
          .object({
            title: z.string().default(""),
            slide_titles: z.array(z.string()).optional(),
            slideTitles: z.array(z.string()).optional(),
          })
          .passthrough(),
        slidePlans: z.array(storySlideSchema).min(1),
        slideCount: z.number().int().min(1).optional(),
        repairReasonCodes: z.array(z.string()).optional(),
      })
      .passthrough(),
  })
  .strict();

export function applyStoryPlanEdit(
  rawPayload: unknown,
  request: StoryPlanEditRequest,
): unknown {
  const payload = contentArtifactPayloadSchema.parse(rawPayload);
  const slides = payload.contentPlan.slidePlans;
  if (request.kind === "speaker-notes") {
    if (!slides.some((slide) => slide.order === request.order)) {
      throw new ConflictException("Story plan slide is stale.");
    }
    return {
      ...payload,
      contentPlan: {
        ...payload.contentPlan,
        slidePlans: slides.map((slide) =>
          slide.order === request.order
            ? {
                ...slide,
                speaker_notes: request.speakerNotes,
                speakerNotes: request.speakerNotes,
              }
            : slide,
        ),
      },
    };
  }

  const byOrder = new Map(slides.map((slide) => [slide.order, slide]));
  if (
    byOrder.size !== slides.length ||
    request.orders.length !== slides.length ||
    request.orders.some((order) => !byOrder.has(order))
  ) {
    throw new ConflictException("Story plan slide order is stale.");
  }
  const slidePlans = request.orders.map((order, index) => ({
    ...byOrder.get(order)!,
    order: index + 1,
  }));
  const slideTitles = slidePlans.map((slide) => slide.title);
  return {
    ...payload,
    contentPlan: {
      ...payload.contentPlan,
      outline: {
        ...payload.contentPlan.outline,
        slide_titles: slideTitles,
        slideTitles,
      },
      slidePlans,
    },
  };
}

type StoryPlanApprovalSlides = NonNullable<StoryPlanApproveRequest["slides"]>;

export function applyStoryPlanApprovalDraft(
  rawPayload: unknown,
  drafts: StoryPlanApprovalSlides,
): unknown {
  const payload = contentArtifactPayloadSchema.parse(rawPayload);
  const slides = payload.contentPlan.slidePlans;
  const bySourceOrder = new Map(slides.map((slide) => [slide.order, slide]));
  const requestedOrders = new Set(drafts.map((draft) => draft.sourceOrder));
  if (
    bySourceOrder.size !== slides.length ||
    requestedOrders.size !== drafts.length ||
    drafts.length !== slides.length ||
    drafts.some((draft) => !bySourceOrder.has(draft.sourceOrder))
  ) {
    throw new ConflictException("Story plan approval draft is stale.");
  }
  const slidePlans = drafts.map((draft, index) => ({
    ...bySourceOrder.get(draft.sourceOrder)!,
    order: index + 1,
    title: draft.title,
    message: draft.message,
  }));
  const slideTitles = slidePlans.map((slide) => slide.title);
  return {
    ...payload,
    contentPlan: {
      ...payload.contentPlan,
      outline: {
        ...payload.contentPlan.outline,
        slide_titles: slideTitles,
        slideTitles,
      },
      slidePlans,
    },
  };
}

type StoryPlanDesignSelection = NonNullable<
  StoryPlanApproveRequest["designSelection"]
>;

export function applyStoryPlanDesignSelection(
  rawPayload: unknown,
  selection: StoryPlanDesignSelection,
  tone: string,
): unknown {
  const payload = contentArtifactPayloadSchema.parse(rawPayload);
  return {
    ...payload,
    rawInput: {
      ...payload.rawInput,
      design_prompt: designPromptForSelection(selection, tone),
      design: {
        ...recordValue(payload.rawInput.design),
        paletteOverride: selection.paletteOverride,
        fontOverride: selection.fontOverride,
      },
    },
  };
}

function applyStoredJobDesignSelection(
  rawPayload: unknown,
  selection: StoryPlanDesignSelection,
) {
  const payload = generateDeckStoredJobPayloadSchema.parse(rawPayload);
  return {
    ...payload,
    request: {
      ...payload.request,
      designPrompt: designPromptForSelection(
        selection,
        payload.request.metadata.tone,
      ),
      design: {
        ...payload.request.design,
        paletteOverride: selection.paletteOverride,
        fontOverride: selection.fontOverride,
      },
    },
  };
}

function designPromptForSelection(
  selection: StoryPlanDesignSelection,
  tone: string,
) {
  return [
    `tone=${tone}`,
    `palette=${selection.paletteOptionId}`,
    `font=${selection.fontOverride.name}`,
    "mediaPolicy=minimal",
    "base=brandlogy-modern",
  ].join("; ");
}

function recordValue(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

export function projectStoryPlanReview(
  snapshot: StorySnapshot,
): StoryPlanReviewResponse {
  const { job, review, artifact } = snapshot;
  const cancelled = review?.status === "cancelled";
  const failed = job.status === "failed" && !cancelled;
  const status = failed ? "failed" : (review?.status ?? "planning");
  const plan =
    artifact && review && review.revision > 0
      ? projectPlan(artifact, review)
      : null;
  const lastError = review?.last_error_json;
  const error = cancelled
    ? {
        code: "AI_DECK_GENERATION_CANCELLED",
        message: "생성이 취소되었습니다.",
      }
    : failed
      ? {
          code: job.error?.code ?? "AI_DECK_GENERATION_FAILED",
          message: "이야기 구성을 만들지 못했습니다.",
        }
      : lastError
        ? {
            code: lastError.code || "STORY_PLAN_REGENERATION_FAILED",
            message: "다른 구성을 만들지 못해 기존 구성을 유지했습니다.",
          }
        : null;
  return storyPlanReviewResponseSchema.parse({
    jobId: job.job_id,
    projectId: job.project_id,
    status,
    styleContext: storyStyleContext(job.payload),
    plan,
    error,
  });
}

function storyStyleContext(rawPayload: unknown) {
  const payload = generateDeckStoredJobPayloadSchema.safeParse(rawPayload);
  return payload.success
    ? {
        topic: payload.data.request.topic,
        tone: payload.data.request.metadata.tone,
      }
    : null;
}

function projectPlan(
  artifact: z.infer<typeof artifactRowSchema>,
  review: z.infer<typeof reviewRowSchema>,
) {
  const payload = contentArtifactPayloadSchema.parse(artifact.payload_json);
  const raw = payload.rawInput;
  const content = payload.contentPlan;
  const sourceRecords = raw.sourceRecords ?? raw.source_records ?? [];
  const sourcesById = new Map(
    sourceRecords.flatMap((source) => {
      const id = source.sourceId ?? source.source_id;
      return id ? [[id, source] as const] : [];
    }),
  );
  const researchQuality = raw.researchQuality ?? raw.research_quality;
  const degradedResearch =
    researchQuality === "partial" || researchQuality === "unavailable";
  const repairReasonCodes = [
    ...new Set(
      content.repairReasonCodes ??
        raw.repairReasonCodes ??
        raw.repair_reason_codes ??
        [],
    ),
  ].map((code) => generateDeckRepairReasonSchema.parse(code));
  const qualityWarnings = [
    ...(researchQuality === "partial"
      ? [
          {
            code: "RESEARCH_PARTIAL",
            message: "일부 참고자료는 추가 확인이 필요합니다.",
          },
        ]
      : researchQuality === "unavailable"
        ? [
            {
              code: "RESEARCH_UNAVAILABLE",
              message: "확인 가능한 외부 참고자료가 부족합니다.",
            },
          ]
        : []),
    ...(repairReasonCodes.length
      ? [
          {
            code: "AUTO_REPAIRED",
            message: "AI가 구성 품질을 위해 일부 내용을 자동 조정했습니다.",
          },
        ]
      : []),
  ];
  const slides = content.slidePlans.map((slide) => {
    const refs = slide.sourceRefs ?? slide.source_refs ?? [];
    const sources = refs.flatMap((id) => {
      const source = sourcesById.get(id);
      if (!source) return [];
      return [
        {
          title: source.title.trim() || "참고자료",
          type: source.sourceType ?? source.source_type ?? "none",
          authority: source.authority,
        },
      ];
    });
    return {
      order: slide.order,
      sourceOrder: slide.order,
      slideType: slide.slideType ?? slide.slide_type ?? "summary",
      title: slide.title,
      message: slide.message,
      speakerNotes: slide.speakerNotes ?? slide.speaker_notes ?? "",
      targetSeconds: slide.targetSeconds ?? slide.target_seconds ?? 0,
      sourceState:
        refs.length === 0
          ? "none"
          : degradedResearch || sources.length !== refs.length
            ? "attention"
            : "connected",
      sources,
    };
  });
  return {
    revision: review.revision,
    regenerationCount: review.regeneration_count,
    regenerationLimit: 5,
    outline: {
      title: content.outline.title,
      slideTitles:
        content.outline.slideTitles ??
        content.outline.slide_titles ??
        slides.map((slide) => slide.title),
    },
    totalSeconds: slides.reduce((sum, slide) => sum + slide.targetSeconds, 0),
    slideCount: content.slideCount ?? slides.length,
    generatedAt: new Date(artifact.updated_at).toISOString(),
    qualityWarnings,
    repairReasonCodes,
    slides,
  };
}
