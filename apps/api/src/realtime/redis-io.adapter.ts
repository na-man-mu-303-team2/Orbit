import { createAdapter } from "@socket.io/redis-adapter";
import { IoAdapter } from "@nestjs/platform-socket.io";
import type { INestApplicationContext } from "@nestjs/common";
import Redis from "ioredis";
import type { ServerOptions } from "socket.io";

export class RedisIoAdapter extends IoAdapter {
  private adapterConstructor?: ReturnType<typeof createAdapter>;
  private publisher?: Redis;
  private subscriber?: Redis;

  constructor(
    app: INestApplicationContext,
    private readonly redisUrl: string,
  ) {
    super(app);
  }

  async connectToRedis(): Promise<void> {
    const publisher = new Redis(this.redisUrl, {
      lazyConnect: true,
      maxRetriesPerRequest: null,
    });
    const subscriber = publisher.duplicate();

    try {
      await Promise.all([publisher.connect(), subscriber.connect()]);
    } catch (error) {
      publisher.disconnect();
      subscriber.disconnect();
      throw error;
    }

    this.publisher = publisher;
    this.subscriber = subscriber;
    this.adapterConstructor = createAdapter(publisher, subscriber);
  }

  override createIOServer(port: number, options?: ServerOptions) {
    const server = super.createIOServer(port, options);
    if (!this.adapterConstructor) {
      throw new Error("Socket.IO Redis adapter is not connected.");
    }
    server.adapter(this.adapterConstructor);
    return server;
  }

  override async close(
    server: Parameters<IoAdapter["close"]>[0],
  ): Promise<void> {
    await super.close(server);
    await Promise.all([
      this.publisher?.quit(),
      this.subscriber?.quit(),
    ]);
  }
}
