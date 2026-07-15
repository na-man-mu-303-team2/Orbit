import { describe, expect, it, vi } from "vitest";

import { AiDeckExecutionArtifactRepository } from "./execution-artifact-repository";
import { createTestDeck } from "./test-deck.fixture";

const artifactId = "2e42f833-a1ca-47d0-a410-d25ca9ba4d2e";
const message = {
  pipelineJobId: "job-ai-deck-1",
  projectId: "project-a",
  stage: "image-slide" as const,
  shardKey: "slide-1",
};

describe("AiDeckExecutionArtifactRepository", () => {
  it("upserts a slide-scoped artifact and returns only its UUID locator", async () => {
    const slide = createTestDeck().slides[0];
    const query = vi.fn(async (_sql: string, _parameters?: unknown[]) => [
      artifactRow({ slide, warnings: [] }),
    ]);
    const repository = new AiDeckExecutionArtifactRepository({ query });

    await expect(
      repository.upsert(message, { slide, warnings: [] }),
    ).resolves.toEqual({ executionArtifactId: artifactId });
    const parameters = query.mock.calls[0]?.[1] as unknown[] | undefined;
    expect(parameters?.slice(1, 5)).toEqual([
      message.pipelineJobId,
      message.projectId,
      message.stage,
      message.shardKey,
    ]);
  });

  it("rejects an artifact that crosses the requested tenant identity", async () => {
    const slide = createTestDeck().slides[0];
    const query = vi.fn(async (_sql: string, _parameters?: unknown[]) => [
      { ...artifactRow({ slide, warnings: [] }), project_id: "project-b" },
    ]);
    const repository = new AiDeckExecutionArtifactRepository({ query });

    await expect(
      repository.get(
        message,
        { executionArtifactId: artifactId },
        "image-slide",
        "slide-1",
      ),
    ).rejects.toThrow(/identity/i);
  });
});

function artifactRow(payload: unknown) {
  return {
    artifact_id: artifactId,
    pipeline_job_id: message.pipelineJobId,
    project_id: message.projectId,
    stage: message.stage,
    shard_key: message.shardKey,
    payload_json: payload,
  };
}
