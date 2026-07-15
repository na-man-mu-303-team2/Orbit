import type { StoragePort } from "@orbit/storage";
import type { DataSource } from "typeorm";
import { describe, expect, it, vi } from "vitest";

import { processAiDeckReferenceExtractionStage } from "./reference-extract-stage";

const message = {
  pipelineJobId: "job-ai-deck-1",
  projectId: "project-a",
  stage: "reference-extract-file" as const,
  shardKey: "file-a",
};

describe("processAiDeckReferenceExtractionStage", () => {
  it("skips Storage and Python when another delivery already owns or completed the shard", async () => {
    const dataSource = dataSourceWithQuery(async (sql) => {
      if (compactSql(sql).startsWith("UPDATE ai_deck_generation_stages")) return [];
      throw new Error(`Unexpected query: ${compactSql(sql)}`);
    });
    const storage = storageStub();
    const fetchImpl = vi.fn();

    await processAiDeckReferenceExtractionStage(
      dataSource,
      storage,
      "http://python-worker:8000",
      "worker-a",
      message,
      { fetchImpl, recoverJoin: vi.fn(async () => undefined) },
    );

    expect(storage.getSignedReadUrl).not.toHaveBeenCalled();
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("downloads one asset and atomically saves its artifact, fenced checkpoint, and join", async () => {
    const outerQuery = vi.fn(async (sql: string) => {
      const compact = compactSql(sql);
      if (compact.startsWith("UPDATE ai_deck_generation_stages")) {
        return [runningCheckpointRow()];
      }
      if (compact.includes("FROM project_assets assets")) return [assetRow()];
      throw new Error(`Unexpected outer query: ${compact}`);
    });
    const transactionQuery = vi.fn(async (sql: string) => {
      const compact = compactSql(sql);
      if (compact.includes("FROM jobs") && compact.includes("FOR UPDATE")) {
        return [parentJobRow()];
      }
      if (compact.startsWith("INSERT INTO ai_deck_reference_extraction_artifacts")) {
        return [artifactRow()];
      }
      if (compact.startsWith("UPDATE ai_deck_generation_stages")) {
        return [succeededCheckpointRow()];
      }
      if (compact.includes("FROM ai_deck_generation_stages stages")) {
        return [{ shard_key: "file-a", status: "succeeded" }];
      }
      if (compact.startsWith("INSERT INTO ai_deck_generation_stages")) {
        return [sourceGroundingCheckpointRow()];
      }
      throw new Error(`Unexpected transaction query: ${compact}`);
    });
    const transaction = vi.fn(async (work: (manager: { query: typeof transactionQuery }) => unknown) =>
      work({ query: transactionQuery }),
    );
    const dataSource = {
      query: outerQuery,
      transaction,
    } as unknown as DataSource;
    const storage = storageStub();
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(new Response(new Uint8Array([1, 2, 3]), { status: 200 }))
      .mockResolvedValueOnce(
        Response.json({
          files: [
            {
              projectId: "project-a",
              referenceDocumentId: "file-a",
              fileName: "brief.pdf",
              mimeType: "application/pdf",
              kind: "pdf",
              status: "succeeded",
              rawText: "source text",
              cleanedText: "source text",
              indexingStatus: "failed",
              indexingMessage: "index unavailable",
            },
          ],
        }),
      );

    await processAiDeckReferenceExtractionStage(
      dataSource,
      storage,
      "http://python-worker:8000",
      "worker-a",
      message,
      { fetchImpl },
    );

    expect(storage.getSignedReadUrl).toHaveBeenCalledWith(
      "projects/project-a/assets/file-a-brief.pdf",
    );
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(fetchImpl.mock.calls[1]?.[0]).toBe(
      "http://python-worker:8000/documents/parse",
    );
    const pythonRequest = fetchImpl.mock.calls[1]?.[1];
    expect(pythonRequest?.body).toBeInstanceOf(FormData);
    expect(transaction).toHaveBeenCalledTimes(1);
    const transactionSql = transactionQuery.mock.calls.map((call) => compactSql(call[0]));
    expect(transactionSql.findIndex((sql) => sql.includes("FROM jobs"))).toBeLessThan(
      transactionSql.findIndex((sql) => sql.startsWith("INSERT INTO ai_deck_reference")),
    );
    expect(
      transactionSql.some((sql) => sql.includes("referenceExtractionArtifactId")),
    ).toBe(true);
    expect(
      transactionSql.some((sql) => sql.startsWith("INSERT INTO ai_deck_generation_stages")),
    ).toBe(true);
  });

  it("releases only the claimed shard and throws so BullMQ applies backoff", async () => {
    const query = vi.fn(async (sql: string) => {
      const compact = compactSql(sql);
      if (compact.includes("SET status = 'running'")) return [runningCheckpointRow()];
      if (compact.includes("FROM project_assets assets")) return [assetRow()];
      if (compact.includes("SET status = 'queued'")) {
        return [queuedCheckpointRow({ attempt: 1 })];
      }
      throw new Error(`Unexpected query: ${compact}`);
    });
    const dataSource = {
      query,
      transaction: vi.fn(),
    } as unknown as DataSource;
    const storage = storageStub();
    const fetchImpl = vi.fn(async () => {
      throw new Error("signed object temporarily unavailable");
    });

    await expect(
      processAiDeckReferenceExtractionStage(
        dataSource,
        storage,
        "http://python-worker:8000",
        "worker-a",
        message,
        { fetchImpl },
      ),
    ).rejects.toThrow("AI_DECK_STAGE_RETRY");

    const releaseCall = query.mock.calls.find((call) =>
      compactSql(call[0]).includes("SET status = 'queued'"),
    );
    expect(releaseCall?.[1]?.slice(0, 4)).toEqual([
      "job-ai-deck-1",
      "project-a",
      "reference-extract-file",
      "file-a",
    ]);
    expect(String(releaseCall?.[1]?.[6])).not.toContain("signed object");
    expect(dataSource.transaction).not.toHaveBeenCalled();
  });
});

function dataSourceWithQuery(query: (sql: string, parameters?: unknown[]) => Promise<unknown[]>) {
  return { query, transaction: vi.fn() } as unknown as DataSource;
}

function storageStub(): Pick<StoragePort, "getSignedReadUrl"> & {
  getSignedReadUrl: ReturnType<typeof vi.fn>;
} {
  return {
    getSignedReadUrl: vi.fn(async () => "https://storage.test/signed-file"),
  };
}

function parentJobRow() {
  return {
    job_id: "job-ai-deck-1",
    project_id: "project-a",
    type: "ai-deck-generation",
    status: "running",
    progress: 10,
    message: "running",
    payload: {
      request: {
        topic: "staged OCR",
        referencePolicy: "references-first",
        referenceFileIds: ["file-a"],
      },
    },
    result: null,
    error: null,
    created_at: "2026-07-15T01:00:00.000Z",
    updated_at: "2026-07-15T01:00:00.000Z",
  };
}

function assetRow() {
  return {
    file_id: "file-a",
    project_id: "project-a",
    storage_key: "projects/project-a/assets/file-a-brief.pdf",
    original_name: "brief.pdf",
    mime_type: "application/pdf",
    purpose: "reference-material",
    status: "uploaded",
    payload: parentJobRow().payload,
  };
}

function artifactRow() {
  return {
    artifact_id: "7dc4ed60-2d85-4f13-b3ca-c6bb4ed54f8a",
    pipeline_job_id: "job-ai-deck-1",
    project_id: "project-a",
    file_id: "file-a",
    stage: "reference-extract-file",
    extraction_json: {
      projectId: "project-a",
      referenceDocumentId: "file-a",
      fileId: "file-a",
      kind: "pdf",
      status: "succeeded",
      rawText: "source text",
      cleanedText: "source text",
      usable: true,
    },
    usable: true,
    created_at: "2026-07-15T01:00:00.000Z",
    updated_at: "2026-07-15T01:00:00.000Z",
  };
}

function runningCheckpointRow() {
  return checkpointRow({
    status: "running",
    attempt: 1,
    lease_owner: "worker-a:7dc4ed60-2d85-4f13-b3ca-c6bb4ed54f8a",
    lease_expires_at: "2026-07-15T01:10:00.000Z",
  });
}

function succeededCheckpointRow() {
  return checkpointRow({
    status: "succeeded",
    attempt: 1,
    result_ref_json: {
      referenceExtractionArtifactId: "7dc4ed60-2d85-4f13-b3ca-c6bb4ed54f8a",
    },
  });
}

function queuedCheckpointRow(overrides: Record<string, unknown> = {}) {
  return checkpointRow({ status: "queued", ...overrides });
}

function sourceGroundingCheckpointRow() {
  return checkpointRow({ stage: "source-grounding", shard_key: "" });
}

function checkpointRow(overrides: Record<string, unknown> = {}) {
  return {
    pipeline_job_id: "job-ai-deck-1",
    stage: "reference-extract-file",
    shard_key: "file-a",
    status: "queued",
    attempt: 0,
    input_ref_json: {},
    result_ref_json: null,
    error_json: null,
    lease_owner: null,
    lease_expires_at: null,
    dispatched_at: null,
    created_at: "2026-07-15T01:00:00.000Z",
    updated_at: "2026-07-15T01:00:00.000Z",
    ...overrides,
  };
}

function compactSql(value: unknown): string {
  return String(value).replace(/\s+/g, " ").trim();
}
