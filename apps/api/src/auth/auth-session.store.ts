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

  async delete(sessionId: string): Promise<void> {
    await this.redis.del(this.key(sessionId));
  }

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

  private key(sessionId: string): string {
    const digest = createHmac("sha256", this.sessionSecret)
      .update(sessionId)
      .digest("hex");
    return `auth:session:${digest}`;
  }
}
