import type {
  AiDeckSqsDelivery,
  AiDeckSqsQueueName,
  AiDeckSqsTransport,
} from "@orbit/job-queue";
import type { AiDeckGenerationStageMessage } from "@orbit/shared";

export interface AiDeckSqsStageConsumerOptions {
  onError?: (error: unknown, message?: AiDeckGenerationStageMessage) => void;
  visibilityHeartbeatMs?: number;
}

export class AiDeckSqsStageConsumer {
  private abortController: AbortController | null = null;
  private loopPromise: Promise<void> | null = null;
  private running = false;

  constructor(
    private readonly transport: AiDeckSqsTransport,
    private readonly queueName: AiDeckSqsQueueName,
    private readonly handler: (
      message: AiDeckGenerationStageMessage,
    ) => Promise<unknown>,
    private readonly options: AiDeckSqsStageConsumerOptions = {},
  ) {}

  start(): void {
    if (this.running) return;
    this.running = true;
    this.loopPromise = this.run();
  }

  async stop(): Promise<void> {
    this.running = false;
    this.abortController?.abort();
    await this.loopPromise;
  }

  async runOnce(abortSignal?: AbortSignal): Promise<void> {
    const deliveries = await this.transport.receive(
      this.queueName,
      abortSignal,
    );
    for (const delivery of deliveries) await this.process(delivery);
  }

  private async run(): Promise<void> {
    while (this.running) {
      this.abortController = new AbortController();
      try {
        await this.runOnce(this.abortController.signal);
      } catch (error) {
        if (!this.running && isAbortError(error)) break;
        this.options.onError?.(error);
        if (this.running) await waitBeforeRetry();
      }
    }
    this.abortController = null;
  }

  private async process(delivery: AiDeckSqsDelivery): Promise<void> {
    const heartbeat = setInterval(() => {
      void this.transport
        .extendVisibility(delivery, 300)
        .catch((error) => this.options.onError?.(error, delivery.message));
    }, this.options.visibilityHeartbeatMs ?? 60_000);
    try {
      await this.handler(delivery.message);
      await this.transport.delete(delivery);
    } catch (error) {
      this.options.onError?.(error, delivery.message);
    } finally {
      clearInterval(heartbeat);
    }
  }
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === "AbortError";
}

function waitBeforeRetry(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 1_000));
}
