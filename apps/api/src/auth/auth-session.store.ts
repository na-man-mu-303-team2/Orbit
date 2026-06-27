import { loadOrbitConfig } from "@orbit/config";
import { authSessionSchema } from "@orbit/shared";
import type { AuthSession } from "@orbit/shared";
import { Injectable, OnModuleDestroy } from "@nestjs/common";
import { createHmac } from "node:crypto";
import Redis from "ioredis";

export const AUTH_SESSION_STORE = Symbol("AUTH_SESSION_STORE");

export interface AuthSessionStore {
  get(sessionId: string): Promise<AuthSession | null>;
  set(
    sessionId: string,
    session: AuthSession,
    ttlSeconds: number
  ): Promise<void>;
  delete(sessionId: string): Promise<void>;
}

/** Redis에 세션 payload를 저장하고 raw session id 대신 HMAC key로 조회한다. */
@Injectable()
export class RedisAuthSessionStore
  implements AuthSessionStore, OnModuleDestroy
{
  private readonly redis: Redis;
  private readonly sessionSecret: string;

  constructor() {
    const config = loadOrbitConfig(process.env, { service: "api" });
    this.sessionSecret = config.SESSION_SECRET;
    this.redis = new Redis(config.REDIS_URL, {
      lazyConnect: true,
      maxRetriesPerRequest: 1
    });
  }

  /** session id로 Redis payload를 읽고, 깨진 payload는 삭제해 재사용을 막는다. */
  async get(sessionId: string): Promise<AuthSession | null> {
    const value = await this.redis.get(this.key(sessionId));
    if (!value) {
      return null;
    }

    try {
      return authSessionSchema.parse(JSON.parse(value));
    } catch {
      await this.delete(sessionId);
      return null;
    }
  }

  /** shared schema로 검증한 session payload를 지정된 TTL과 함께 Redis에 저장한다. */
  async set(
    sessionId: string,
    session: AuthSession,
    ttlSeconds: number
  ): Promise<void> {
    await this.redis.set(
      this.key(sessionId),
      JSON.stringify(authSessionSchema.parse(session)),
      "EX",
      ttlSeconds
    );
  }

  /** 로그아웃이나 만료 처리 시 session id에 대응하는 Redis key를 삭제한다. */
  async delete(sessionId: string): Promise<void> {
    await this.redis.del(this.key(sessionId));
  }

  /** NestJS 종료 시 Redis 연결 상태에 맞춰 안전하게 연결을 정리한다. */
  async onModuleDestroy(): Promise<void> {
    if (this.redis.status === "end") {
      return;
    }

    if (this.redis.status === "wait") {
      this.redis.disconnect();
      return;
    }

    await this.redis.quit();
  }

  /** Redis key에 raw session id가 남지 않도록 SESSION_SECRET 기반 HMAC digest를 만든다. */
  private key(sessionId: string): string {
    const digest = createHmac("sha256", this.sessionSecret)
      .update(sessionId)
      .digest("hex");
    return `auth:session:${digest}`;
  }
}
