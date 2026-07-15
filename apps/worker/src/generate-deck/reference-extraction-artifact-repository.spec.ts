import { describe, expect, it, vi } from "vitest";

import { AiDeckReferenceExtractionArtifactRepository } from "./reference-extraction-artifact-repository";

const message = {
  pipelineJobId: "job-ai-deck-1",
  projectId: "project-a",
  stage: "reference-extract-file" as const,
  shardKey: "file-a",
};

const extraction = {
  projectId: "project-a",
  referenceDocumentId: "file-a",
  fileName: "brief.pdf",
  mimeType: "application/pdf",
  kind: "pdf" as const,
  status: "succeeded" as const,
  message: "",
  rawText: "source text",
  cleanedText: "source text",
  cleanupStatus: "succeeded",
  cleanupMessage: "",
  keywords: [],
  keywordStatus: "succeeded",
  keywordMessage: "",
  indexingStatus: "failed",
  indexingMessage: "index unavailable",
  chunkCount: 0,
  sections: [],
  usable: true,
};

describe("AiDeckReferenceExtractionArtifactRepository", () => {
  it("upserts the parsed extraction while preserving the original artifact ID", async () => {
    const artifactId = "7dc4ed60-2d85-4f13-b3ca-c6bb4ed54f8a";
    const query = vi.fn(async () => [artifactRow(artifactId)]);
    const repository = new AiDeckReferenceExtractionArtifactRepository({ query });

    await expect(repository.upsert(message, extraction)).resolves.toEqual({
      referenceExtractionArtifactId: artifactId,
    });

    const sql = compactSql(query.mock.calls[0]?.[0]);
    expect(sql).toContain("INSERT INTO ai_deck_reference_extraction_artifacts");
    expect(sql).toContain("ON CONFLICT (pipeline_job_id, file_id) DO UPDATE");
    expect(sql).not.toContain("artifact_id = EXCLUDED.artifact_id");
    expect(query.mock.calls[0]?.[1]?.slice(1)).toEqual([
      "job-ai-deck-1",
      "project-a",
      "file-a",
      expect.objectContaining({ fileId: "file-a", usable: true }),
      true,
    ]);
  });

  it("rejects an extraction whose project or file identity differs from the stage message", async () => {
    const query = vi.fn();
    const repository = new AiDeckReferenceExtractionArtifactRepository({ query });

    await expect(
      repository.upsert(message, { ...extraction, referenceDocumentId: "file-b" }),
    ).rejects.toThrow();
    await expect(
      repository.upsert(message, { ...extraction, projectId: "project-b" }),
    ).rejects.toThrow();
    expect(query).not.toHaveBeenCalled();
  });
});

function artifactRow(artifactId: string) {
  return {
    artifact_id: artifactId,
    pipeline_job_id: "job-ai-deck-1",
    project_id: "project-a",
    file_id: "file-a",
    stage: "reference-extract-file",
    extraction_json: { ...extraction, fileId: "file-a" },
    usable: true,
    created_at: "2026-07-15T01:00:00.000Z",
    updated_at: "2026-07-15T01:00:00.000Z",
  };
}

function compactSql(value: unknown): string {
  return String(value).replace(/\s+/g, " ").trim();
}
