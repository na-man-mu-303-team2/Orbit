import { generateDeckJobResultSchema } from "@orbit/shared";
import type { DataSource } from "typeorm";
import { describe, expect, it, vi } from "vitest";

import { publishAtomically } from "./execution-stage.processor";
import { createTestDeck } from "./test-deck.fixture";

const now = "2026-07-16T00:00:00.000Z";
const artifactId = "2e42f833-a1ca-47d0-a410-d25ca9ba4d2e";
const message = {
  pipelineJobId: "job-ai-deck-1",
  projectId: "project-a",
  stage: "publication" as const,
  shardKey: "",
};

describe("publishAtomically", () => {
  it("commits the artifact, checkpoint, Deck, and parent success in one transaction", async () => {
    const deck = createTestDeck(message.projectId);
    const result = generateDeckJobResultSchema.parse({
      deckId: deck.deckId,
      deck,
      warnings: [],
      validation: {
        passed: true,
        layoutIssues: [],
        contentIssues: [],
        designIssues: [],
        presentationIssues: [],
      },
      diagnostics: {},
      coachingProvenance: null,
    });
    const sqlOrder: string[] = [];
    const query = vi.fn(async (sql: string) => {
      const compact = sql.replace(/\s+/g, " ").trim();
      sqlOrder.push(compact);
      if (compact.includes("INSERT INTO ai_deck_execution_artifacts")) {
        return [artifactRow({ result })];
      }
      if (
        compact.includes("UPDATE ai_deck_generation_stages") &&
        compact.includes("SET status = 'succeeded'")
      ) {
        return [checkpointRow()];
      }
      if (compact.includes("INSERT INTO decks")) return [];
      if (compact.includes("UPDATE jobs")) return [parentRow(result)];
      throw new Error(`Unexpected SQL: ${compact}`);
    });
    const transaction = vi.fn(
      async (run: (manager: { query: typeof query }) => unknown) =>
        run({ query }),
    );
    const eventLogger = vi.fn();

    await expect(
      publishAtomically(
        { query, transaction } as unknown as DataSource,
        message,
        "worker-a:lease",
        1,
        result,
        eventLogger,
      ),
    ).resolves.toMatchObject({ status: "succeeded", progress: 100 });

    expect(transaction).toHaveBeenCalledTimes(1);
    expect(
      sqlOrder.findIndex((sql) => sql.includes("INSERT INTO decks")),
    ).toBeLessThan(sqlOrder.findIndex((sql) => sql.includes("UPDATE jobs")));
    expect(eventLogger).toHaveBeenCalledWith(
      "ai-ppt.deck.published",
      expect.objectContaining({ jobId: message.pipelineJobId }),
    );
  });
});

function artifactRow(payload: unknown) {
  return {
    artifact_id: artifactId,
    pipeline_job_id: message.pipelineJobId,
    project_id: message.projectId,
    stage: message.stage,
    shard_key: "",
    payload_json: payload,
  };
}

function checkpointRow() {
  return {
    pipeline_job_id: message.pipelineJobId,
    stage: message.stage,
    shard_key: "",
    status: "succeeded",
    attempt: 1,
    input_ref_json: { executionArtifactId: artifactId },
    result_ref_json: { executionArtifactId: artifactId },
    error_json: null,
    lease_owner: null,
    lease_expires_at: null,
    dispatched_at: now,
    created_at: now,
    updated_at: now,
  };
}

function parentRow(result: unknown) {
  return {
    job_id: message.pipelineJobId,
    project_id: message.projectId,
    type: "ai-deck-generation",
    status: "succeeded",
    progress: 100,
    message: "AI deck generation completed.",
    result,
    error: null,
    created_at: now,
    updated_at: now,
  };
}
