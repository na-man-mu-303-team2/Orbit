import type { AiDeckSqsDelivery, AiDeckSqsTransport } from "@orbit/job-queue";
import { afterEach, describe, expect, it, vi } from "vitest";

import { AiDeckSqsStageConsumer } from "./sqs-stage-consumer";

const message = {
  pipelineJobId: "job-ai-deck-1",
  projectId: "project-a",
  stage: "content-planning" as const,
  shardKey: "",
};

const delivery: AiDeckSqsDelivery = {
  messageId: "message-1",
  message,
  queueUrl: "https://sqs.example/research",
  receiptHandle: "receipt-1",
};

afterEach(() => {
  vi.useRealTimers();
});

describe("AiDeckSqsStageConsumer", () => {
  it("extends visibility while processing and deletes only after success", async () => {
    vi.useFakeTimers();
    let finish!: () => void;
    const handler = vi.fn(
      () => new Promise<void>((resolve) => (finish = resolve)),
    );
    const transport = fakeTransport();
    const consumer = new AiDeckSqsStageConsumer(
      transport,
      "ai-deck-research-content",
      handler,
    );

    const processing = consumer.runOnce();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(transport.extendVisibility).toHaveBeenCalledWith(delivery, 300);
    expect(transport.delete).not.toHaveBeenCalled();

    finish();
    await processing;
    expect(transport.delete).toHaveBeenCalledWith(delivery);
  });

  it("leaves a failed message for SQS redelivery", async () => {
    const transport = fakeTransport();
    const onError = vi.fn();
    const consumer = new AiDeckSqsStageConsumer(
      transport,
      "ai-deck-research-content",
      vi.fn(async () => {
        throw new Error("temporary provider failure");
      }),
      { onError },
    );

    await consumer.runOnce();

    expect(transport.delete).not.toHaveBeenCalled();
    expect(onError).toHaveBeenCalledWith(expect.any(Error), message);
  });

  it("acks duplicate deliveries while a checkpoint-aware handler reuses success", async () => {
    const transport = fakeTransport();
    let checkpoint = "queued";
    let sideEffects = 0;
    const handler = vi.fn(async () => {
      if (checkpoint === "queued") {
        sideEffects += 1;
        checkpoint = "succeeded";
      }
    });
    const consumer = new AiDeckSqsStageConsumer(
      transport,
      "ai-deck-research-content",
      handler,
    );

    await consumer.runOnce();
    await consumer.runOnce();

    expect(sideEffects).toBe(1);
    expect(transport.delete).toHaveBeenCalledTimes(2);
  });
});

function fakeTransport() {
  return {
    receive: vi.fn(async () => [delivery]),
    delete: vi.fn(async () => undefined),
    extendVisibility: vi.fn(async () => undefined),
  } as unknown as AiDeckSqsTransport & {
    receive: ReturnType<typeof vi.fn>;
    delete: ReturnType<typeof vi.fn>;
    extendVisibility: ReturnType<typeof vi.fn>;
  };
}
