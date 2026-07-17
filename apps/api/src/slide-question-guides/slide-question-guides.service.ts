import { loadOrbitConfig } from "@orbit/config";
import { enqueueSlideQuestionGuideGenerationJob } from "@orbit/job-queue";
import {
  createSlideQuestionGuideRequestSchema,
  jobSchema,
  slideQuestionGuideJobResponseSchema,
  slideQuestionGuideListResponseSchema,
  slideQuestionGuideSchema,
} from "@orbit/shared";
import { ConflictException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { InjectDataSource } from "@nestjs/typeorm";
import { randomUUID } from "node:crypto";
import { InjectPinoLogger, PinoLogger } from "nestjs-pino";
import type { DataSource } from "typeorm";
import { z } from "zod";

import { DecksService } from "../decks/decks.service";
import { JobsService } from "../jobs/jobs.service";
import { sha256Canonical } from "../practice-goals/evaluation-plan";

const promptVersion = "slide-question-guide-v2";
const listQuerySchema = z.object({
  deckId: z.string().trim().min(1).max(128),
  slideId: z.string().trim().min(1).max(128).optional(),
}).strict();

@Injectable()
export class SlideQuestionGuidesService {
  private readonly config = loadOrbitConfig(process.env, { service: "api" });

  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly decksService: DecksService,
    private readonly jobsService: JobsService,
    @InjectPinoLogger(SlideQuestionGuidesService.name)
    private readonly logger: PinoLogger,
  ) {}

  async create(projectId: string, actorUserId: string, body: unknown) {
    this.assertEnabled();
    const request = createSlideQuestionGuideRequestSchema.parse(body);
    const existing = firstRow(await this.dataSource.query(
      `SELECT guide_id, generation_job_id FROM slide_question_guides
       WHERE project_id = $1 AND created_by = $2 AND client_request_id = $3`,
      [projectId, actorUserId, request.clientRequestId],
    ));
    if (existing?.generation_job_id) {
      const job = await this.jobsService.get(String(existing.generation_job_id));
      if (job) return slideQuestionGuideJobResponseSchema.parse({ job, guideId: existing.guide_id });
    }

    const { deck } = await this.decksService.getDeck(projectId);
    if (deck.deckId !== request.deckId || deck.version !== request.expectedDeckVersion) {
      throw new ConflictException({
        code: "SLIDE_QUESTION_DECK_VERSION_MISMATCH",
        message: "The expected deck version does not match the current deck version.",
        actualDeckVersion: deck.version,
      });
    }
    const slide = deck.slides.find((candidate) => candidate.slideId === request.slideId);
    if (!slide) throw new NotFoundException("Slide not found in the current deck.");

    const guideId = `slide_guide_${randomUUID()}`;
    const now = new Date().toISOString();
    const slideContentHash = sha256Canonical(slide);
    try {
      await this.dataSource.query(
        `INSERT INTO slide_question_guides (
          guide_id, project_id, deck_id, deck_version, slide_id, slide_content_hash, source_snapshot_json,
          client_request_id, status, generation_job_id, created_by, question_count,
          schema_version, prompt_version, model, error_code, created_at, updated_at, generated_at
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'queued',NULL,$9,3,2,$10,NULL,NULL,$11,$11,NULL)`,
        [
          guideId,
          projectId,
          deck.deckId,
          deck.version,
          slide.slideId,
          slideContentHash,
          {
            slideId: slide.slideId,
            deckVersion: deck.version,
            contentHash: slideContentHash,
            title: slide.title,
            content: collectSlideText(slide).slice(0, 8_000),
          },
          request.clientRequestId,
          actorUserId,
          promptVersion,
          now,
        ],
      );
    } catch (error) {
      const raced = firstRow(await this.dataSource.query(
        `SELECT guide_id, generation_job_id FROM slide_question_guides
         WHERE project_id = $1 AND created_by = $2 AND client_request_id = $3`,
        [projectId, actorUserId, request.clientRequestId],
      ));
      if (!raced?.generation_job_id) throw error;
      const racedJob = await this.jobsService.get(String(raced.generation_job_id));
      if (!racedJob) throw error;
      return slideQuestionGuideJobResponseSchema.parse({ job: racedJob, guideId: raced.guide_id });
    }

    const job = await this.jobsService.create({
      projectId,
      type: "slide-question-guide-generation",
      payload: { guideId },
    });
    await this.dataSource.query(
      `UPDATE slide_question_guides SET generation_job_id = $2, updated_at = now()
       WHERE guide_id = $1 AND project_id = $3`,
      [guideId, job.jobId, projectId],
    );

    try {
      await enqueueSlideQuestionGuideGenerationJob({
        driver: this.config.JOB_QUEUE_DRIVER,
        redisUrl: this.config.REDIS_URL,
        jobId: job.jobId,
        projectId,
        guideId,
      });
      this.logger.info({
        event: "slide_question_guide.enqueued",
        projectId,
        deckId: deck.deckId,
        deckVersion: deck.version,
        slideId: slide.slideId,
        guideId,
        jobId: job.jobId,
      }, "Slide question guide generation enqueued.");
    } catch (error) {
      await this.jobsService.update(job.jobId, {
        status: "failed",
        progress: 0,
        message: "Slide question guide enqueue failed.",
        error: { code: "SLIDE_QUESTION_GUIDE_ENQUEUE_FAILED", message: "Slide question guide enqueue failed." },
      });
      await this.dataSource.query(
        `UPDATE slide_question_guides SET status = 'failed', error_code = $2, updated_at = now()
         WHERE guide_id = $1`,
        [guideId, "SLIDE_QUESTION_GUIDE_ENQUEUE_FAILED"],
      );
      throw error;
    }

    return slideQuestionGuideJobResponseSchema.parse({ job: jobSchema.parse(job), guideId });
  }

  async get(projectId: string, guideId: string) {
    this.assertEnabled();
    const row = firstRow(await this.dataSource.query(
      `SELECT * FROM slide_question_guides WHERE project_id = $1 AND guide_id = $2`,
      [projectId, guideId],
    ));
    if (!row) throw new NotFoundException("Slide question guide not found.");
    if (row.status !== "succeeded") {
      throw new ConflictException({
        code: "SLIDE_QUESTION_GUIDE_NOT_READY",
        message: "Slide question guide is not ready.",
        status: row.status,
        jobId: row.generation_job_id,
      });
    }
    return { guide: await this.toGuide(row) };
  }

  async list(projectId: string, rawQuery: Record<string, string | undefined>) {
    this.assertEnabled();
    const query = listQuerySchema.parse(rawQuery);
    const rows = await this.dataSource.query(
      `SELECT * FROM slide_question_guides
       WHERE project_id = $1 AND deck_id = $2
         AND ($3::text IS NULL OR slide_id = $3)
         AND status = 'succeeded'
       ORDER BY created_at DESC LIMIT 50`,
      [projectId, query.deckId, query.slideId ?? null],
    );
    return slideQuestionGuideListResponseSchema.parse({
      guides: await Promise.all(rows.map((row: Record<string, any>) => this.toGuide(row))),
    });
  }

  private async toGuide(row: Record<string, any>) {
    const itemRows = await this.dataSource.query(
      `SELECT item_json FROM slide_question_guide_items
       WHERE project_id = $1 AND guide_id = $2 ORDER BY question_order`,
      [row.project_id, row.guide_id],
    );
    const guide = {
      schemaVersion: row.schema_version,
      guideId: row.guide_id,
      projectId: row.project_id,
      deckId: row.deck_id,
      deckVersion: row.deck_version,
      slideId: row.slide_id,
      slideContentHash: row.slide_content_hash,
      items: itemRows.map((item: Record<string, any>) => item.item_json),
      generatedAt: toIso(row.generated_at),
      promptVersion: row.prompt_version,
      model: row.model,
    };
    if (Number(row.schema_version) === 2) {
      return slideQuestionGuideSchema.parse({
        ...guide,
        schemaVersion: 2,
        research: {
          status: row.research_status,
          attempts: Number(row.research_attempts),
          officialSourceCount: Number(row.official_source_count),
          issueCodes: jsonArray(row.research_issue_codes),
          researchedAt: row.researched_at ? toIso(row.researched_at) : null,
        },
      });
    }
    return slideQuestionGuideSchema.parse({ ...guide, schemaVersion: 1 });
  }

  private assertEnabled() {
    if (!this.config.SLIDE_QUESTION_GUIDES_ENABLED) {
      throw new ForbiddenException("Slide question guides are not enabled.");
    }
  }
}

function firstRow(value: unknown): Record<string, any> | null {
  if (!Array.isArray(value)) return null;
  const first = value[0];
  return Array.isArray(first) ? (first[0] ?? null) : (first ?? null);
}

function toIso(value: unknown) {
  return value instanceof Date ? value.toISOString() : new Date(String(value)).toISOString();
}

function jsonArray(value: unknown): unknown[] {
  if (Array.isArray(value)) return value;
  if (typeof value !== "string") return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function collectSlideText(value: unknown): string {
  const collected: string[] = [];
  const visit = (candidate: unknown, key = "") => {
    if (typeof candidate === "string" && ["title", "text", "alt", "speakerNotes"].includes(key)) {
      if (candidate.trim()) collected.push(candidate.trim());
      return;
    }
    if (Array.isArray(candidate)) {
      candidate.forEach((item) => visit(item, key));
      return;
    }
    if (candidate && typeof candidate === "object") {
      Object.entries(candidate).forEach(([childKey, child]) => visit(child, childKey));
    }
  };
  visit(value);
  return Array.from(new Set(collected)).join("\n");
}
