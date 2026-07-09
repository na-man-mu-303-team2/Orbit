import type { DataSource } from "typeorm";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SlideContextService } from "./slide-context.service";

type SlideContextQueryManager = {
  query: ReturnType<typeof vi.fn>;
};

const validEnv = {
  NODE_ENV: "test",
  APP_ENV: "local",
  WEB_PORT: "5173",
  API_PORT: "3000",
  WORKER_PORT: "3001",
  PYTHON_WORKER_PORT: "8000",
  WEB_ORIGIN: "http://localhost:5173",
  API_BASE_URL: "http://localhost:3000",
  PYTHON_WORKER_URL: "http://localhost:8000",
  DATABASE_URL: "postgres://orbit:orbit@localhost:5432/orbit",
  REDIS_URL: "redis://localhost:6379",
  SESSION_SECRET: "local-session-secret-change-me",
  COOKIE_SECRET: "local-cookie-secret-change-me",
  STORAGE_DRIVER: "minio",
  S3_ENDPOINT: "http://localhost:9000",
  S3_PUBLIC_ENDPOINT: "http://localhost:9000",
  S3_BUCKET: "orbit-local",
  S3_REGION: "ap-northeast-2",
  S3_ACCESS_KEY_ID: "orbit",
  S3_SECRET_ACCESS_KEY: "orbit-password",
  S3_FORCE_PATH_STYLE: "true",
  JOB_QUEUE_DRIVER: "bullmq",
  LIVE_STT_PROVIDER: "sherpa",
  REPORT_STT_PROVIDER: "openai",
  OCR_PROVIDER: "python",
  LLM_PROVIDER: "openai",
  OPENAI_API_KEY: "",
  OPENAI_MODEL: "gpt-4.1-mini",
  OPENAI_TRANSCRIPTION_MODEL: "gpt-4o-transcribe",
  OPENAI_EMBEDDING_MODEL: "text-embedding-3-small",
  AWS_REGION: "ap-northeast-2",
  AWS_ACCESS_KEY_ID: "",
  AWS_SECRET_ACCESS_KEY: "",
  TRANSCRIBE_LANGUAGE_CODE: "ko-KR",
  TEXTRACT_ENABLED: "false",
  DEMO_USER_ID: "user_demo_1",
  DEMO_WORKSPACE_ID: "workspace_demo_1",
  DEMO_PROJECT_ID: "project_demo_1",
  DEMO_DECK_ID: "deck_demo_1",
  DEMO_SESSION_ID: "session_demo_1"
};

describe("SlideContextService", () => {
  beforeEach(() => {
    Object.assign(process.env, validEnv);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("maps python-worker extract items to shared slide context items", async () => {
    const fetchMock = vi.fn(async () => {
      return new Response(
        JSON.stringify({
          projectId: "project-a",
          deckId: "deck_a",
          items: [
            {
              itemId: "0f5ca794-49c3-4bc3-ae72-1f1760f1e14c",
              slideId: "slide_1",
              itemOrder: 0,
              label: "문제 정의",
              sentence: "현재 방식은 충돌 상태를 일으킬 수 있습니다."
            }
          ]
        }),
        { status: 200 }
      );
    });
    vi.stubGlobal("fetch", fetchMock);

    const insertedAt = new Date("2026-07-09T00:00:00.000Z");
    const manager: SlideContextQueryManager = {
      query: vi
        .fn()
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([
          {
            item_id: "0f5ca794-49c3-4bc3-ae72-1f1760f1e14c",
            project_id: "project-a",
            deck_id: "deck_a",
            slide_id: "slide_1",
            item_order: 0,
            label: "문제 정의",
            sentence: "현재 방식은 충돌 상태를 일으킬 수 있습니다.",
            created_at: insertedAt,
            updated_at: insertedAt
          }
        ])
    };
    const transaction = vi.fn(
      async (
        callback: (manager: SlideContextQueryManager) => Promise<unknown>
      ) => callback(manager)
    );
    const dataSource = {
      transaction
    } as unknown as DataSource;

    const service = new SlideContextService(dataSource);
    const result = await service.extractItems("project-a", "deck_a", {
      projectId: "project-a",
      deckId: "deck_a",
      slides: [
        {
          slideId: "slide_1",
          slideText: "슬라이드 본문",
          speakerNotes: "발표자 노트"
        }
      ]
    });

    expect(result.items).toHaveLength(1);
    expect(result.items[0]).toMatchObject({
      itemId: "0f5ca794-49c3-4bc3-ae72-1f1760f1e14c",
      projectId: "project-a",
      deckId: "deck_a",
      slideId: "slide_1",
      itemOrder: 0,
      label: "문제 정의",
      sentence: "현재 방식은 충돌 상태를 일으킬 수 있습니다.",
      hasEmbedding: false
    });
    expect(result.items[0]?.createdAt).toEqual(expect.any(String));
    expect(result.items[0]?.updatedAt).toEqual(expect.any(String));
    expect(transaction).toHaveBeenCalledOnce();
    expect(manager.query).toHaveBeenCalledTimes(2);
    expect(fetchMock).toHaveBeenCalledWith(
      "http://localhost:8000/slide-context/extract",
      expect.objectContaining({
        method: "POST"
      })
    );
  });
});
