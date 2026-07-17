import {
  aiDeckPreviewResponseSchema,
  deckSchema,
  generateDeckResponseSchema,
  jobErrorSchema,
  slideSchema,
  type AiDeckPreviewResponse,
  type Deck,
} from "@orbit/shared";
import { Injectable, NotFoundException } from "@nestjs/common";
import { InjectDataSource } from "@nestjs/typeorm";
import type { DataSource } from "typeorm";
import { z } from "zod";

const jobRowSchema = z.object({
  job_id: z.string().min(1),
  project_id: z.string().min(1),
  status: z.enum(["queued", "running", "succeeded", "failed"]),
  progress: z.number().int().min(0).max(100),
  error: jobErrorSchema.nullable(),
  updated_at: z.union([z.date(), z.string().min(1)]),
});
const planningRowSchema = z.object({
  stage: z.enum(["content-planning", "layout-compile"]),
  payload_json: z.unknown(),
});
const contentPayloadSchema = z
  .object({
    contentPlan: z
      .object({
        slidePlans: z.array(
          z
            .object({
              order: z.number().int().positive(),
              title: z.string(),
              message: z.string(),
            })
            .passthrough(),
        ),
      })
      .passthrough(),
  })
  .passthrough();
const visualRequirementsSchema = z.object({
  items: z.array(
    z.object({
      slideId: z.string().min(1),
      visualPlan: z
        .object({ imageNeeded: z.boolean().optional() })
        .passthrough(),
    }),
  ),
});
const layoutPayloadSchema = z
  .object({
    workerPayload: generateDeckResponseSchema,
    visualRequirements: visualRequirementsSchema,
  })
  .passthrough();
const imageRowSchema = z.object({
  shard_key: z.string().min(1),
  status: z.enum(["queued", "running", "succeeded", "failed"]),
  payload_json: z.unknown().nullable(),
});
const imagePayloadSchema = z
  .object({ slide: slideSchema, warnings: z.array(z.string()) })
  .strict();
const qualityRowSchema = z.object({ payload_json: z.unknown() });
const qualityPayloadSchema = z
  .object({ workerPayload: generateDeckResponseSchema })
  .strict();
const deckRowSchema = z.object({ deck_json: z.unknown() });

@Injectable()
export class AiDeckPreviewService {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  async get(projectId: string, jobId: string): Promise<AiDeckPreviewResponse> {
    const job = firstRow(
      await this.dataSource.query(
        `
          SELECT job_id, project_id, status, progress, error, updated_at
          FROM jobs
          WHERE job_id = $1 AND project_id = $2
            AND type = 'ai-deck-generation'
        `,
        [jobId, projectId],
      ),
    );
    if (!job) throw new NotFoundException(`Job not found: ${jobId}`);
    const parsedJob = jobRowSchema.parse(job);

    const [planningRows, imageRows, qualityRows, deckRows] = await Promise.all([
      this.dataSource.query(
        `
          SELECT artifacts.stage, artifacts.payload_json
          FROM ai_deck_planning_artifacts artifacts
          JOIN ai_deck_generation_stages stages
            ON stages.pipeline_job_id = artifacts.pipeline_job_id
           AND stages.stage = artifacts.stage
           AND stages.shard_key = artifacts.shard_key
           AND stages.status = 'succeeded'
          WHERE artifacts.pipeline_job_id = $1
            AND artifacts.project_id = $2
            AND artifacts.stage IN ('content-planning', 'layout-compile')
        `,
        [jobId, projectId],
      ),
      this.dataSource.query(
        `
          SELECT stages.shard_key, stages.status, artifacts.payload_json
          FROM ai_deck_generation_stages stages
          LEFT JOIN ai_deck_execution_artifacts artifacts
            ON artifacts.pipeline_job_id = stages.pipeline_job_id
           AND artifacts.stage = stages.stage
           AND artifacts.shard_key = stages.shard_key
          WHERE stages.pipeline_job_id = $1
            AND stages.stage = 'image-slide'
        `,
        [jobId],
      ),
      this.dataSource.query(
        `
          SELECT artifacts.payload_json
          FROM ai_deck_execution_artifacts artifacts
          JOIN ai_deck_generation_stages stages
            ON stages.pipeline_job_id = artifacts.pipeline_job_id
           AND stages.stage = artifacts.stage
           AND stages.shard_key = artifacts.shard_key
           AND stages.status = 'succeeded'
          WHERE artifacts.pipeline_job_id = $1
            AND artifacts.project_id = $2
            AND artifacts.stage IN ('semantic-quality', 'rendered-visual-quality')
          ORDER BY artifacts.updated_at DESC
          LIMIT 1
        `,
        [jobId, projectId],
      ),
      parsedJob.status === "succeeded"
        ? this.dataSource.query(
            `SELECT deck_json FROM decks WHERE project_id = $1 ORDER BY updated_at DESC LIMIT 1`,
            [projectId],
          )
        : Promise.resolve([]),
    ]);

    return projectAiDeckPreview({
      job: parsedJob,
      planningRows: rows(planningRows).map((row) =>
        planningRowSchema.parse(row),
      ),
      imageRows: rows(imageRows).map((row) => imageRowSchema.parse(row)),
      qualityRow: firstRow(qualityRows),
      deckRow: firstRow(deckRows),
    });
  }
}

export function projectAiDeckPreview(input: {
  job: z.infer<typeof jobRowSchema>;
  planningRows: z.infer<typeof planningRowSchema>[];
  imageRows: z.infer<typeof imageRowSchema>[];
  qualityRow: Record<string, unknown> | null;
  deckRow: Record<string, unknown> | null;
}): AiDeckPreviewResponse {
  const contentRow = input.planningRows.find(
    (row) => row.stage === "content-planning",
  );
  const layoutRow = input.planningRows.find(
    (row) => row.stage === "layout-compile",
  );
  const outline = contentRow
    ? contentPayloadSchema
        .parse(contentRow.payload_json)
        .contentPlan.slidePlans.map(({ order, title, message }) => ({
          order,
          title,
          message,
        }))
        .sort((left, right) => left.order - right.order)
    : [];

  let deck: Deck | null = null;
  let completedSlideIds: string[] = [];
  let pendingSlideIds: string[] = [];

  if (input.job.status === "succeeded" && input.deckRow) {
    deck = deckSchema.parse(deckRowSchema.parse(input.deckRow).deck_json);
    completedSlideIds = deck.slides.map((slide) => slide.slideId);
  } else if (input.qualityRow) {
    deck = qualityPayloadSchema.parse(
      qualityRowSchema.parse(input.qualityRow).payload_json,
    ).workerPayload.deck;
    completedSlideIds = deck.slides.map((slide) => slide.slideId);
  } else if (layoutRow) {
    const layout = layoutPayloadSchema.parse(layoutRow.payload_json);
    const imageSlides = new Map(
      input.imageRows.flatMap((row) => {
        if (row.status !== "succeeded" || !row.payload_json) return [];
        const parsed = imagePayloadSchema.safeParse(row.payload_json);
        return parsed.success
          ? [[parsed.data.slide.slideId, parsed.data.slide] as const]
          : [];
      }),
    );
    const imageNeeded = new Set(
      layout.visualRequirements.items
        .filter((item) => item.visualPlan.imageNeeded === true)
        .map((item) => item.slideId),
    );
    deck = {
      ...layout.workerPayload.deck,
      slides: layout.workerPayload.deck.slides.map(
        (slide) => imageSlides.get(slide.slideId) ?? slide,
      ),
    };
    completedSlideIds = deck.slides
      .filter(
        (slide) =>
          !imageNeeded.has(slide.slideId) || imageSlides.has(slide.slideId),
      )
      .map((slide) => slide.slideId);
    pendingSlideIds = deck.slides
      .filter(
        (slide) =>
          imageNeeded.has(slide.slideId) && !imageSlides.has(slide.slideId),
      )
      .map((slide) => slide.slideId);
  }

  const cancelled =
    input.job.status === "failed" &&
    input.job.error?.code === "AI_DECK_GENERATION_CANCELLED";
  const status = cancelled
    ? "cancelled"
    : input.job.status === "failed"
      ? "failed"
      : input.job.status === "succeeded"
        ? "ready"
        : !deck
          ? outline.length
            ? "composing"
            : "planning"
          : pendingSlideIds.length
            ? "rendering"
            : "quality-check";

  return aiDeckPreviewResponseSchema.parse({
    jobId: input.job.job_id,
    projectId: input.job.project_id,
    status,
    progress: input.job.progress,
    editable: false,
    outline,
    deck,
    completedSlideIds,
    pendingSlideIds,
    updatedAt: new Date(input.job.updated_at).toISOString(),
    error:
      status === "failed" || status === "cancelled"
        ? {
            code: input.job.error?.code ?? "AI_DECK_GENERATION_FAILED",
            message:
              status === "cancelled"
                ? "생성이 취소되었습니다."
                : "슬라이드를 생성하지 못했습니다.",
            retryable:
              status === "failed" && (input.job.error?.retryable ?? true),
          }
        : null,
  });
}

function rows(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value)
    ? value.filter(
        (row): row is Record<string, unknown> =>
          Boolean(row) && typeof row === "object" && !Array.isArray(row),
      )
    : [];
}

function firstRow(value: unknown): Record<string, unknown> | null {
  return rows(value)[0] ?? null;
}
