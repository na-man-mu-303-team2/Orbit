import { z } from "zod";
import { describe, expect, it, vi } from "vitest";

import {
  contractErrorDiagnostics,
  emitStageEvent,
  stageEventFields,
  unknownErrorDiagnostics,
} from "./stage-diagnostics";

const message = {
  pipelineJobId: "job-ai-deck-1",
  projectId: "project-a",
  stage: "image-slide" as const,
  shardKey: "slide-1",
};

describe("AI deck stage diagnostics", () => {
  it("keeps stage identity while reducing unknown errors to a safe fingerprint", () => {
    const secret = "raw-provider-body-sentinel";
    const error = new Error(secret);
    error.stack = `Error: ${secret}\n    at run (D:\\Projects\\Orbit\\apps\\worker\\src\\generate-deck\\execution-stage.processor.ts:159:9)`;
    const diagnostics = unknownErrorDiagnostics(
      error,
      "AI_DECK_EXECUTION_INTERNAL_ERROR",
      "EXECUTION_FAILURE_UNCLASSIFIED",
    );
    const fields = stageEventFields(
      message,
      "worker-a",
      2,
      Date.now(),
      false,
      diagnostics,
    );

    expect(fields).toMatchObject({
      pipelineJobId: message.pipelineJobId,
      projectId: message.projectId,
      stage: message.stage,
      shardKey: message.shardKey,
      workerId: "worker-a",
      attempt: 2,
      maxAttempts: 5,
      terminal: false,
      error: {
        reasonCode: "EXECUTION_FAILURE_UNCLASSIFIED",
        topFrame:
          "apps/worker/src/generate-deck/execution-stage.processor.ts:159",
      },
    });
    expect(JSON.stringify(fields)).not.toContain(secret);
    expect(diagnostics.messageFingerprint).toMatch(/^[a-f0-9]{16}$/);

    const semanticFields = stageEventFields(
      { ...message, stage: "semantic-quality", shardKey: "" },
      "worker-a",
      1,
      Date.now(),
      true,
      diagnostics,
    );
    expect(semanticFields).toMatchObject({
      stage: "semantic-quality",
      shardKey: "",
      error: {
        topFrame:
          "apps/worker/src/generate-deck/execution-stage.processor.ts:159",
      },
    });
  });

  it("records only safe Zod paths and isolates logger failures", () => {
    const parsed = z
      .object({ workerPayload: z.object({ deck: z.string() }) })
      .safeParse({
        workerPayload: { deck: 42 },
      });
    if (parsed.success) throw new Error("Expected Zod failure");
    expect(
      contractErrorDiagnostics(
        parsed.error,
        "AI_DECK_EXECUTION_CONTRACT_INVALID",
        "EXECUTION_CONTRACT_INVALID",
      ),
    ).toMatchObject({ contractPaths: ["workerPayload.deck"] });

    expect(() =>
      emitStageEvent(
        vi.fn(() => {
          throw new Error("logger down");
        }),
        "event",
        {},
      ),
    ).not.toThrow();
  });
});
