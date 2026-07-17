import {
  aiDeckDesignSelectionResponseSchema,
  generateDeckDesignSelectionSchema,
  generateDeckRequestSchema,
  generateDeckStoredJobPayloadSchema,
  jobErrorSchema,
  type AiDeckDesignSelectionResponse,
} from "@orbit/shared";
import { ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { InjectDataSource } from "@nestjs/typeorm";
import { InjectPinoLogger, PinoLogger } from "nestjs-pino";
import type { DataSource, EntityManager } from "typeorm";
import { z } from "zod";
import { parseRequest } from "../common/zod-request";

const jobRowSchema = z.object({
  job_id: z.string().min(1),
  project_id: z.string().min(1),
  status: z.enum(["queued", "running", "succeeded", "failed"]),
  payload: z.unknown(),
  error: jobErrorSchema.nullable(),
});

@Injectable()
export class DesignSelectionService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    @InjectPinoLogger(DesignSelectionService.name)
    private readonly logger: PinoLogger,
  ) {}

  async get(projectId: string, jobId: string): Promise<AiDeckDesignSelectionResponse> {
    const job = firstRow(
      await this.dataSource.query(
        `SELECT job_id, project_id, status, payload, error FROM jobs
         WHERE job_id = $1 AND project_id = $2 AND type = 'ai-deck-generation'`,
        [jobId, projectId],
      ),
    );
    if (!job) throw new NotFoundException(`Job not found: ${jobId}`);
    return responseFromJob(jobRowSchema.parse(job));
  }

  async select(
    projectId: string,
    jobId: string,
    body: unknown,
  ): Promise<AiDeckDesignSelectionResponse> {
    const selection = parseRequest(generateDeckDesignSelectionSchema, body);
    await this.dataSource.transaction(async (manager) => {
      const rawJob = firstRow(
        await manager.query(
          `SELECT job_id, project_id, status, payload, error FROM jobs
           WHERE job_id = $1 AND project_id = $2 AND type = 'ai-deck-generation'
           FOR UPDATE`,
          [jobId, projectId],
        ),
      );
      if (!rawJob) throw new NotFoundException(`Job not found: ${jobId}`);
      const job = jobRowSchema.parse(rawJob);
      if (job.status === "failed" || job.status === "succeeded") {
        throw new ConflictException("AI deck design can no longer be changed.");
      }
      const stored = generateDeckStoredJobPayloadSchema.parse(job.payload);
      const existingStage = firstRow(
        await manager.query(
          `SELECT 1 FROM ai_deck_generation_stages
           WHERE pipeline_job_id = $1
             AND stage IN ('design-planning','layout-compile','image-slide')
           LIMIT 1`,
          [jobId],
        ),
      );
      if (
        existingStage &&
        stored.designSelection &&
        JSON.stringify(stored.designSelection) !== JSON.stringify(selection)
      ) {
        throw new ConflictException("AI deck design generation has already started.");
      }

      const coverPlan = {
        title: stored.request.topic,
        message: coverMessage(stored.request.prompt, stored.request.topic),
        audience: stored.request.brief.audienceText ?? "",
      };
      const request = generateDeckRequestSchema.parse({
        ...stored.request,
        ...(selection.designPrompt ? { designPrompt: selection.designPrompt } : {}),
        design: {
          ...stored.request.design,
          paletteOverride: selection.paletteOverride,
          fontOverride: selection.fontOverride,
        },
      });
      const nextPayload = generateDeckStoredJobPayloadSchema.parse({
        ...stored,
        request,
        designSelection: selection,
        coverPlan,
      });
      await manager.query(
        `UPDATE jobs SET payload = $3::jsonb, status = 'running',
           message = 'AI deck design selected.', updated_at = now()
         WHERE job_id = $1 AND project_id = $2 AND type = 'ai-deck-generation'`,
        [jobId, projectId, nextPayload],
      );
      await ensureStage(manager, jobId, projectId, "cover-slide", {});
      const content = firstRow(
        await manager.query(
          `SELECT artifact_id FROM ai_deck_planning_artifacts
           WHERE pipeline_job_id = $1 AND project_id = $2
             AND stage = 'content-planning'`,
          [jobId, projectId],
        ),
      );
      const cover = firstRow(
        await manager.query(
          `SELECT status FROM ai_deck_generation_stages
           WHERE pipeline_job_id = $1
             AND stage = 'cover-slide' AND shard_key = ''`,
          [jobId],
        ),
      );
      if (
        content &&
        typeof content.artifact_id === "string" &&
        (cover?.status === "succeeded" || cover?.status === "failed")
      ) {
        await ensureStage(manager, jobId, projectId, "design-planning", {
          planningArtifactId: content.artifact_id,
        });
      }
    });
    this.logger.info(
      { event: "ai_ppt.design_selection.selected", jobId, projectId },
      "AI deck design selected.",
    );
    return this.get(projectId, jobId);
  }
}

async function ensureStage(
  manager: Pick<EntityManager, "query">,
  jobId: string,
  projectId: string,
  stage: "cover-slide" | "design-planning",
  inputRef: Record<string, unknown>,
) {
  await manager.query(
    `INSERT INTO ai_deck_generation_stages (
       pipeline_job_id, stage, shard_key, status, attempt, input_ref_json
     )
     SELECT jobs.job_id, $3, '', 'queued', 0, $4::jsonb
     FROM jobs
     WHERE jobs.job_id = $1 AND jobs.project_id = $2
       AND jobs.type = 'ai-deck-generation'
       AND jobs.status IN ('queued','running')
     ON CONFLICT (pipeline_job_id, stage, shard_key) DO NOTHING`,
    [jobId, projectId, stage, inputRef],
  );
}

function responseFromJob(job: z.infer<typeof jobRowSchema>) {
  const stored = generateDeckStoredJobPayloadSchema.parse(job.payload);
  const cancelled = job.error?.code === "AI_DECK_GENERATION_CANCELLED";
  return aiDeckDesignSelectionResponseSchema.parse({
    jobId: job.job_id,
    projectId: job.project_id,
    status: cancelled
      ? "cancelled"
      : job.status === "failed"
        ? "failed"
        : stored.designSelection
          ? "generating"
          : "selecting",
    styleContext: {
      topic: stored.request.topic,
      tone: stored.request.metadata.tone,
    },
    selection: stored.designSelection ?? null,
  });
}

function coverMessage(prompt: string | undefined, topic: string): string {
  const normalized = (prompt ?? "").replace(/\s+/g, " ").trim();
  if (!normalized) return topic;
  const sentence = normalized.split(/(?<=[.!?。！？])\s+/u)[0] ?? normalized;
  return sentence.slice(0, 1000);
}

function firstRow(value: unknown): Record<string, unknown> | null {
  if (!Array.isArray(value)) return null;
  const first = Array.isArray(value[0]) ? value[0][0] : value[0];
  return first && typeof first === "object" ? first as Record<string, unknown> : null;
}
