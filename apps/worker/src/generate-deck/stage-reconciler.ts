import type { AiDeckGenerationStageMessage } from "@orbit/shared";
import type { DataSource } from "typeorm";

import { recoverAiDeckReferenceExtractionJoinInTransaction } from "./reference-extraction-join";
import { AiDeckGenerationStageCheckpointRepository } from "./stage-checkpoint-repository";

type QueryExecutor = Pick<DataSource, "query">;

export interface AiDeckStageReconcilerOptions {
  limit?: number;
  recoverJoin?: (
    db: QueryExecutor,
    message: AiDeckGenerationStageMessage,
  ) => Promise<void>;
  onError?: (error: unknown, message: AiDeckGenerationStageMessage) => void;
}

export async function reconcileExpiredAiDeckStageLeases(
  dataSource: DataSource,
  options: AiDeckStageReconcilerOptions = {},
): Promise<{ scanned: number; requeued: number; failed: number }> {
  const expired = await new AiDeckGenerationStageCheckpointRepository(
    dataSource,
  ).listExpiredLeases(options.limit ?? 100);
  let requeued = 0;
  let failed = 0;

  for (const candidate of expired) {
    try {
      const status = await dataSource.transaction(async (manager) => {
        const parentRows = await manager.query(
          `
            SELECT job_id
            FROM jobs
            WHERE job_id = $1
              AND project_id = $2
              AND type = 'ai-deck-generation'
              AND status IN ('queued','running')
            FOR UPDATE
          `,
          [candidate.message.pipelineJobId, candidate.message.projectId],
        );
        if (!hasQueryRow(parentRows)) return null;

        const checkpoint = await new AiDeckGenerationStageCheckpointRepository(
          manager,
        ).reconcileExpiredLease(
          candidate.message,
          candidate.attempt,
          {
            code: "REFERENCE_EXTRACTION_LEASE_EXPIRED",
            message: "Reference extraction lease expired before completion.",
            failedStage: "reference-extract-file",
            retryable: true,
          },
          {
            code: "REFERENCE_EXTRACTION_LEASE_EXHAUSTED",
            message: "Reference extraction lease retries were exhausted.",
            failedStage: "reference-extract-file",
            retryable: false,
          },
        );
        if (!checkpoint) return null;
        if (checkpoint.status === "failed") {
          await (
            options.recoverJoin ??
            recoverAiDeckReferenceExtractionJoinInTransaction
          )(manager, candidate.message);
        }
        return checkpoint.status;
      });
      if (status === "queued") requeued += 1;
      if (status === "failed") failed += 1;
    } catch (error) {
      options.onError?.(error, candidate.message);
    }
  }

  return { scanned: expired.length, requeued, failed };
}

function hasQueryRow(queryResult: unknown): boolean {
  if (!Array.isArray(queryResult)) return false;
  const first = queryResult[0];
  return Array.isArray(first) ? first.length > 0 : first !== undefined;
}
