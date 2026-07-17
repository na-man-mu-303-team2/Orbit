import type { DataSource } from "typeorm";
import { afterEach, describe, expect, it, vi } from "vitest";

import { processSlideQuestionGuideGenerationJob } from "./slide-question-guide-generation.processor";

const payload = {
  jobId: "job-guide-1",
  projectId: "project-1",
  guideId: "guide-1",
};
const slideHash = "a".repeat(64);
const referenceHash = "b".repeat(64);

describe("processSlideQuestionGuideGenerationJob", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it("stores private canonical items while keeping the Job result identifier-only", async () => {
    const harness = createHarness();
    const events: Record<string, unknown>[] = [];
    vi.stubGlobal("fetch", vi.fn(async () => Response.json(providerResponse(
      [0, 1, 2].map((index) => generatedItem(index)),
    ))));

    const job = await processSlideQuestionGuideGenerationJob(
      harness.dataSource,
      "http://python-worker:8000",
      payload,
      (event) => events.push(event),
    );

    expect(job.status).toBe("succeeded");
    expect(job.result).toEqual({
      guideId: "guide-1",
      projectId: "project-1",
      deckId: "deck-1",
      deckVersion: 3,
      slideId: "slide-1",
      itemCount: 3,
      generatedAt: expect.any(String),
    });
    expect(JSON.stringify(job.result)).not.toContain("questionText");
    expect(harness.insertedItems).toHaveLength(3);
    expect(harness.storedResearch).toEqual({
      status: "unavailable",
      attempts: 2,
      officialSourceCount: 0,
      issueCodes: ["no-citations"],
      researchedAt: "2026-07-17T00:00:00.000Z",
    });
    expect(events).toEqual([{
      event: "slide_question_guide.web_research.completed",
      projectId: "project-1",
      guideId: "guide-1",
      status: "unavailable",
      attempts: 2,
      officialSourceCount: 0,
      issueCodes: ["no-citations"],
    }]);
    expect(JSON.stringify(events)).not.toContain("http");
  });

  it("rejects a provider source hash that was not in the frozen source snapshot", async () => {
    const harness = createHarness();
    const items = [0, 1, 2].map((index) => generatedItem(index));
    items[0] = {
      ...items[0],
      sourceRefs: [{ ...slideRef(), contentHash: "c".repeat(64) }],
    };
    vi.stubGlobal("fetch", vi.fn(async () => Response.json(providerResponse(items))));

    const job = await processSlideQuestionGuideGenerationJob(
      harness.dataSource,
      "http://python-worker:8000",
      payload,
    );

    expect(job.status).toBe("failed");
    expect(job.result).toBeNull();
    expect(harness.insertedItems).toHaveLength(0);
  });

  it("accepts only an official web source returned in the provider allowlist", async () => {
    const harness = createHarness();
    const webSource = webRef();
    const items: Array<Record<string, unknown>> = [0, 1, 2].map((index) => ({
      ...generatedItem(index),
      keyConcepts: [{ label: "공식 근거", sourceRefs: [webSource] }],
      sourceRefs: [webSource],
    }));
    vi.stubGlobal("fetch", vi.fn(async () => Response.json(providerResponse(
      items,
      [webSource],
    ))));

    const job = await processSlideQuestionGuideGenerationJob(
      harness.dataSource,
      "http://python-worker:8000",
      payload,
    );

    expect(job.status).toBe("succeeded");
    expect(harness.insertedItems).toHaveLength(3);
    expect(harness.storedResearch?.officialSourceCount).toBe(1);
  });

  it("rejects a web citation that is not in the provider allowlist", async () => {
    const harness = createHarness();
    const items: Array<Record<string, unknown>> = [0, 1, 2].map((index) => generatedItem(index));
    items[0] = {
      ...items[0],
      sourceRefs: [webRef()],
    };
    vi.stubGlobal("fetch", vi.fn(async () => Response.json(providerResponse(items))));

    const job = await processSlideQuestionGuideGenerationJob(
      harness.dataSource,
      "http://python-worker:8000",
      payload,
    );

    expect(job.status).toBe("failed");
    expect(harness.insertedItems).toHaveLength(0);
  });
});

function createHarness() {
  const insertedItems: unknown[] = [];
  let storedResearch: {
    status: string;
    attempts: number;
    officialSourceCount: number;
    issueCodes: string[];
    researchedAt: string | null;
  } | null = null;
  const query = vi.fn(async (sql: string, parameters: unknown[] = []) => {
    const normalized = sql.replace(/\s+/g, " ").trim();
    if (normalized.startsWith("SELECT * FROM slide_question_guides")) return [guideRow()];
    if (normalized.startsWith("SELECT chunks.id::text")) return [{
      chunk_id: "chunk-1",
      file_id: "file-1",
      content: "참고자료 근거",
      content_hash: referenceHash,
    }];
    if (normalized.startsWith("UPDATE jobs")) {
      return [jobRow(
        parameters[1] as "running" | "succeeded" | "failed",
        parameters[4] as Record<string, unknown> | null,
        parameters[5] as { code: string; message: string } | null,
      )];
    }
    return [];
  });
  const managerQuery = vi.fn(async (sql: string, parameters: unknown[] = []) => {
    const normalized = sql.replace(/\s+/g, " ").trim();
    if (normalized.includes("FOR UPDATE")) {
      return [{ status: "running", deck_version: 3, slide_content_hash: slideHash }];
    }
    if (normalized.startsWith("INSERT INTO slide_question_guide_items")) {
      insertedItems.push(parameters[4]);
    }
    if (normalized.startsWith("UPDATE slide_question_guides SET status = 'succeeded'")) {
      storedResearch = {
        status: String(parameters[3]),
        attempts: Number(parameters[4]),
        officialSourceCount: Number(parameters[5]),
        issueCodes: parameters[6] as string[],
        researchedAt: parameters[7] === null ? null : String(parameters[7]),
      };
    }
    return [];
  });
  const dataSource = {
    query,
    transaction: vi.fn(async (callback: (manager: { query: typeof managerQuery }) => Promise<void>) => (
      callback({ query: managerQuery })
    )),
  } as unknown as DataSource;
  return {
    dataSource,
    insertedItems,
    get storedResearch() { return storedResearch; },
  };
}

function guideRow() {
  return {
    guide_id: "guide-1",
    project_id: "project-1",
    deck_id: "deck-1",
    deck_version: 3,
    slide_id: "slide-1",
    slide_content_hash: slideHash,
    source_snapshot_json: {
      slideId: "slide-1",
      deckVersion: 3,
      contentHash: slideHash,
      title: "핵심 슬라이드",
      content: "슬라이드 근거",
    },
    status: "queued",
  };
}

function generatedItem(index: number) {
  return {
    questionType: ["evidence", "objection", "decision"][index],
    questionText: `질문 ${index + 1}`,
    supportState: "grounded",
    keyConcepts: [{ label: "핵심", sourceRefs: [slideRef()] }],
    suggestedAnswer: {
      summary: "근거에 기반한 답변",
      structure: ["결론", "근거"],
      caveats: [],
    },
    remediation: null,
    sourceRefs: index === 2 ? [referenceRef()] : [slideRef()],
  };
}

function slideRef() {
  return {
    kind: "slide" as const,
    slideId: "slide-1",
    objectId: null,
    deckVersion: 3,
    contentHash: slideHash,
  };
}

function referenceRef() {
  return {
    kind: "reference" as const,
    fileId: "file-1",
    chunkId: "chunk-1",
    contentHash: referenceHash,
  };
}

function webRef() {
  return {
    kind: "web" as const,
    sourceId: "web:official-1",
    url: "https://example.edu/program",
    title: "공식 교육과정",
    authority: "official" as const,
    contentHash: "c".repeat(64),
    retrievedAt: "2026-07-17T00:00:00.000Z",
  };
}

function providerResponse(
  items: Array<Record<string, unknown>>,
  webSources: ReturnType<typeof webRef>[] = [],
) {
  return {
    items,
    model: "deterministic-grounded-v2",
    research: webSources.length > 0
      ? {
          status: "succeeded",
          attempts: 1,
          officialSourceCount: webSources.length,
          issueCodes: [],
          researchedAt: "2026-07-17T00:00:00.000Z",
        }
      : {
          status: "unavailable",
          attempts: 2,
          officialSourceCount: 0,
          issueCodes: ["no-citations"],
          researchedAt: "2026-07-17T00:00:00.000Z",
        },
    webSources,
  };
}

function jobRow(
  status: "running" | "succeeded" | "failed",
  result: Record<string, unknown> | null,
  error: { code: string; message: string } | null,
) {
  return {
    job_id: payload.jobId,
    project_id: payload.projectId,
    type: "slide-question-guide-generation",
    status,
    progress: status === "running" ? 20 : 100,
    message: "updated",
    result,
    error,
    created_at: "2026-07-17T00:00:00.000Z",
    updated_at: "2026-07-17T00:00:01.000Z",
  };
}
