import { loadOrbitConfig } from "@orbit/config";
import { Injectable, OnModuleDestroy } from "@nestjs/common";
import Redis from "ioredis";

export const CHALLENGE_QNA_EVIDENCE_TTL_SECONDS = 10 * 60;
export const challengeQnaEvidenceKey = (attemptId: string) => `challenge-qna:evidence:${attemptId}`;

@Injectable()
export class ChallengeQnaEvidenceCache implements OnModuleDestroy {
  private readonly redis = new Redis(loadOrbitConfig(process.env, { service: "api" }).PRIVATE_EVIDENCE_REDIS_URL, {
    lazyConnect: true, maxRetriesPerRequest: 1,
  });

  async putText(attemptId: string, answerText: string) {
    await this.redis.set(challengeQnaEvidenceKey(attemptId), answerText, "EX", CHALLENGE_QNA_EVIDENCE_TTL_SECONDS);
  }

  async delete(attemptId: string) { await this.redis.del(challengeQnaEvidenceKey(attemptId)); }

  async onModuleDestroy() {
    if (this.redis.status === "wait") this.redis.disconnect();
    else if (this.redis.status !== "end") await this.redis.quit();
  }
}
