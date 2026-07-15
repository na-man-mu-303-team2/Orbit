import { describe, expect, it, vi } from "vitest";

import { AiDeckPlanningArtifactRepository } from "./planning-artifact-repository";

const message = {
  pipelineJobId: "job-ai-deck-1",
  projectId: "project-a",
  stage: "source-grounding" as const,
  shardKey: "",
};
const artifactId = "1d31f722-90b9-44c1-9697-8c26d91ef543";
const payload = {
  rawInput: { topic: "Safe topic" },
  sourceRecords: [],
  warnings: ["Web research quality was insufficient; usable input was kept."],
  webSourceCount: 0,
};

describe("AiDeckPlanningArtifactRepository", () => {
  it("upserts one stage artifact and returns only its strict locator", async () => {
    const query = vi.fn(async (_sql: string, _parameters?: unknown[]) => [
      artifactRow(),
    ]);
    const repository = new AiDeckPlanningArtifactRepository({ query });

    await expect(repository.upsert(message, payload)).resolves.toEqual({
      planningArtifactId: artifactId,
    });

    expect(query).toHaveBeenCalledWith(
      expect.stringContaining("ON CONFLICT (pipeline_job_id, stage) DO UPDATE"),
      expect.arrayContaining([
        message.pipelineJobId,
        message.projectId,
        message.stage,
        payload,
      ]),
    );
  });

  it("loads locators only inside the same tenant, pipeline, and expected stage", async () => {
    const query = vi.fn(async (_sql: string, _parameters?: unknown[]) => [
      artifactRow(),
    ]);
    const repository = new AiDeckPlanningArtifactRepository({ query });

    await expect(
      repository.get(
        message,
        { planningArtifactId: artifactId },
        "source-grounding",
      ),
    ).resolves.toMatchObject({
      artifactId,
      pipelineJobId: message.pipelineJobId,
      projectId: message.projectId,
      stage: message.stage,
      payload,
    });
    expect(query.mock.calls[0]?.[1]).toEqual([
      artifactId,
      message.pipelineJobId,
      message.projectId,
      "source-grounding",
    ]);
  });

  it("rejects missing artifacts and mismatched stored identities", async () => {
    const missing = new AiDeckPlanningArtifactRepository({
      query: vi.fn(async () => []),
    });
    await expect(
      missing.get(message, { planningArtifactId: artifactId }, "source-grounding"),
    ).rejects.toThrow("Planning artifact not found");

    const mismatched = new AiDeckPlanningArtifactRepository({
      query: vi.fn(async () => [artifactRow({ project_id: "project-b" })]),
    });
    await expect(mismatched.upsert(message, payload)).rejects.toThrow(
      "identity is invalid",
    );
  });

  it("rejects undeclared stage payload fields before persistence", async () => {
    const query = vi.fn();
    const repository = new AiDeckPlanningArtifactRepository({ query });

    await expect(
      repository.upsert(message, { ...payload, providerResponse: { raw: true } }),
    ).rejects.toThrow();
    expect(query).not.toHaveBeenCalled();
  });
});

function artifactRow(overrides: Record<string, unknown> = {}) {
  return {
    artifact_id: artifactId,
    pipeline_job_id: message.pipelineJobId,
    project_id: message.projectId,
    stage: message.stage,
    shard_key: "",
    payload_json: payload,
    created_at: "2026-07-16T00:00:00.000Z",
    updated_at: "2026-07-16T00:00:00.000Z",
    ...overrides,
  };
}
