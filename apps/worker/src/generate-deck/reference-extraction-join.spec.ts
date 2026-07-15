import type { DataSource } from "typeorm";
import { describe, expect, it, vi } from "vitest";

import {
  AiDeckStageFencingLostError,
  completeAiDeckReferenceExtractionStage,
} from "./reference-extraction-join";

const message = {
  pipelineJobId: "job-ai-deck-1",
  projectId: "project-a",
  stage: "reference-extract-file" as const,
  shardKey: "file-a",
};

describe("completeAiDeckReferenceExtractionStage", () => {
  it("rejects stale fencing after artifact upsert so the transaction can roll back", async () => {
    const query = vi.fn(async (sql: string, _parameters?: unknown[]) => {
      const compact = compactSql(sql);
      if (compact.includes("FROM jobs") && compact.includes("FOR UPDATE")) {
        return [parentJobRow("references-first")];
      }
      if (compact.startsWith("INSERT INTO ai_deck_reference_extraction_artifacts")) {
        return [artifactRow(true)];
      }
      if (compact.includes("SET status = 'succeeded'")) return [];
      throw new Error(`Unexpected query: ${compact}`);
    });
    const dataSource = transactionalDataSource(query);

    await expect(
      completeAiDeckReferenceExtractionStage(dataSource, {
        message,
        leaseOwner: "worker-a:7dc4ed60-2d85-4f13-b3ca-c6bb4ed54f8a",
        attempt: 1,
        extraction: extraction(true),
      }),
    ).rejects.toBeInstanceOf(AiDeckStageFencingLostError);

    const sql = query.mock.calls.map((call) => compactSql(call[0]));
    expect(sql.findIndex((value) => value.startsWith("INSERT INTO ai_deck_reference")))
      .toBeLessThan(sql.findIndex((value) => value.includes("SET status = 'succeeded'")));
    expect(sql.some((value) => value.includes("stage = 'source-grounding'"))).toBe(false);
  });

  it("stores a valid unusable result but fails a references-only parent", async () => {
    const query = vi.fn(async (sql: string, _parameters?: unknown[]) => {
      const compact = compactSql(sql);
      if (compact.includes("FROM jobs") && compact.includes("FOR UPDATE")) {
        return [parentJobRow("references-only")];
      }
      if (compact.startsWith("INSERT INTO ai_deck_reference_extraction_artifacts")) {
        return [artifactRow(false)];
      }
      if (compact.includes("SET status = 'succeeded'")) {
        return [checkpointRow("succeeded", locator())];
      }
      if (compact.includes("FROM ai_deck_generation_stages stages")) {
        return [{ shard_key: "file-a", status: "succeeded", usable: false }];
      }
      if (
        compact.startsWith("UPDATE ai_deck_generation_stages") &&
        compact.includes("stages.status IN ('queued','running')")
      ) {
        return [];
      }
      if (compact.startsWith("UPDATE jobs")) return [];
      throw new Error(`Unexpected query: ${compact}`);
    });
    const dataSource = transactionalDataSource(query);

    await completeAiDeckReferenceExtractionStage(dataSource, {
      message,
      leaseOwner: "worker-a:7dc4ed60-2d85-4f13-b3ca-c6bb4ed54f8a",
      attempt: 5,
      extraction: extraction(false),
      error: {
        code: "REFERENCE_EXTRACTION_UNUSABLE",
        message: "Reference extraction did not produce usable content.",
        failedStage: "reference-extract-file",
        retryable: false,
      },
    });

    const parentFailure = query.mock.calls.find((call) =>
      compactSql(call[0]).startsWith("UPDATE jobs"),
    );
    expect(parentFailure?.[1]?.[2]).toMatchObject({
      code: "SOURCE_GROUNDING_REQUIRED",
      retryable: false,
    });
    expect(
      query.mock.calls
        .map((call) => compactSql(call[0]))
        .find((sql) => sql.includes("FROM ai_deck_generation_stages stages")),
    ).toContain("FOR UPDATE OF stages");
    expect(
      query.mock.calls.some((call) =>
        compactSql(call[0]).startsWith("INSERT INTO ai_deck_generation_stages"),
      ),
    ).toBe(false);
  });

  it("continues references-first when existing usable context survives a failed shard", async () => {
    const query = vi.fn(async (sql: string, _parameters?: unknown[]) => {
      const compact = compactSql(sql);
      if (compact.includes("FROM jobs") && compact.includes("FOR UPDATE")) {
        return [
          parentJobRow("references-first", {
            referenceFileIds: ["file-a", "file-covered"],
            referenceContext: [
              { fileId: "file-covered", content: "existing usable context" },
            ],
          }),
        ];
      }
      if (compact.includes("SET status = 'failed'")) {
        return [checkpointRow("failed", null)];
      }
      if (compact.includes("FROM ai_deck_generation_stages stages")) {
        return [{ shard_key: "file-a", status: "failed", usable: false }];
      }
      if (compact.startsWith("INSERT INTO ai_deck_generation_stages")) {
        return [sourceCheckpointRow()];
      }
      throw new Error(`Unexpected query: ${compact}`);
    });
    const dataSource = transactionalDataSource(query);

    await completeAiDeckReferenceExtractionStage(dataSource, {
      message,
      leaseOwner: "worker-a:7dc4ed60-2d85-4f13-b3ca-c6bb4ed54f8a",
      attempt: 5,
      error: {
        code: "PYTHON_WORKER_EXTRACT_UNAVAILABLE",
        message: "Reference extraction provider failed.",
        failedStage: "reference-extract-file",
        retryable: false,
      },
    });

    expect(
      query.mock.calls.some((call) =>
        compactSql(call[0]).startsWith("INSERT INTO ai_deck_generation_stages"),
      ),
    ).toBe(true);
    expect(
      query.mock.calls.some((call) => compactSql(call[0]).startsWith("UPDATE jobs")),
    ).toBe(false);
  });

  it("terminalizes active sibling checkpoints before a fatal parent failure", async () => {
    const query = vi.fn(async (sql: string, _parameters?: unknown[]) => {
      const compact = compactSql(sql);
      if (compact.includes("FROM jobs") && compact.includes("FOR UPDATE")) {
        return [parentJobRow("references-first")];
      }
      if (
        compact.startsWith("UPDATE ai_deck_generation_stages stages") &&
        compact.includes("stages.lease_owner = $5")
      ) {
        return [checkpointRow("failed", null)];
      }
      if (
        compact.startsWith("UPDATE ai_deck_generation_stages") &&
        compact.includes("stages.status IN ('queued','running')")
      ) {
        return [{ stage: "reference-extract-file", shard_key: "file-b" }];
      }
      if (compact.startsWith("UPDATE jobs")) return [];
      throw new Error(`Unexpected query: ${compact}`);
    });
    const dataSource = transactionalDataSource(query);
    const fatalError = {
      code: "REFERENCE_ASSET_INVALID",
      message: "Reference asset does not satisfy the staged extraction contract.",
      failedStage: "reference-extract-file" as const,
      retryable: false,
    };

    await completeAiDeckReferenceExtractionStage(dataSource, {
      message,
      leaseOwner: "worker-a:7dc4ed60-2d85-4f13-b3ca-c6bb4ed54f8a",
      attempt: 1,
      error: fatalError,
      fatalParent: true,
    });

    const calls = query.mock.calls.map((call) => compactSql(call[0]));
    const siblingFailureIndex = calls.findIndex(
      (sql) =>
        sql.startsWith("UPDATE ai_deck_generation_stages") &&
        sql.includes("stages.status IN ('queued','running')"),
    );
    const parentFailureIndex = calls.findIndex((sql) => sql.startsWith("UPDATE jobs"));
    expect(siblingFailureIndex).toBeGreaterThan(-1);
    expect(siblingFailureIndex).toBeLessThan(parentFailureIndex);
    expect(calls[siblingFailureIndex]).toContain("result_ref_json = NULL");
    expect(calls[siblingFailureIndex]).toContain("lease_owner = NULL");
    expect(calls[siblingFailureIndex]).toContain("lease_expires_at = NULL");
    expect(calls[siblingFailureIndex]).toContain("dispatched_at = NULL");
    expect(query.mock.calls[siblingFailureIndex]?.[1]?.[1]).toEqual(fatalError);
  });
});

function transactionalDataSource(query: ReturnType<typeof vi.fn>): DataSource {
  return {
    transaction: vi.fn(async (work: (manager: { query: typeof query }) => unknown) =>
      work({ query }),
    ),
  } as unknown as DataSource;
}

function parentJobRow(
  referencePolicy: "references-first" | "references-only",
  requestOverrides: Record<string, unknown> = {},
) {
  return {
    job_id: "job-ai-deck-1",
    project_id: "project-a",
    type: "ai-deck-generation",
    status: "running",
    payload: {
      request: {
        topic: "join",
        referencePolicy,
        referenceFileIds: ["file-a"],
        ...requestOverrides,
      },
    },
  };
}

function extraction(usable: boolean) {
  return {
    projectId: "project-a",
    referenceDocumentId: "file-a",
    fileId: "file-a",
    fileName: "brief.pdf",
    mimeType: "application/pdf",
    kind: "pdf" as const,
    status: usable ? ("succeeded" as const) : ("failed" as const),
    message: "",
    rawText: usable ? "source" : "",
    cleanedText: usable ? "source" : "",
    cleanupStatus: "",
    cleanupMessage: "",
    keywords: [],
    keywordStatus: "",
    keywordMessage: "",
    indexingStatus: "",
    indexingMessage: "",
    chunkCount: 0,
    sections: [],
    usable,
  };
}

function artifactRow(usable: boolean) {
  return {
    artifact_id: "7dc4ed60-2d85-4f13-b3ca-c6bb4ed54f8a",
    pipeline_job_id: "job-ai-deck-1",
    project_id: "project-a",
    file_id: "file-a",
    stage: "reference-extract-file",
    extraction_json: extraction(usable),
    usable,
    created_at: "2026-07-15T01:00:00.000Z",
    updated_at: "2026-07-15T01:00:00.000Z",
  };
}

function locator() {
  return {
    referenceExtractionArtifactId: "7dc4ed60-2d85-4f13-b3ca-c6bb4ed54f8a",
  };
}

function checkpointRow(status: "succeeded" | "failed", resultRef: unknown) {
  return {
    pipeline_job_id: "job-ai-deck-1",
    stage: "reference-extract-file",
    shard_key: "file-a",
    status,
    attempt: 5,
    input_ref_json: {},
    result_ref_json: resultRef,
    error_json:
      status === "failed"
        ? {
            code: "PYTHON_WORKER_EXTRACT_UNAVAILABLE",
            message: "Reference extraction provider failed.",
            failedStage: "reference-extract-file",
            retryable: false,
          }
        : null,
    lease_owner: null,
    lease_expires_at: null,
    dispatched_at: null,
    created_at: "2026-07-15T01:00:00.000Z",
    updated_at: "2026-07-15T01:00:00.000Z",
  };
}

function sourceCheckpointRow() {
  return {
    ...checkpointRow("succeeded", {}),
    stage: "source-grounding",
    shard_key: "",
    status: "queued",
    attempt: 0,
    result_ref_json: null,
  };
}

function compactSql(value: unknown): string {
  return String(value).replace(/\s+/g, " ").trim();
}
