import { DataSource } from "typeorm";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import { AiDeckGenerationStageCheckpointRepository } from "../src/generate-deck/stage-checkpoint-repository";

const databaseUrl = process.env.AI_DECK_3381_POSTGRES_URL;
const describeWithPostgres = databaseUrl ? describe : describe.skip;
const projectIds = [
  "it-pg-transport-project-a",
  "it-pg-transport-project-b",
];
const jobIds = [
  "it-pg-transport-job-a",
  "it-pg-transport-job-b",
];

describeWithPostgres("AI deck PostgreSQL transport integration", () => {
  const dataSource = new DataSource({ type: "postgres", url: databaseUrl });

  beforeAll(async () => {
    await dataSource.initialize();
  });

  afterEach(async () => {
    await cleanup(dataSource);
  });

  afterAll(async () => {
    if (!dataSource.isInitialized) return;
    await cleanup(dataSource);
    await dataSource.destroy();
  });

  it("keeps one user's global running count at five across Worker replicas", async () => {
    await seedProjectAndJob(dataSource, {
      projectId: projectIds[0]!,
      jobId: jobIds[0]!,
      userId: "it-pg-user-a",
    });
    await seedStages(
      dataSource,
      jobIds[0]!,
      Array.from({ length: 6 }, (_, index) => ({
        stage: "image-slide",
        shardKey: `slide-${index + 1}`,
      })),
    );
    const replicas = [
      new AiDeckGenerationStageCheckpointRepository(dataSource),
      new AiDeckGenerationStageCheckpointRepository(dataSource),
    ];
    const claimed = [];
    for (let round = 0; round < 6; round += 1) {
      const roundClaims = await Promise.all(
        replicas.map((repository, index) =>
          repository.claimNext(`worker-${index + 1}`, 5),
        ),
      );
      claimed.push(...roundClaims.filter((value) => value !== null));
    }

    expect(claimed).toHaveLength(5);
    expect(new Set(claimed.map((value) => value!.message.shardKey)).size).toBe(
      5,
    );
    const [counts] = await dataSource.query(
      `
        SELECT COUNT(*) FILTER (WHERE status = 'running')::int AS running,
               COUNT(*) FILTER (WHERE status = 'queued')::int AS queued
        FROM ai_deck_generation_stages
        WHERE pipeline_job_id = $1
      `,
      [jobIds[0]],
    );
    expect(counts).toEqual({ running: 5, queued: 1 });
  });

  it("prefers the user with fewer running stages before checkpoint age", async () => {
    await seedProjectAndJob(dataSource, {
      projectId: projectIds[0]!,
      jobId: jobIds[0]!,
      userId: "it-pg-user-a",
    });
    await seedProjectAndJob(dataSource, {
      projectId: projectIds[1]!,
      jobId: jobIds[1]!,
      userId: "it-pg-user-b",
    });
    await seedStages(dataSource, jobIds[0]!, [
      { stage: "image-slide", shardKey: "running-a", running: true },
      { stage: "image-slide", shardKey: "queued-a" },
    ]);
    await seedStages(dataSource, jobIds[1]!, [
      { stage: "image-slide", shardKey: "queued-b" },
    ]);
    await dataSource.query(
      `
        UPDATE ai_deck_generation_stages
        SET created_at = CASE
          WHEN pipeline_job_id = $1 THEN now() - interval '2 minutes'
          ELSE now() - interval '1 minute'
        END
        WHERE pipeline_job_id = ANY($3::text[])
      `,
      [jobIds[0], jobIds[1], jobIds],
    );

    const next = await new AiDeckGenerationStageCheckpointRepository(
      dataSource,
    ).claimNext("worker-fair", 5);

    expect(next).toMatchObject({
      requestedByUserId: "it-pg-user-b",
      message: { pipelineJobId: jobIds[1], shardKey: "queued-b" },
    });
  });

  it("claims five independent OCR and image checkpoints without duplicates", async () => {
    await seedProjectAndJob(dataSource, {
      projectId: projectIds[0]!,
      jobId: jobIds[0]!,
      userId: "it-pg-user-a",
    });
    await seedStages(dataSource, jobIds[0]!, [
      { stage: "reference-extract-file", shardKey: "file-1" },
      { stage: "reference-extract-file", shardKey: "file-2" },
      { stage: "image-slide", shardKey: "slide-1" },
      { stage: "image-slide", shardKey: "slide-2" },
      { stage: "image-slide", shardKey: "slide-3" },
    ]);
    const repository = new AiDeckGenerationStageCheckpointRepository(dataSource);
    const claims = [];
    for (let index = 0; index < 5; index += 1) {
      claims.push(await repository.claimNext("worker-fanout", 5));
    }

    expect(claims.every((value) => value !== null)).toBe(true);
    expect(
      new Set(
        claims.map(
          (value) => `${value!.message.stage}:${value!.message.shardKey}`,
        ),
      ).size,
    ).toBe(5);
  });
});

async function seedProjectAndJob(
  dataSource: DataSource,
  input: { projectId: string; jobId: string; userId: string },
) {
  await dataSource.query(
    `
      INSERT INTO projects (project_id, workspace_id, title, created_by)
      VALUES ($1, 'it-pg-workspace', 'PostgreSQL transport', $2)
    `,
    [input.projectId, input.userId],
  );
  await dataSource.query(
    `
      INSERT INTO jobs (
        job_id, project_id, type, status, progress, message, payload
      )
      VALUES (
        $1, $2, 'ai-deck-generation', 'running', 10, 'running',
        $3::jsonb
      )
    `,
    [
      input.jobId,
      input.projectId,
      {
        request: { topic: "PostgreSQL transport" },
        requestedByUserId: input.userId,
      },
    ],
  );
}

async function seedStages(
  dataSource: DataSource,
  jobId: string,
  stages: Array<{
    stage: "reference-extract-file" | "image-slide";
    shardKey: string;
    running?: boolean;
  }>,
) {
  for (const stage of stages) {
    await dataSource.query(
      `
        INSERT INTO ai_deck_generation_stages (
          pipeline_job_id, stage, shard_key, status, attempt,
          lease_owner, lease_expires_at
        )
        VALUES (
          $1, $2, $3, $4, $5,
          $6, $7
        )
      `,
      [
        jobId,
        stage.stage,
        stage.shardKey,
        stage.running ? "running" : "queued",
        stage.running ? 1 : 0,
        stage.running
          ? "worker-existing:7dc4ed60-2d85-4f13-b3ca-c6bb4ed54f8a"
          : null,
        stage.running ? new Date(Date.now() + 600_000) : null,
      ],
    );
  }
}

async function cleanup(dataSource: DataSource) {
  await dataSource.query("DELETE FROM jobs WHERE job_id = ANY($1::text[])", [
    jobIds,
  ]);
  await dataSource.query(
    "DELETE FROM projects WHERE project_id = ANY($1::text[])",
    [projectIds],
  );
}
