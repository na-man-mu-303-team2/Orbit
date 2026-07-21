import { loadOrbitConfig } from "@orbit/config";
import {
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  OnModuleDestroy,
  Optional,
} from "@nestjs/common";
import { createHmac } from "node:crypto";
import Redis from "ioredis";

export const COMMUNITY_TEMPLATE_RATE_LIMIT_REDIS = Symbol(
  "COMMUNITY_TEMPLATE_RATE_LIMIT_REDIS",
);

type CommunityRateLimitAction =
  | "comment"
  | "engagement"
  | "manage"
  | "publish"
  | "report"
  | "share"
  | "view";

type RateLimitRedis = Pick<Redis, "eval" | "quit" | "disconnect" | "status">;

const limits: Record<CommunityRateLimitAction, { count: number; seconds: number }> = {
  comment: { count: 20, seconds: 60 },
  engagement: { count: 60, seconds: 60 },
  manage: { count: 10, seconds: 60 },
  publish: { count: 5, seconds: 3600 },
  report: { count: 5, seconds: 3600 },
  share: { count: 30, seconds: 60 },
  view: { count: 120, seconds: 60 },
};

const incrementWithExpiryScript = `
  local count = redis.call("INCR", KEYS[1])
  if count == 1 then
    redis.call("EXPIRE", KEYS[1], ARGV[1])
  end
  return count
`;

@Injectable()
export class CommunityTemplateRateLimitService implements OnModuleDestroy {
  private readonly redis: RateLimitRedis;
  private readonly secret: string;

  constructor(
    @Optional()
    @Inject(COMMUNITY_TEMPLATE_RATE_LIMIT_REDIS)
    redis?: RateLimitRedis,
  ) {
    const config = loadOrbitConfig(process.env, { service: "api" });
    this.secret = config.SESSION_SECRET;
    this.redis =
      redis ??
      new Redis(config.REDIS_URL, {
        lazyConnect: true,
        maxRetriesPerRequest: 1,
      });
  }

  async consume(action: CommunityRateLimitAction, userId: string): Promise<void> {
    const limit = limits[action];
    const digest = createHmac("sha256", this.secret)
      .update(`${action}\0${userId}`)
      .digest("hex");
    const count = Number(
      await this.redis.eval(
        incrementWithExpiryScript,
        1,
        `community-template:rate:${action}:${digest}`,
        limit.seconds,
      ),
    );
    if (!Number.isFinite(count) || count > limit.count) {
      throw new HttpException(
        "요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.",
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
  }

  async onModuleDestroy(): Promise<void> {
    if (this.redis.status === "end") return;
    if (this.redis.status === "wait") {
      this.redis.disconnect();
      return;
    }
    await this.redis.quit();
  }
}
