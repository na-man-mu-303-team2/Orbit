import Redis from "ioredis";

export const REHEARSAL_TRANSCRIPT_TTL_SECONDS = 30 * 60;

export interface RehearsalTranscriptCache {
  set(runId: string, transcript: string): Promise<void>;
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
