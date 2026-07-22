import { loadOrbitConfig } from "@orbit/config";
import {
  slideRedesignProgressChannel,
  slideRedesignProgressEventSchema,
} from "@orbit/shared";
import { Injectable, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import Redis from "ioredis";
import { InjectPinoLogger, PinoLogger } from "nestjs-pino";
import { RealtimeGateway } from "./realtime.gateway";

@Injectable()
export class SlideRedesignProgressSubscriber
  implements OnModuleInit, OnModuleDestroy
{
  private readonly redis = new Redis(
    loadOrbitConfig(process.env, { service: "api" }).REDIS_URL,
    {
      lazyConnect: true,
      maxRetriesPerRequest: 1,
    },
  );

  constructor(
    private readonly realtimeGateway: RealtimeGateway,
    @InjectPinoLogger(SlideRedesignProgressSubscriber.name)
    private readonly logger: PinoLogger,
  ) {}

  async onModuleInit(): Promise<void> {
    this.redis.on("message", this.handleMessage);
    this.redis.on("error", this.handleError);
    await this.redis.subscribe(slideRedesignProgressChannel);
  }

  async onModuleDestroy(): Promise<void> {
    this.redis.off("message", this.handleMessage);
    this.redis.off("error", this.handleError);
    if (this.redis.status === "wait") {
      this.redis.disconnect(false);
      return;
    }
    await this.redis.quit();
  }

  private readonly handleMessage = (channel: string, raw: string): void => {
    if (channel !== slideRedesignProgressChannel) return;
    let decoded: unknown;
    try {
      decoded = JSON.parse(raw);
    } catch {
      this.logInvalidEvent();
      return;
    }
    const parsed = slideRedesignProgressEventSchema.safeParse(decoded);
    if (!parsed.success) {
      this.logInvalidEvent();
      return;
    }
    this.realtimeGateway.publishSlideRedesignProgress(parsed.data);
  };

  private readonly handleError = (error: unknown): void => {
    this.logger.warn(
      {
        event: "slide_redesign.progress.subscriber_error",
        errorName: error instanceof Error ? error.name : "UnknownError",
      },
      "Slide redesign progress subscriber error.",
    );
  };

  private logInvalidEvent(): void {
    this.logger.warn(
      { event: "slide_redesign.progress.invalid_event" },
      "Invalid slide redesign progress event ignored.",
    );
  }
}
