import {
  slideRedesignProgressChannel,
  slideRedesignProgressEventSchema,
  type SlideRedesignProgressEvent,
} from "@orbit/shared";
import Redis from "ioredis";

export class SlideRedesignProgressRedisPublisher {
  private readonly redis: Redis;

  constructor(redisUrl: string) {
    this.redis = new Redis(redisUrl, {
      lazyConnect: true,
      maxRetriesPerRequest: 1,
    });
  }

  async publish(event: SlideRedesignProgressEvent): Promise<void> {
    const parsed = slideRedesignProgressEventSchema.parse(event);
    await this.redis.publish(
      slideRedesignProgressChannel,
      JSON.stringify(parsed),
    );
  }

  async close(): Promise<void> {
    if (this.redis.status === "wait") {
      this.redis.disconnect(false);
      return;
    }
    await this.redis.quit();
  }
}
