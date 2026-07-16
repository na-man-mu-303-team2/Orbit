import { randomUUID } from "node:crypto";
import { ConflictException } from "@nestjs/common";
import { DataSource } from "typeorm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { StoryPlanReviewService } from "./story-plan-review.service";

const databaseUrl = process.env.ORBIT_INTEGRATION_DATABASE_URL;
const integration = databaseUrl ? describe : describe.skip;

integration("StoryPlanReviewService PostgreSQL lifecycle", () => {
  let dataSource: DataSource;
  const projectId = `story-project-${randomUUID()}`;
  const jobId = `story-job-${randomUUID()}`;
  const sourceArtifactId = randomUUID();
  const contentArtifactId = randomUUID();
  let service: StoryPlanReviewService;

  beforeAll(async () => {
    dataSource = new DataSource({ type: "postgres", url: databaseUrl });
    await dataSource.initialize();
    service = new StoryPlanReviewService(dataSource, {
      info: vi.fn(),
    } as never);
    await dataSource.query(
      `
        INSERT INTO jobs (
          job_id, project_id, type, status, progress, message, payload
        )
        VALUES ($1, $2, 'ai-deck-generation', 'running', 40, 'review', $3::jsonb)
      `,
      [
        jobId,
        projectId,
        { request: { topic: "ORBIT" }, storyReviewRequired: true },
      ],
    );
    await dataSource.query(
      `
        INSERT INTO ai_deck_generation_stages (
          pipeline_job_id, stage, shard_key, status, attempt, input_ref_json
        )
        VALUES
          ($1, 'source-grounding', '', 'succeeded', 1, '{}'::jsonb),
          ($1, 'content-planning', '', 'succeeded', 1, $2::jsonb)
      `,
      [jobId, { planningArtifactId: sourceArtifactId }],
    );
    await dataSource.query(
      `
        INSERT INTO ai_deck_planning_artifacts (
          artifact_id, pipeline_job_id, project_id, stage, shard_key, payload_json
        )
        VALUES
          ($1, $3, $4, 'source-grounding', '', $5::jsonb),
          ($2, $3, $4, 'content-planning', '', $6::jsonb)
      `,
      [
        sourceArtifactId,
        contentArtifactId,
        jobId,
        projectId,
        { rawInput: {}, sourceRecords: [], warnings: [], webSourceCount: 0 },
        {
          rawInput: { research_quality: "complete", source_records: [] },
          contentPlan: {
            outline: { title: "ORBIT", slide_titles: ["핵심"] },
            slidePlans: [
              {
                order: 1,
                slide_type: "summary",
                title: "핵심",
                message: "핵심 메시지",
                speaker_notes: "발표자 노트",
                target_seconds: 60,
                source_refs: [],
              },
            ],
            slideCount: 1,
            repairReasonCodes: [],
          },
        },
      ],
    );
    await dataSource.query(
      `
        UPDATE ai_deck_generation_stages
        SET result_ref_json = $2::jsonb
        WHERE pipeline_job_id = $1 AND stage = 'content-planning'
      `,
      [jobId, { planningArtifactId: contentArtifactId }],
    );
    await dataSource.query(
      `
        INSERT INTO ai_deck_story_reviews (
          pipeline_job_id, project_id, status, revision, regeneration_count
        )
        VALUES ($1, $2, 'review-pending', 1, 0)
      `,
      [jobId, projectId],
    );
  });

  afterAll(async () => {
    if (dataSource?.isInitialized) {
      await dataSource.query("DELETE FROM jobs WHERE job_id = $1", [jobId]);
      await dataSource.destroy();
    }
  });

  it("keeps approval idempotent, enforces regeneration limit, and cancels safely", async () => {
    await expect(service.get(projectId, jobId)).resolves.toMatchObject({
      status: "review-pending",
      plan: { revision: 1, slideCount: 1 },
    });

    await service.approve(projectId, jobId, { expectedRevision: 1 });
    await service.approve(projectId, jobId, { expectedRevision: 1 });
    const designRows = await dataSource.query(
      `SELECT count(*)::int AS count FROM ai_deck_generation_stages
       WHERE pipeline_job_id = $1 AND stage = 'design-planning'`,
      [jobId],
    );
    expect(designRows[0].count).toBe(1);
    await expect(
      service.approve(projectId, jobId, { expectedRevision: 2 }),
    ).rejects.toBeInstanceOf(ConflictException);

    await dataSource.query(
      `DELETE FROM ai_deck_generation_stages
       WHERE pipeline_job_id = $1 AND stage = 'design-planning'`,
      [jobId],
    );
    await dataSource.query(
      `UPDATE ai_deck_story_reviews
       SET status = 'review-pending' WHERE pipeline_job_id = $1`,
      [jobId],
    );
    for (let count = 0; count < 5; count += 1) {
      await service.regenerate(projectId, jobId, {
        expectedRevision: count + 1,
        instruction: "구성을 간결하게",
      });
      await dataSource.query(
        `UPDATE ai_deck_story_reviews
         SET status = 'review-pending', revision = revision + 1
         WHERE pipeline_job_id = $1`,
        [jobId],
      );
      await dataSource.query(
        `UPDATE ai_deck_generation_stages
         SET status = 'succeeded' WHERE pipeline_job_id = $1
           AND stage = 'content-planning'`,
        [jobId],
      );
    }
    await expect(
      service.regenerate(projectId, jobId, { expectedRevision: 6 }),
    ).rejects.toBeInstanceOf(ConflictException);

    await service.cancel(projectId, jobId);
    await service.cancel(projectId, jobId);
    await expect(service.get(projectId, jobId)).resolves.toMatchObject({
      status: "cancelled",
      error: { code: "AI_DECK_GENERATION_CANCELLED" },
    });
  });
});
