import { renderToStaticMarkup } from "react-dom/server";
import type { Job } from "@orbit/shared";
import { describe, expect, it, vi } from "vitest";
import {
  buildReferenceGenerationInput,
  createGeneratedDeckProject,
  ExtractResultItem,
  GeneratedDeckResult,
  getGeneratedDeckProjectPath,
  getGeneratedDeckProjectTitle,
  getGenerateDeckJobResult,
  getJobResultFiles,
  pollExtractJob
} from "./App";

describe("reference extraction upload flow", () => {
  it("builds generate-deck references and keywords from succeeded extraction results", () => {
    const input = buildReferenceGenerationInput([
      {
        referenceDocumentId: " file_1 ",
        fileName: "success.pdf",
        kind: "pdf",
        status: "succeeded",
        rawText: "raw",
        keywords: [
          { keyword: "Deck", reason: "topic", priority: "high" },
          { keyword: " deck ", reason: "duplicate", priority: "medium" }
        ]
      },
      {
        referenceDocumentId: "file_2",
        fileName: "failed.pdf",
        kind: "pdf",
        status: "failed",
        rawText: "",
        keywords: [{ keyword: "ignored", reason: "failed", priority: "low" }]
      },
      {
        referenceDocumentId: "file_1",
        fileName: "duplicate.pdf",
        kind: "pdf",
        status: "succeeded",
        rawText: "raw",
        keywords: [{ keyword: "AI", reason: "topic", priority: "high" }]
      }
    ]);

    expect(input.references).toEqual([{ fileId: "file_1" }]);
    expect(input.referenceKeywords).toEqual([{ text: "Deck" }, { text: "AI" }]);
    expect(input.succeededFiles).toHaveLength(2);
    expect(input.failedFiles.map((file) => file.fileName)).toEqual(["failed.pdf"]);
  });

  it("polls a succeeded job and renders its result", async () => {
    const file = {
      fileName: "sample.pdf",
      kind: "pdf",
      status: "succeeded",
      message: "done",
      rawText: "raw text",
      cleanedText: "cleaned text",
      cleanupStatus: "succeeded",
      keywords: [{ keyword: "deck", reason: "topic", priority: "high" }],
      keywordStatus: "succeeded",
      indexingStatus: "indexed",
      indexingMessage: "stored",
      chunkCount: 2
    };
    const baseJob: Job = {
      jobId: "job-1",
      projectId: "project-a",
      type: "reference-extract",
      status: "running",
      progress: 10,
      message: "Reference extraction running.",
      result: null,
      error: null,
      createdAt: "2026-06-27T00:00:00.000Z",
      updatedAt: "2026-06-27T00:00:00.000Z"
    };
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify(baseJob)))
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            ...baseJob,
            status: "succeeded",
            progress: 100,
            result: { files: [file] }
          })
        )
      );

    const job = await pollExtractJob("job-1", { delayMs: 0, fetcher });
    const [result] = getJobResultFiles(job);
    const html = renderToStaticMarkup(<ExtractResultItem result={result} />);

    expect(fetcher).toHaveBeenNthCalledWith(1, "/api/jobs/job-1");
    expect(fetcher).toHaveBeenNthCalledWith(2, "/api/jobs/job-1");
    expect(html).toContain("sample.pdf");
    expect(html).toContain("cleaned text");
    expect(html).toContain("2 chunks");
  });
});

describe("AI deck generation flow", () => {
  it("creates a new project for an AI deck generation", async () => {
    const fetcher = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);

      if (url.endsWith("/workspaces/workspace_demo_1/projects")) {
        expect(init?.method).toBe("POST");
        expect(JSON.parse(String(init?.body))).toEqual({ title: "새 주제" });
        return new Response(
          JSON.stringify({
            projectId: "project_new_ai",
            workspaceId: "workspace_demo_1",
            title: "새 주제",
            createdBy: "user_demo_1",
            createdAt: "2026-06-29T00:00:00.000Z"
          })
        );
      }

      if (url.endsWith("/projects/project_new_ai/deck")) {
        const body = JSON.parse(String(init?.body));
        return new Response(
          JSON.stringify({
            deck: body.deck,
            snapshot: {
              snapshotId: "snapshot_new_ai",
              projectId: "project_new_ai",
              deckId: "deck_new_ai",
              version: 1,
              reason: "deck-replaced",
              createdAt: "2026-06-29T00:00:00.000Z"
            },
            updatedAt: "2026-06-29T00:00:00.000Z"
          })
        );
      }

      return new Response("unexpected request", { status: 500 });
    });

    await expect(createGeneratedDeckProject("  새 주제  ", fetcher)).resolves.toMatchObject({
      projectId: "project_new_ai"
    });
    expect(getGeneratedDeckProjectTitle("   ")).toBe("AI 덱");
  });

  it("reads a generated deck job result and renders slide evidence", () => {
    const job: Job = {
      jobId: "job-2",
      projectId: "project-a",
      type: "ai-deck-generation",
      status: "succeeded",
      progress: 100,
      message: "AI deck generation completed.",
      result: {
        deckId: "deck_ai_1",
        deck: {
          deckId: "deck_ai_1",
          projectId: "project-a",
          title: "AI 덱 생성 발표안",
          version: 1,
          metadata: {
            language: "ko",
            locale: "ko-KR",
            sourceType: "ai",
            generatedBy: "ai"
          },
          canvas: {
            preset: "wide-16-9",
            width: 1920,
            height: 1080,
            aspectRatio: "16:9"
          },
          slides: [
            {
              slideId: "slide_1",
              order: 1,
              title: "AI 덱 생성",
              thumbnailUrl: "",
              style: {},
              speakerNotes: "발표자 노트",
              elements: [],
              keywords: [],
              animations: [],
              aiNotes: {
                emphasisPoints: ["핵심 메시지"],
                sourceEvidence: [{ fileId: "file_1", note: "근거 후보" }]
              }
            }
          ]
        },
        warnings: [],
        validation: {
          passed: true,
          layoutIssues: [],
          contentIssues: [],
          designIssues: [],
          presentationIssues: []
        }
      },
      error: null,
      createdAt: "2026-06-27T00:00:00.000Z",
      updatedAt: "2026-06-27T00:00:01.000Z"
    };
    const result = getGenerateDeckJobResult(job);

    expect(result?.deckId).toBe("deck_ai_1");
    if (!result) {
      throw new Error("Generated deck result was not parsed.");
    }
    expect(getGeneratedDeckProjectPath(result)).toBe("/project/project-a");
    expect(renderToStaticMarkup(<GeneratedDeckResult result={result} />)).toContain(
      "file_1"
    );
  });
});
