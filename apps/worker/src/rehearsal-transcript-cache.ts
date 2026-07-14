import {
  rehearsalSemanticEvidenceCacheKey,
  rehearsalSemanticEvidenceSchema,
  type RehearsalSemanticEvidence
} from "@orbit/shared";
import Redis from "ioredis";

export const REHEARSAL_TRANSCRIPT_TTL_SECONDS = 30 * 60;

export interface RehearsalTranscriptCache {
  set(runId: string, transcript: string): Promise<void>;
  setSemanticEvidence(
    runId: string,
    evidence: RehearsalSemanticEvidence
  ): Promise<void>;
  getSemanticEvidence(runId: string): Promise<RehearsalSemanticEvidence | null>;
  close(): Promise<void>;
}

export class RedisRehearsalTranscriptCache implements RehearsalTranscriptCache {
  private readonly redis: Redis;

  constructor(redisUrl: string) {
    this.redis = new Redis(redisUrl, {
      lazyConnect: true,
      maxRetriesPerRequest: 1
    });
  }

  async set(runId: string, transcript: string): Promise<void> {
    const retainedTranscript = transcript.trim();
    if (!retainedTranscript) {
      return;
    }

    await this.redis.set(
      rehearsalTranscriptCacheKey(runId),
      retainedTranscript,
      "EX",
      REHEARSAL_TRANSCRIPT_TTL_SECONDS
    );
  }

  async setSemanticEvidence(
    runId: string,
    evidence: RehearsalSemanticEvidence
  ): Promise<void> {
    const retainedEvidence = rehearsalSemanticEvidenceSchema.parse(evidence);
    if (retainedEvidence.segments.length === 0) {
      return;
    }

    await this.redis.set(
      rehearsalSemanticEvidenceCacheKey(runId),
      JSON.stringify(retainedEvidence),
      "EX",
      REHEARSAL_TRANSCRIPT_TTL_SECONDS
    );
  }

  async getSemanticEvidence(
    runId: string
  ): Promise<RehearsalSemanticEvidence | null> {
    const value = await this.redis.get(rehearsalSemanticEvidenceCacheKey(runId));
    return value === null
      ? null
      : rehearsalSemanticEvidenceSchema.parse(JSON.parse(value));
  }

  async close(): Promise<void> {
    if (this.redis.status === "end") {
      return;
    }

    if (this.redis.status === "wait") {
      this.redis.disconnect();
      return;
    }

    await this.redis.quit();
  }
}

export function rehearsalTranscriptCacheKey(runId: string) {
  return `rehearsal:transcript:${runId}`;
}
