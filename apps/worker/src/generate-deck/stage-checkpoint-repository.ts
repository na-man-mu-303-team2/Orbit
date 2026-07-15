import {
  aiDeckGenerationStageMessageSchema,
  aiDeckGenerationStageSchema,
  aiDeckGenerationStageStatusSchema,
  jobErrorSchema,
  type AiDeckGenerationStage,
  type AiDeckGenerationStageMessage,
  type AiDeckGenerationStageStatus,
  type JobError,
} from "@orbit/shared";
import type { DataSource } from "typeorm";
import { z } from "zod";

type QueryExecutor = Pick<DataSource, "query">;

const referenceSchema = z.record(z.unknown());
const leaseOwnerSchema = z.string().trim().min(1);
const retryableErrorSchema = jobErrorSchema.extend({
  retryable: z.literal(true),
});
const timestampSchema = z.union([z.date(), z.string().min(1)]);

const checkpointRowSchema = z.object({
  pipeline_job_id: z.string().min(1),
  stage: aiDeckGenerationStageSchema,
  shard_key: z.string(),
  status: aiDeckGenerationStageStatusSchema,
  attempt: z.number().int().min(0).max(5),
  input_ref_json: referenceSchema,
  result_ref_json: referenceSchema.nullable(),
  error_json: jobErrorSchema.nullable(),
  lease_owner: z.string().nullable(),
  lease_expires_at: timestampSchema.nullable(),
  dispatched_at: timestampSchema.nullable(),
  created_at: timestampSchema,
  updated_at: timestampSchema,
});

export interface AiDeckGenerationStageCheckpoint {
  pipelineJobId: string;
  stage: AiDeckGenerationStage;
  shardKey: string;
  status: AiDeckGenerationStageStatus;
  attempt: number;
  inputRef: Record<string, unknown>;
  resultRef: Record<string, unknown> | null;
  error: JobError | null;
  leaseOwner: string | null;
  leaseExpiresAt: string | null;
  dispatchedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export class AiDeckGenerationStageCheckpointRepository {
  constructor(private readonly db: QueryExecutor) {}

  async ensureQueued(
    rawMessage: unknown,
    rawInputRef: unknown = {},
  ): Promise<AiDeckGenerationStageCheckpoint | null> {
    const message = aiDeckGenerationStageMessageSchema.parse(rawMessage);
    const inputRef = referenceSchema.parse(rawInputRef);
    const rows = await this.db.query(
      `
        INSERT INTO ai_deck_generation_stages (
          pipeline_job_id,
          stage,
          shard_key,
          input_ref_json
        )
        SELECT jobs.job_id, $3, $4, $5::jsonb
        FROM jobs
        WHERE jobs.job_id = $1
          AND jobs.project_id = $2
          AND jobs.type = 'ai-deck-generation'
          AND jobs.status IN ('queued','running')
        ON CONFLICT (pipeline_job_id, stage, shard_key) DO NOTHING
        RETURNING *
      `,
      messageParameters(message, inputRef),
    );
    return checkpointFromQuery(rows) ?? this.get(message);
  }

  async get(
    rawMessage: unknown,
  ): Promise<AiDeckGenerationStageCheckpoint | null> {
    const message = aiDeckGenerationStageMessageSchema.parse(rawMessage);
    const rows = await this.db.query(
      `
        SELECT stages.*
        FROM ai_deck_generation_stages stages
        JOIN jobs ON jobs.job_id = stages.pipeline_job_id
        WHERE stages.pipeline_job_id = $1
          AND jobs.project_id = $2
          AND jobs.type = 'ai-deck-generation'
          AND stages.stage = $3
          AND stages.shard_key = $4
      `,
      messageParameters(message),
    );
    return checkpointFromQuery(rows);
  }

  async claim(
    rawMessage: unknown,
    rawLeaseOwner: unknown,
  ): Promise<AiDeckGenerationStageCheckpoint | null> {
    const message = aiDeckGenerationStageMessageSchema.parse(rawMessage);
    const leaseOwner = leaseOwnerSchema.parse(rawLeaseOwner);
    const rows = await this.db.query(
      `
        UPDATE ai_deck_generation_stages stages
        SET status = 'running',
            attempt = stages.attempt + 1,
            error_json = NULL,
            lease_owner = $5,
            lease_expires_at = now() + interval '10 minutes',
            updated_at = now()
        FROM jobs
        WHERE jobs.job_id = stages.pipeline_job_id
          AND jobs.project_id = $2
          AND jobs.type = 'ai-deck-generation'
          AND jobs.status IN ('queued','running')
          AND stages.pipeline_job_id = $1
          AND stages.stage = $3
          AND stages.shard_key = $4
          AND stages.status = 'queued'
          AND stages.attempt < 5
        RETURNING stages.*
      `,
      messageParameters(message, leaseOwner),
    );
    return checkpointFromQuery(rows);
  }

  async renewLease(
    rawMessage: unknown,
    rawLeaseOwner: unknown,
  ): Promise<AiDeckGenerationStageCheckpoint | null> {
    const message = aiDeckGenerationStageMessageSchema.parse(rawMessage);
    const leaseOwner = leaseOwnerSchema.parse(rawLeaseOwner);
    const rows = await this.db.query(
      `
        UPDATE ai_deck_generation_stages stages
        SET lease_expires_at = now() + interval '10 minutes',
            updated_at = now()
        FROM jobs
        WHERE jobs.job_id = stages.pipeline_job_id
          AND jobs.project_id = $2
          AND jobs.type = 'ai-deck-generation'
          AND jobs.status IN ('queued','running')
          AND stages.pipeline_job_id = $1
          AND stages.stage = $3
          AND stages.shard_key = $4
          AND stages.status = 'running'
          AND stages.lease_owner = $5
          AND stages.lease_expires_at > now()
        RETURNING stages.*
      `,
      messageParameters(message, leaseOwner),
    );
    return checkpointFromQuery(rows);
  }

  async succeed(
    rawMessage: unknown,
    rawLeaseOwner: unknown,
    rawResultRef: unknown,
  ): Promise<AiDeckGenerationStageCheckpoint | null> {
    const message = aiDeckGenerationStageMessageSchema.parse(rawMessage);
    const leaseOwner = leaseOwnerSchema.parse(rawLeaseOwner);
    const resultRef = referenceSchema.parse(rawResultRef);
    const rows = await this.db.query(
      `
        UPDATE ai_deck_generation_stages stages
        SET status = 'succeeded',
            result_ref_json = $6::jsonb,
            error_json = NULL,
            lease_owner = NULL,
            lease_expires_at = NULL,
            updated_at = now()
        FROM jobs
        WHERE jobs.job_id = stages.pipeline_job_id
          AND jobs.project_id = $2
          AND jobs.type = 'ai-deck-generation'
          AND jobs.status IN ('queued','running')
          AND stages.pipeline_job_id = $1
          AND stages.stage = $3
          AND stages.shard_key = $4
          AND stages.status = 'running'
          AND stages.lease_owner = $5
          AND stages.lease_expires_at > now()
        RETURNING stages.*
      `,
      messageParameters(message, leaseOwner, resultRef),
    );
    return checkpointFromQuery(rows);
  }

  async fail(
    rawMessage: unknown,
    rawLeaseOwner: unknown,
    rawError: unknown,
  ): Promise<AiDeckGenerationStageCheckpoint | null> {
    const message = aiDeckGenerationStageMessageSchema.parse(rawMessage);
    const leaseOwner = leaseOwnerSchema.parse(rawLeaseOwner);
    const error = jobErrorSchema.parse(rawError);
    const rows = await this.db.query(
      `
        UPDATE ai_deck_generation_stages stages
        SET status = 'failed',
            error_json = $6::jsonb,
            lease_owner = NULL,
            lease_expires_at = NULL,
            updated_at = now()
        FROM jobs
        WHERE jobs.job_id = stages.pipeline_job_id
          AND jobs.project_id = $2
          AND jobs.type = 'ai-deck-generation'
          AND jobs.status IN ('queued','running')
          AND stages.pipeline_job_id = $1
          AND stages.stage = $3
          AND stages.shard_key = $4
          AND stages.status = 'running'
          AND stages.lease_owner = $5
          AND stages.lease_expires_at > now()
        RETURNING stages.*
      `,
      messageParameters(message, leaseOwner, error),
    );
    return checkpointFromQuery(rows);
  }

  async releaseForRetry(
    rawMessage: unknown,
    rawLeaseOwner: unknown,
    rawError: unknown,
  ): Promise<AiDeckGenerationStageCheckpoint | null> {
    const message = aiDeckGenerationStageMessageSchema.parse(rawMessage);
    const leaseOwner = leaseOwnerSchema.parse(rawLeaseOwner);
    const error = retryableErrorSchema.parse(rawError);
    const rows = await this.db.query(
      `
        UPDATE ai_deck_generation_stages stages
        SET status = 'queued',
            result_ref_json = NULL,
            error_json = $6::jsonb,
            lease_owner = NULL,
            lease_expires_at = NULL,
            dispatched_at = NULL,
            updated_at = now()
        FROM jobs
        WHERE jobs.job_id = stages.pipeline_job_id
          AND jobs.project_id = $2
          AND jobs.type = 'ai-deck-generation'
          AND jobs.status IN ('queued','running')
          AND stages.pipeline_job_id = $1
          AND stages.stage = $3
          AND stages.shard_key = $4
          AND stages.status = 'running'
          AND stages.lease_owner = $5
          AND stages.lease_expires_at > now()
          AND stages.attempt < 5
        RETURNING stages.*
      `,
      messageParameters(message, leaseOwner, error),
    );
    return checkpointFromQuery(rows);
  }

  async markDispatched(
    rawMessage: unknown,
  ): Promise<AiDeckGenerationStageCheckpoint | null> {
    const message = aiDeckGenerationStageMessageSchema.parse(rawMessage);
    const rows = await this.db.query(
      `
        UPDATE ai_deck_generation_stages stages
        SET dispatched_at = now(),
            updated_at = now()
        FROM jobs
        WHERE jobs.job_id = stages.pipeline_job_id
          AND jobs.project_id = $2
          AND jobs.type = 'ai-deck-generation'
          AND jobs.status IN ('queued','running')
          AND stages.pipeline_job_id = $1
          AND stages.stage = $3
          AND stages.shard_key = $4
          AND stages.status = 'queued'
          AND stages.dispatched_at IS NULL
        RETURNING stages.*
      `,
      messageParameters(message),
    );
    return checkpointFromQuery(rows);
  }
}

function messageParameters(
  message: AiDeckGenerationStageMessage,
  ...extra: unknown[]
): unknown[] {
  return [
    message.pipelineJobId,
    message.projectId,
    message.stage,
    message.shardKey,
    ...extra,
  ];
}

function checkpointFromQuery(
  queryResult: unknown,
): AiDeckGenerationStageCheckpoint | null {
  const rawRow = firstQueryRow(queryResult);
  if (!rawRow) return null;
  const row = checkpointRowSchema.parse(rawRow);
  return {
    pipelineJobId: row.pipeline_job_id,
    stage: row.stage,
    shardKey: row.shard_key,
    status: row.status,
    attempt: row.attempt,
    inputRef: row.input_ref_json,
    resultRef: row.result_ref_json,
    error: row.error_json,
    leaseOwner: row.lease_owner,
    leaseExpiresAt: optionalIso(row.lease_expires_at),
    dispatchedAt: optionalIso(row.dispatched_at),
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at),
  };
}

function firstQueryRow(queryResult: unknown): unknown | null {
  if (!Array.isArray(queryResult)) return null;
  const first = queryResult[0];
  if (Array.isArray(first)) return first[0] ?? null;
  return first ?? null;
}

function optionalIso(value: Date | string | null): string | null {
  return value === null ? null : toIso(value);
}

function toIso(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}
