import { expect, test } from "@playwright/test";

const apiBaseUrl = process.env.ORBIT_API_URL ?? "http://127.0.0.1:3000";
const smokeDeck = {
  deckId: "deck_demo_1",
  projectId: "project_demo_1",
  title: "ORBIT 리허설 Smoke Deck",
  version: 1,
  metadata: { language: "ko", locale: "ko-KR", sourceType: "manual" },
  canvas: {
    preset: "wide-16-9",
    width: 1920,
    height: 1080,
    aspectRatio: "16:9"
  },
  theme: {
    fontFamily: "Inter",
    backgroundColor: "#ffffff",
    textColor: "#15202b",
    accentColor: "#0f766e"
  },
  slides: [
    {
      slideId: "slide_smoke_1",
      order: 1,
      title: "ORBIT 리허설 흐름",
      thumbnailUrl: "",
      style: {
        layout: "title-content",
        backgroundColor: "#ffffff",
        textColor: "#15202b",
        accentColor: "#0f766e"
      },
      speakerNotes: "ORBIT 리허설 흐름을 설명합니다.",
      elements: [
        {
          elementId: "el_smoke_1",
          type: "text",
          x: 120,
          y: 140,
          width: 900,
          height: 180,
          rotation: 0,
          opacity: 1,
          locked: false,
          props: {
            text: "ORBIT 리허설 흐름",
            fontSize: 64,
            fontFamily: "Inter",
            fontWeight: 800,
            color: "#15202b",
            align: "left"
          }
        }
      ],
      keywords: [
        {
          keywordId: "kw_smoke_1",
          text: "ORBIT",
          synonyms: ["오르빗"],
          abbreviations: []
        }
      ],
      animations: [],
      aiNotes: { emphasisPoints: [], sourceEvidence: [] }
    },
    {
      slideId: "slide_smoke_2",
      order: 2,
      title: "리포트 분석 완료",
      thumbnailUrl: "",
      style: {
        layout: "closing",
        backgroundColor: "#f8fafb",
        textColor: "#15202b",
        accentColor: "#0f766e"
      },
      speakerNotes: "리포트 분석 완료 상태를 확인합니다.",
      elements: [
        {
          elementId: "el_smoke_2",
          type: "text",
          x: 120,
          y: 140,
          width: 900,
          height: 180,
          rotation: 0,
          opacity: 1,
          locked: false,
          props: {
            text: "리포트 분석 완료",
            fontSize: 64,
            fontFamily: "Inter",
            fontWeight: 800,
            color: "#15202b",
            align: "left"
          }
        }
      ],
      keywords: [],
      animations: [],
      aiNotes: { emphasisPoints: [], sourceEvidence: [] }
    }
  ]
};

test.describe("ORBIT-2 ORBIT-10 ORBIT-36 ORBIT-58 smoke", () => {
  test("serves the web shell and API health contract", async ({
    page,
    request
  }) => {
    const apiHealth = await request.get(`${apiBaseUrl}/health`);
    expect(apiHealth.ok()).toBe(true);
    expect(await apiHealth.json()).toEqual(
      expect.objectContaining({
        status: "ok",
        app: "orbit-api",
        demo: expect.objectContaining({
          projectId: "project_demo_1",
          sessionId: "session_demo_1"
        })
      })
    );

    await page.goto("/");

    await expect(
      page.getByRole("heading", { name: "ORBIT Demo Console" })
    ).toBeVisible();
    await expect(page.getByText("project_demo_1")).toBeVisible();
    await expect(page.getByText("session_demo_1")).toBeVisible();
    await expect(
      page.getByRole("button", { name: "프로젝트 생성" })
    ).toBeVisible();
    await expect(page.getByText("ok")).toBeVisible();
  });

  test("creates a project and completes a project asset upload", async ({
    page
  }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "프로젝트 생성" }).click();

    await expect(
      page.getByRole("heading", { name: "프로젝트와 파일" })
    ).toBeVisible();

    await page.getByLabel("프로젝트 이름").fill("ORBIT-10 smoke project");
    await page
      .getByRole("button", { name: "프로젝트 생성" })
      .click();

    await expect(
      page.getByRole("heading", { name: "ORBIT-10 smoke project" })
    ).toBeVisible();

    await page.locator('input[type="file"]').setInputFiles({
      name: "smoke.pdf",
      mimeType: "application/pdf",
      buffer: Buffer.from("%PDF-1.4\nORBIT smoke\n")
    });
    await expect(page.getByText("smoke.pdf")).toBeVisible();

    await page.getByRole("button", { name: "업로드" }).click();

    await expect(page.getByText("smoke.pdf 업로드 완료")).toBeVisible({
      timeout: 20_000
    });
    await expect(
      page.getByRole("list", { name: "업로드된 파일" }).getByText("smoke.pdf")
    ).toBeVisible();
  });

  test("records rehearsal audio and completes the STT upload flow", async ({
    page
  }) => {
    const requestOrder: string[] = [];
    let jobPollCount = 0;

    await page.addInitScript(() => {
      type LiveCallbacks = {
        onPartialTranscript: (event: {
          type: "partial-transcript";
          transcript: string;
          isFinal: boolean;
          confidence: number;
        }) => void;
        onError: (error: Error) => void;
      };
      const orbitWindow = window as Window & {
        __orbitCreateLiveSttAdapter?: () => {
          start: (stream: MediaStream, callbacks: LiveCallbacks) => Promise<void>;
          stop: () => void;
          dispose: () => void;
        };
        __orbitLiveSttCallbacks?: LiveCallbacks;
      };

      Object.defineProperty(navigator, "mediaDevices", {
        configurable: true,
        value: {
          getUserMedia: async () => ({
            getTracks: () => [{ stop: () => undefined }]
          })
        }
      });

      class FakeMediaRecorder {
        static isTypeSupported() {
          return true;
        }

        state = "inactive";
        ondataavailable: ((event: { data: Blob }) => void) | null = null;
        onerror: ((event: Event) => void) | null = null;
        onstop: ((event: Event) => void) | null = null;

        constructor(
          readonly stream: MediaStream,
          readonly options?: MediaRecorderOptions
        ) {}

        start() {
          this.state = "recording";
        }

        stop() {
          this.state = "inactive";
          this.ondataavailable?.({
            data: new Blob(["audio"], {
              type: this.options?.mimeType ?? "audio/webm"
            })
          });
          this.onstop?.(new Event("stop"));
        }
      }

      Object.defineProperty(window, "MediaRecorder", {
        configurable: true,
        value: FakeMediaRecorder
      });

      orbitWindow.__orbitCreateLiveSttAdapter = () => ({
        async start(_stream: MediaStream, callbacks: LiveCallbacks) {
          orbitWindow.__orbitLiveSttCallbacks = callbacks;
        },
        stop() {},
        dispose() {}
      });
    });

    await page.route("**/api/v1/projects/project_demo_1/deck", async (route) => {
      requestOrder.push("deck");
      await route.fulfill({
        json: {
          projectId: "project_demo_1",
          deck: smokeDeck,
          updatedAt: "2026-06-29T00:00:00.000Z"
        }
      });
    });
    await page.route("**/api/v1/projects/project_demo_1/rehearsals", async (route) => {
      requestOrder.push("run");
      await route.fulfill({ json: { run: rehearsalRun("created") } });
    });
    await page.route("**/api/v1/rehearsals/run_smoke/audio/upload-url", async (route) => {
      requestOrder.push("upload-url");
      await route.fulfill({
        json: {
          run: rehearsalRun("uploading", { audioFileId: "file_audio_smoke" }),
          upload: {
            fileId: "file_audio_smoke",
            projectId: "project_demo_1",
            uploadUrl: "http://storage.local/rehearsal-smoke.webm",
            method: "PUT",
            headers: { "content-type": "audio/webm" },
            expiresAt: "2026-06-29T00:15:00.000Z",
            purpose: "rehearsal-audio"
          }
        }
      });
    });
    await page.route("http://storage.local/rehearsal-smoke.webm", async (route) => {
      requestOrder.push("storage-put");
      await route.fulfill({ status: 200, body: "" });
    });
    await page.route("**/api/v1/rehearsals/run_smoke/audio/complete", async (route) => {
      requestOrder.push("complete");
      await route.fulfill({
        json: {
          run: rehearsalRun("processing", {
            audioFileId: "file_audio_smoke",
            jobId: "job_smoke"
          }),
          job: rehearsalJob("queued", 0)
        }
      });
    });
    await page.route("**/api/jobs/job_smoke", async (route) => {
      requestOrder.push("job");
      jobPollCount += 1;
      await route.fulfill({
        json:
          jobPollCount === 1
            ? rehearsalJob("running", 40)
            : rehearsalJob("succeeded", 100)
      });
    });
    await page.route("**/api/v1/rehearsals/run_smoke", async (route) => {
      requestOrder.push("run-status");
      await route.fulfill({
        json: {
          run: rehearsalRun("succeeded", {
            audioFileId: "file_audio_smoke",
            jobId: "job_smoke",
            rawAudioDeletedAt: "2026-06-29T00:00:10.000Z"
          })
        }
      });
    });

    await page.goto("/");
    await page.getByRole("button", { name: "리허설" }).click();

    await expect(page.getByRole("heading", { name: "리허설", exact: true })).toBeVisible();
    await expect(
      page.getByRole("heading", {
        name: smokeDeck.slides[0]?.title ?? "",
        exact: true
      })
    ).toBeVisible();

    await page.getByRole("button", { name: "리포트 녹음 시작" }).click();
    await expect(page.getByText("recording")).toBeVisible();
    await expect(page.getByText("listening")).toBeVisible();

    await page.evaluate(() => {
      const orbitWindow = window as Window & {
        __orbitLiveSttCallbacks?: {
          onPartialTranscript: (event: {
            type: "partial-transcript";
            transcript: string;
            isFinal: boolean;
            confidence: number;
          }) => void;
        };
      };
      orbitWindow.__orbitLiveSttCallbacks?.onPartialTranscript({
        type: "partial-transcript",
        transcript: "오늘은 오르빗 리허설 흐름을 확인합니다",
        isFinal: false,
        confidence: 0.9
      });
    });

    await expect(page.getByText(`2 / ${smokeDeck.slides.length}`)).toBeVisible();

    await page.getByRole("button", { name: "리포트 녹음 종료" }).click();
    await expect(page.getByText("raw audio 삭제 완료")).toBeVisible({
      timeout: 20_000
    });
    expect(requestOrder).toEqual([
      "deck",
      "run",
      "upload-url",
      "storage-put",
      "complete",
      "job",
      "job",
      "run-status"
    ]);
  });
});

function rehearsalRun(status: string, patch: Record<string, unknown> = {}) {
  return {
    runId: "run_smoke",
    projectId: "project_demo_1",
    deckId: smokeDeck.deckId,
    audioFileId: null,
    jobId: null,
    status,
    error: null,
    rawAudioDeletedAt: null,
    createdAt: "2026-06-29T00:00:00.000Z",
    updatedAt: "2026-06-29T00:00:00.000Z",
    ...patch
  };
}

function rehearsalJob(status: string, progress: number) {
  return {
    jobId: "job_smoke",
    projectId: "project_demo_1",
    type: "rehearsal-stt",
    status,
    progress,
    message: status,
    result: null,
    error: null,
    createdAt: "2026-06-29T00:00:00.000Z",
    updatedAt: "2026-06-29T00:00:00.000Z"
  };
}
