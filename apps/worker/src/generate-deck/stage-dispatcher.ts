import {
  enqueueAiDeckGenerationStageJob,
  type AiDeckGenerationStageEnqueueResult,
  type EnqueueAiDeckGenerationStageJobInput,
} from "@orbit/job-queue";
import type { AiDeckGenerationStageMessage } from "@orbit/shared";

import type {
  DispatchableAiDeckGenerationStage,
} from "./stage-checkpoint-repository";

interface DispatchRepository {
  recoverStaleDispatches(limit?: number): Promise<number>;
  listUndispatched(limit?: number): Promise<DispatchableAiDeckGenerationStage[]>;
  markDispatched(
    message: AiDeckGenerationStageMessage,
    observedAttempt: number,
  ): Promise<unknown | null>;
}

type StageEnqueuer = (
  input: EnqueueAiDeckGenerationStageJobInput,
) => Promise<AiDeckGenerationStageEnqueueResult>;

export interface AiDeckStageDispatcherOptions {
  driver: "bullmq" | "sqs";
  redisUrl: string;
  enqueue?: StageEnqueuer;
  limit?: number;
  onError?: (error: unknown, message: AiDeckGenerationStageMessage) => void;
}

const durableDispatchStates = new Set(["waiting", "delayed", "prioritized"]);

export async function dispatchAiDeckGenerationStages(
  repository: DispatchRepository,
  options: AiDeckStageDispatcherOptions,
): Promise<{ scanned: number; dispatched: number }> {
  const limit = options.limit ?? 100;
  await repository.recoverStaleDispatches(limit);
  const pending = await repository.listUndispatched(limit);
  let dispatched = 0;
  for (const checkpoint of pending) {
    if (!isReferenceExtractionCheckpoint(checkpoint)) continue;
    let result: AiDeckGenerationStageEnqueueResult;
    try {
      result = await (options.enqueue ?? enqueueAiDeckGenerationStageJob)({
        driver: options.driver,
        redisUrl: options.redisUrl,
        message: checkpoint.message,
      });
    } catch (error) {
      options.onError?.(error, checkpoint.message);
      continue;
    }
    if (!durableDispatchStates.has(result.state)) continue;
    const marked = await repository.markDispatched(
      checkpoint.message,
      checkpoint.attempt,
    );
    if (marked) dispatched += 1;
  }
  return { scanned: pending.length, dispatched };
}

function isReferenceExtractionCheckpoint(
  checkpoint: DispatchableAiDeckGenerationStage,
): boolean {
  return checkpoint.message.stage === "reference-extract-file";
}
