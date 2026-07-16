import Redis from "ioredis";

export class ChallengeQnaEvidenceCache {
  private readonly redis: Redis;
  constructor(redisUrl: string) { this.redis = new Redis(redisUrl, { lazyConnect: true, maxRetriesPerRequest: 1 }); }
  async take(attemptId: string) {
    const key = `challenge-qna:evidence:${attemptId}`;
    const value = await this.redis.get(key);
    if (value !== null) await this.redis.del(key);
    return value;
  }
  async delete(attemptId: string) { await this.redis.del(`challenge-qna:evidence:${attemptId}`); }
  async close() { if (this.redis.status === "wait") this.redis.disconnect(); else if (this.redis.status !== "end") await this.redis.quit(); }
}
