import type { DataSource } from "typeorm";
import { describe, expect, it, vi } from "vitest";

import { processAiDeckPlanningStage } from "./planning-stage.processor";
import { createTestDeck } from "./test-deck.fixture";

const now = "2026-07-16T00:00:00.000Z";
const planningArtifactId = "1d31f722-90b9-44c1-9697-8c26d91ef543";
const sourceMessage = {
  pipelineJobId: "job-ai-deck-1",
  projectId: "project-a",
  stage: "source-grounding" as const,
  shardKey: "",
};
const sourcePayload = {
  rawInput: {
    topic: "Safe topic",
    research_quality: "partial",
    research_issue_codes: ["independent-missing"],
    research_attempts: 3,
    relevant_web_source_count: 1,
    official_web_source_count: 1,
    independent_web_source_count: 0,
    research_fact_coverage_satisfied: true,
    warningCodes: ["WEB_RESEARCH_QUALITY_FAILED"],
  },
  sourceRecords: [],
  warnings: ["Web research quality was insufficient; usable input was kept."],
  webSourceCount: 0,
};

describe("processAiDeckPlanningStage", () => {
  it("commits the artifact, checkpoint, next stage, and parent progress together", async () => {
    const eventLogger = vi.fn();
    const query = vi.fn(async (sql: string, parameters?: unknown[]) => {
      const compact = compactSql(sql);
      if (
        compact.includes("SET status = 'running', attempt = stages.attempt + 1")
      ) {
        return [checkpointRow(sourceMessage.stage, "running", 1, {})];
      }
      if (compact.includes("SELECT payload FROM jobs")) {
        return [{ payload: { request: { topic: "Safe topic" } } }];
      }
      if (compact.includes("FROM ai_deck_reference_extraction_artifacts")) {
        return [
          {
            extraction_json: {
              projectId: "project-a",
              referenceDocumentId: "file-a",
              fileName: "source.pdf",
              kind: "pdf",
              status: "succeeded",
              cleanedText: "Grounded source text",
            },
          },
        ];
      }
      if (compact.includes("INSERT INTO ai_deck_planning_artifacts")) {
        return [artifactRow("source-grounding", sourcePayload)];
      }
      if (compact.includes("SET status = 'succeeded'")) {
        return [
          checkpointRow(
            sourceMessage.stage,
            "succeeded",
            1,
            {},
            {
              planningArtifactId,
            },
          ),
        ];
      }
      if (compact.includes("INSERT INTO ai_deck_generation_stages")) {
        expect(parameters?.[2]).toBe("content-planning");
        expect(parameters?.[4]).toEqual({ planningArtifactId });
        return [
          checkpointRow("content-planning", "queued", 0, {
            planningArtifactId,
          }),
        ];
      }
      if (compact.includes("UPDATE jobs SET status = 'running'")) {
        return [parentRow("running", 25)];
      }
      throw new Error(`Unexpected SQL: ${compact}`);
    });
    const dataSource = fakeDataSource(query);
    const fetchImpl = vi.fn(
      async (_input: string | URL | Request, init?: RequestInit) => {
        const body = JSON.parse(String(init?.body)) as {
          request: Record<string, unknown>;
        };
        expect(body.request).toMatchObject({
          projectId: "project-a",
          topic: "Safe topic",
          referenceContext: [
            {
              fileId: "file-a",
              title: "source.pdf",
              content: "Grounded source text",
              sourceId: "reference:file-a",
            },
          ],
          designProgramContext: { savedDesignPreferences: {} },
        });
        return jsonResponse(sourcePayload);
      },
    );

    await expect(
      processAiDeckPlanningStage(
        dataSource,
        "http://python-worker:8000",
        "worker-a",
        sourceMessage,
        { fetchImpl, eventLogger },
      ),
    ).resolves.toMatchObject({ status: "running", progress: 25 });

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(dataSource.transaction).toHaveBeenCalledTimes(1);
    expect(eventLogger).toHaveBeenCalledWith(
      "ai-ppt.web-research.completed",
      {
        pipelineJobId: sourceMessage.pipelineJobId,
        projectId: sourceMessage.projectId,
        quality: "partial",
        issueCodes: ["independent-missing"],
        attempts: 3,
        relevantSourceCount: 1,
        officialSourceCount: 1,
        independentSourceCount: 0,
        factCoverageSatisfied: true,
      },
    );
  });

  it("releases retryable provider failures and signals BullMQ retry", async () => {
    const eventLogger = vi.fn();
    const query = vi.fn(async (sql: string) => {
      const compact = compactSql(sql);
      if (
        compact.includes("SET status = 'running', attempt = stages.attempt + 1")
      ) {
        return [checkpointRow(sourceMessage.stage, "running", 1, {})];
      }
      if (compact.includes("SELECT payload FROM jobs")) {
        return [{ payload: { request: { topic: "Safe topic" } } }];
      }
      if (compact.includes("FROM ai_deck_reference_extraction_artifacts")) {
        return [];
      }
      if (compact.includes("SET status = 'queued', result_ref_json = NULL")) {
        return [
          checkpointRow(sourceMessage.stage, "queued", 1, {}, null, {
            code: "PYTHON_WORKER_PLANNING_FAILED",
            message: "AI deck planning provider failed.",
            failedStage: "source-grounding",
            retryable: true,
          }),
        ];
      }
      throw new Error(`Unexpected SQL: ${compact}`);
    });
    const dataSource = fakeDataSource(query);

    await expect(
      processAiDeckPlanningStage(
        dataSource,
        "http://python-worker:8000",
        "worker-a",
        sourceMessage,
        {
          fetchImpl: async () =>
            jsonResponse({ detail: "LLM provider unavailable" }, 503),
          eventLogger,
        },
      ),
    ).rejects.toThrow("AI_DECK_STAGE_RETRY");
    expect(dataSource.transaction).not.toHaveBeenCalled();
    expect(eventLogger).toHaveBeenCalledWith(
      "ai-ppt.stage.attempt-failed",
      expect.objectContaining({
        stage: "source-grounding",
        shardKey: "",
        attempt: 1,
        terminal: false,
        error: expect.objectContaining({
          reasonCode: "PLANNING_FAILURE_UNCLASSIFIED",
        }),
      }),
    );
  });

  it("fails the checkpoint and parent for terminal Art Director output", async () => {
    const eventLogger = vi.fn();
    const message = { ...sourceMessage, stage: "design-planning" as const };
    const contentPayload = {
      rawInput: { topic: "Safe topic" },
      contentPlan: { slidePlans: [{ order: 1 }] },
    };
    const terminalError = {
      code: "ART_DIRECTOR_INVALID_RESPONSE",
      message: "Art Director could not create a valid design plan.",
      failedStage: "design-planning",
      retryable: false,
    };
    const query = vi.fn(async (sql: string) => {
      const compact = compactSql(sql);
      if (
        compact.includes("SET status = 'running', attempt = stages.attempt + 1")
      ) {
        return [
          checkpointRow(message.stage, "running", 1, { planningArtifactId }),
        ];
      }
      if (compact.includes("FROM ai_deck_planning_artifacts artifacts")) {
        return [artifactRow("content-planning", contentPayload)];
      }
      if (compact.includes("SELECT payload FROM jobs")) {
        return [{ payload: { request: { topic: "Safe topic" } } }];
      }
      if (compact.includes("SET status = 'failed', error_json")) {
        return [
          checkpointRow(
            message.stage,
            "failed",
            1,
            { planningArtifactId },
            null,
            terminalError,
          ),
        ];
      }
      if (compact.includes("UPDATE jobs SET status = 'failed'")) {
        return [parentRow("failed", 40, terminalError)];
      }
      throw new Error(`Unexpected SQL: ${compact}`);
    });
    const dataSource = fakeDataSource(query);

    await expect(
      processAiDeckPlanningStage(
        dataSource,
        "http://python-worker:8000",
        "worker-a",
        message,
        {
          fetchImpl: async (_input, init) => {
            expect(JSON.parse(String(init?.body))).toMatchObject({
              preserveApprovedContent: true,
            });
            return jsonResponse(
              {
                detail:
                  "Art Director could not create a valid design plan. Please retry deck generation.",
              },
              503,
            );
          },
          eventLogger,
        },
      ),
    ).resolves.toMatchObject({ status: "failed", error: terminalError });
    expect(eventLogger).toHaveBeenCalledWith(
      "ai-ppt.stage.failed",
      expect.objectContaining({
        stage: "design-planning",
        terminal: true,
        error: expect.objectContaining({
          reasonCode: "ART_DIRECTOR_INVALID_RESPONSE",
        }),
      }),
    );
  });

  it("fans out one image checkpoint per visual requirement after layout", async () => {
    const message = { ...sourceMessage, stage: "layout-compile" as const };
    const deck = createTestDeck(sourceMessage.projectId);
    const contentPayload = {
      rawInput: { topic: "Safe topic" },
      contentPlan: { outline: { title: "Safe topic" }, slidePlans: [] },
    };
    const designPayload = { designPlan: { slidePlans: [] } };
    const layoutPayload = {
      layoutResult: { slides: deck.slides },
      visualRequirements: {
        items: deck.slides.map((slide) => ({
          slideId: slide.slideId,
          visualPlan: { imageNeeded: true },
        })),
      },
      workerPayload: {
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
      },
    };
    const queuedShards: string[] = [];
    const query = vi.fn(async (sql: string, parameters?: unknown[]) => {
      const compact = compactSql(sql);
      if (
        compact.includes("SET status = 'running', attempt = stages.attempt + 1")
      ) {
        return [
          checkpointRow(message.stage, "running", 1, { planningArtifactId }),
        ];
      }
      if (compact.includes("FROM ai_deck_planning_artifacts artifacts")) {
        const expectedStage = String(parameters?.[3] ?? parameters?.[2]);
        if (expectedStage === "design-planning") {
          return [artifactRow("design-planning", designPayload)];
        }
        if (expectedStage === "content-planning") {
          return [artifactRow("content-planning", contentPayload)];
        }
        if (expectedStage === "source-grounding") {
          return [artifactRow("source-grounding", sourcePayload)];
        }
      }
      if (compact.includes("INSERT INTO ai_deck_planning_artifacts")) {
        return [artifactRow("layout-compile", layoutPayload)];
      }
      if (compact.includes("SET status = 'succeeded'")) {
        return [
          checkpointRow(
            message.stage,
            "succeeded",
            1,
            { planningArtifactId },
            {
              planningArtifactId,
            },
          ),
        ];
      }
      if (compact.includes("INSERT INTO ai_deck_generation_stages")) {
        expect(parameters?.[2]).toBe("image-slide");
        queuedShards.push(String(parameters?.[3]));
        return [
          {
            ...checkpointRow("image-slide", "queued", 0, {
              planningArtifactId,
            }),
            shard_key: parameters?.[3],
          },
        ];
      }
      if (compact.includes("UPDATE jobs SET status = 'running'")) {
        return [parentRow("running", 60)];
      }
      throw new Error(`Unexpected SQL: ${compact}`);
    });
    const dataSource = fakeDataSource(query);

    await expect(
      processAiDeckPlanningStage(
        dataSource,
        "http://python-worker:8000",
        "worker-a",
        message,
        { fetchImpl: async () => jsonResponse(layoutPayload) },
      ),
    ).resolves.toMatchObject({ status: "running", progress: 60 });
    expect(queuedShards).toEqual(deck.slides.map((slide) => slide.slideId));
  });
});

function fakeDataSource(query: ReturnType<typeof vi.fn>) {
  const dataSource = {
    query,
    transaction: vi.fn(
      async (run: (manager: { query: typeof query }) => unknown) =>
        run({ query }),
    ),
  };
  return dataSource as unknown as DataSource & {
    transaction: ReturnType<typeof vi.fn>;
  };
}

function checkpointRow(
  stage: string,
  status: string,
  attempt: number,
  inputRef: Record<string, unknown>,
  resultRef: Record<string, unknown> | null = null,
  error: Record<string, unknown> | null = null,
) {
  return {
    pipeline_job_id: sourceMessage.pipelineJobId,
    stage,
    shard_key: "",
    status,
    attempt,
    input_ref_json: inputRef,
    result_ref_json: resultRef,
    error_json: error,
    lease_owner: status === "running" ? "worker-a:lease" : null,
    lease_expires_at: status === "running" ? "2026-07-16T00:10:00.000Z" : null,
    dispatched_at: status === "queued" ? null : now,
    created_at: now,
    updated_at: now,
  };
}

function artifactRow(stage: string, payload: unknown) {
  return {
    artifact_id: planningArtifactId,
    pipeline_job_id: sourceMessage.pipelineJobId,
    project_id: sourceMessage.projectId,
    stage,
    shard_key: "",
    payload_json: payload,
    created_at: now,
    updated_at: now,
  };
}

function parentRow(
  status: "running" | "failed",
  progress: number,
  error: Record<string, unknown> | null = null,
) {
  return {
    job_id: sourceMessage.pipelineJobId,
    project_id: sourceMessage.projectId,
    type: "ai-deck-generation",
    status,
    progress,
    message: status,
    result: null,
    error,
    created_at: now,
    updated_at: now,
  };
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function compactSql(sql: string): string {
  return sql.replace(/\s+/g, " ").trim();
}
