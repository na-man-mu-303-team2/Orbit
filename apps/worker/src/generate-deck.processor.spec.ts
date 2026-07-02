import type { DataSource } from "typeorm";
import { afterEach, describe, expect, it, vi } from "vitest";
import { processGenerateDeckJob } from "./generate-deck.processor";

const payload = {
  jobId: "job-1",
  projectId: "project-a",
  request: {
    topic: "AI 덱 생성",
    designPrompt: "retro pixel palette",
    references: [{ fileId: "file_1" }],
    referenceKeywords: [{ text: "실시간 발표 피드백" }]
  }
};

describe("processGenerateDeckJob", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("calls Python deck generation, saves the deck, and stores job results", async () => {
    const deck = createDeck();
    const query = vi
      .fn()
      .mockResolvedValueOnce([jobRow("running", 15, null, null)])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        jobRow(
          "succeeded",
          100,
          {
            deckId: deck.deckId,
            deck,
            warnings: [],
            validation: validation()
          },
          null
        )
      ]);
    let pythonRequestBody = "";
    const fetchMock = vi.fn(async (_input: unknown, init?: RequestInit) => {
      pythonRequestBody = String(init?.body ?? "");
      return new Response(
        JSON.stringify({ deck, warnings: [], validation: validation() })
      );
    });
    vi.stubGlobal("fetch", fetchMock);

    const job = await processGenerateDeckJob(
      { query } as unknown as DataSource,
      "http://localhost:8000",
      payload
    );

    expect(job.status).toBe("succeeded");
    expect(fetch).toHaveBeenCalledWith(
      "http://localhost:8000/ai/generate-deck",
      expect.objectContaining({ method: "POST" })
    );
    expect(JSON.parse(pythonRequestBody)).toEqual(
      expect.objectContaining({
        designPrompt: "retro pixel palette",
        referenceKeywords: [{ text: "실시간 발표 피드백" }]
      })
    );
    expect(query).toHaveBeenCalledTimes(3);
    expect(query.mock.calls[1][0]).toContain("INSERT INTO decks");
  });

  it("marks the DB job failed when Python generation fails", async () => {
    const query = vi
      .fn()
      .mockResolvedValueOnce([jobRow("running", 15, null, null)])
      .mockResolvedValueOnce([
        jobRow("failed", 15, null, {
          code: "PYTHON_WORKER_GENERATE_DECK_FAILED",
          message: "bad generation"
        })
      ]);
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("bad generation", { status: 500 }))
    );

    const job = await processGenerateDeckJob(
      { query } as unknown as DataSource,
      "http://localhost:8000",
      payload
    );

    expect(job.status).toBe("failed");
    expect(job.error?.message).toBe("bad generation");
    expect(query).toHaveBeenCalledTimes(2);
  });
});

function createDeck() {
  return {
    deckId: "deck_ai_1",
    projectId: "project-a",
    title: "AI 덱 생성 발표안",
    version: 1,
    metadata: {
      language: "ko",
      locale: "ko-KR",
      sourceType: "ai",
      generatedBy: "ai",
      createdFrom: {
        topic: "AI 덱 생성",
        references: [{ fileId: "file_1" }]
      }
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
        speakerNotes: "notes",
        elements: [],
        keywords: [],
        animations: [],
        actions: [],
        aiNotes: {
          emphasisPoints: ["message"],
          sourceEvidence: [{ fileId: "file_1" }]
        }
      }
    ]
  };
}

function validation() {
  return {
    passed: true,
    layoutIssues: [],
    contentIssues: [],
    designIssues: [],
    presentationIssues: []
  };
}

function jobRow(
  status: "running" | "succeeded" | "failed",
  progress: number,
  result: Record<string, unknown> | null,
  error: { code: string; message: string } | null
) {
  return {
    job_id: "job-1",
    project_id: "project-a",
    type: "ai-deck-generation",
    status,
    progress,
    message: status,
    result,
    error,
    created_at: "2026-06-27T00:00:00.000Z",
    updated_at: "2026-06-27T00:00:01.000Z"
  };
}
