import { deckSchema, type Deck, type Job } from "@orbit/shared";
import type { DataSource } from "typeorm";
import { afterEach, describe, expect, it, vi } from "vitest";
import { processSemanticCueExtractionJob } from "./semantic-cue-extraction.processor";

const payload = {
  jobId: "job-semantic-cues",
  projectId: "project-a",
  request: {
    deckId: "deck_demo_1",
    force: false
  }
};

describe("processSemanticCueExtractionJob", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it("calls Python extraction and saves semantic cues into a deck checkpoint", async () => {
    const deck = createDeck();
    const savedDecks: Deck[] = [];
    const query = vi.fn(async (sql: string, params: unknown[]) => {
      const normalized = normalizeSql(sql);
      if (normalized.startsWith("UPDATE jobs")) {
        return [
          jobRow(
            params[1] as Job["status"],
            params[2] as number,
            params[4] as Record<string, unknown> | null,
            params[5] as Job["error"]
          )
        ];
      }
      if (normalized.includes("FROM decks")) {
        return [
          {
            deck_id: deck.deckId,
            deck_json: deck,
            version: deck.version
          }
        ];
      }
      if (normalized.includes("FROM deck_patches")) {
        return [];
      }
      if (normalized.startsWith("UPDATE decks")) {
        savedDecks.push(params[2] as Deck);
        return [];
      }
      throw new Error(`Unhandled query: ${normalized}`);
    });
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json({
          deckId: deck.deckId,
          slides: [
            {
              slideId: "slide_intro",
              semanticCues: [
                {
                  cueId: "scue_intro_1",
                  slideId: "slide_intro",
                  meaning: "문제 정의를 설명했다",
                  required: true,
                  priority: 1,
                  candidateKeywords: ["문제 정의"],
                  aliases: {},
                  requiredConcepts: ["문제 정의"],
                  nliHypotheses: ["발표자가 문제 정의와 고객 문제를 설명했다"],
                  negativeHints: [],
                  targetElementIds: [],
                  triggerActionIds: []
                }
              ]
            }
          ]
        })
      )
    );

    const job = await processSemanticCueExtractionJob(
      { query } as unknown as DataSource,
      "http://localhost:8000",
      payload
    );

    expect(job.status).toBe("succeeded");
    expect(fetch).toHaveBeenCalledWith(
      "http://localhost:8000/ai/extract-semantic-cues",
      expect.objectContaining({ method: "POST" })
    );
    const savedDeck = savedDecks[0];
    expect(savedDeck?.version).toBe(2);
    expect(savedDeck?.slides[0]?.semanticCues[0]?.cueId).toBe("scue_intro_1");
    expect(job.result).toEqual({
      deckId: deck.deckId,
      version: 2,
      cueCount: 1
    });
  });

  it("fails safely when the checkpoint has pending patch rows", async () => {
    const deck = createDeck();
    const query = vi.fn(async (sql: string, params: unknown[]) => {
      const normalized = normalizeSql(sql);
      if (normalized.startsWith("UPDATE jobs")) {
        return [
          jobRow(
            params[1] as Job["status"],
            params[2] as number,
            params[4] as Record<string, unknown> | null,
            params[5] as Job["error"]
          )
        ];
      }
      if (normalized.includes("FROM decks")) {
        return [
          {
            deck_id: deck.deckId,
            deck_json: deck,
            version: deck.version
          }
        ];
      }
      if (normalized.includes("FROM deck_patches")) {
        return [{ exists: 1 }];
      }
      throw new Error(`Unhandled query: ${normalized}`);
    });
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const job = await processSemanticCueExtractionJob(
      { query } as unknown as DataSource,
      "http://localhost:8000",
      payload
    );

    expect(job.status).toBe("failed");
    expect(job.error?.code).toBe("SEMANTIC_CUE_DECK_UNAVAILABLE");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("fails without saving a checkpoint when Python semantic cue extraction fails", async () => {
    const deck = createDeck();
    const savedDecks: Deck[] = [];
    const query = vi.fn(async (sql: string, params: unknown[]) => {
      const normalized = normalizeSql(sql);
      if (normalized.startsWith("UPDATE jobs")) {
        return [
          jobRow(
            params[1] as Job["status"],
            params[2] as number,
            params[4] as Record<string, unknown> | null,
            params[5] as Job["error"]
          )
        ];
      }
      if (normalized.includes("FROM decks")) {
        return [
          {
            deck_id: deck.deckId,
            deck_json: deck,
            version: deck.version
          }
        ];
      }
      if (normalized.includes("FROM deck_patches")) {
        return [];
      }
      if (normalized.startsWith("UPDATE decks")) {
        savedDecks.push(params[2] as Deck);
        return [];
      }
      throw new Error(`Unhandled query: ${normalized}`);
    });
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json(
          {
            detail: "OpenAI API key is required for semantic cue extraction."
          },
          { status: 503 }
        )
      )
    );

    const job = await processSemanticCueExtractionJob(
      { query } as unknown as DataSource,
      "http://localhost:8000",
      payload
    );

    expect(job.status).toBe("failed");
    expect(job.error?.code).toBe("PYTHON_WORKER_SEMANTIC_CUE_FAILED");
    expect(savedDecks).toEqual([]);
  });
});

function createDeck(): Deck {
  return deckSchema.parse({
    deckId: "deck_demo_1",
    projectId: "project-a",
    title: "ORBIT Demo Deck",
    version: 1,
    metadata: {
      language: "ko",
      locale: "ko-KR"
    },
    canvas: {
      preset: "wide-16-9",
      width: 1920,
      height: 1080,
      aspectRatio: "16:9"
    },
    slides: [
      {
        slideId: "slide_intro",
        order: 1,
        title: "소개",
        speakerNotes: "문제 정의를 설명합니다."
      }
    ]
  });
}

function jobRow(
  status: Job["status"],
  progress: number,
  result: Record<string, unknown> | null,
  error: Job["error"]
) {
  return {
    job_id: payload.jobId,
    project_id: payload.projectId,
    type: "semantic-cue-extraction",
    status,
    progress,
    message: "updated",
    result,
    error,
    created_at: "2026-07-09T00:00:00.000Z",
    updated_at: "2026-07-09T00:00:01.000Z"
  };
}

function normalizeSql(sql: string): string {
  return sql.replace(/\s+/g, " ").trim();
}
