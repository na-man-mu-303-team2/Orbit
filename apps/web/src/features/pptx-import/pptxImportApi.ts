import {
  getDeckResponseSchema,
  jobSchema,
  pptxImportJobResultSchema,
  type Deck,
  type Job,
  type PptxImportJobResult,
} from "@orbit/shared";

type Fetcher = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

export async function createPptxImportJob(
  projectId: string,
  fileId: string,
  fetcher: Fetcher = fetch,
): Promise<Job> {
  const response = await fetcher(
    `/api/v1/projects/${encodeURIComponent(projectId)}/pptx-imports`,
    {
      body: JSON.stringify({ fileId }),
      credentials: "include",
      headers: { "content-type": "application/json" },
      method: "POST",
    },
  );
  if (!response.ok) {
    throw new Error(await readError(response, "PPTX 분석 작업을 시작하지 못했습니다."));
  }
  const payload = (await response.json()) as { job?: unknown };
  return jobSchema.parse(payload.job);
}

export async function waitForPptxImportJob(
  jobId: string,
  fetcher: Fetcher = fetch,
  options: { pollIntervalMs?: number; timeoutMs?: number } = {},
): Promise<Job> {
  const pollIntervalMs = options.pollIntervalMs ?? 1_200;
  const timeoutMs = options.timeoutMs ?? 120_000;
  const startedAt = Date.now();

  for (;;) {
    const response = await fetcher(`/api/jobs/${encodeURIComponent(jobId)}`, {
      credentials: "include",
    });
    if (!response.ok) {
      throw new Error(await readError(response, "PPTX 분석 상태를 불러오지 못했습니다."));
    }
    const job = jobSchema.parse(await response.json());
    if (job.status === "succeeded" || job.status === "failed") return job;
    if (Date.now() - startedAt > timeoutMs) {
      throw new Error("PPTX 분석 시간이 초과됐습니다. 프로젝트에서 다시 확인해 주세요.");
    }
    await delay(pollIntervalMs);
  }
}

export async function importPptxProject(
  projectId: string,
  fileId: string,
  fetcher: Fetcher = fetch,
  options: { pollIntervalMs?: number; timeoutMs?: number } = {},
): Promise<PptxImportJobResult> {
  const queued = await createPptxImportJob(projectId, fileId, fetcher);
  const completed = await waitForPptxImportJob(queued.jobId, fetcher, options);
  if (completed.status === "failed") {
    throw new Error(completed.error?.message ?? "PPTX 분석에 실패했습니다.");
  }
  return pptxImportJobResultSchema.parse(completed.result);
}

export async function fetchImportedDeck(
  projectId: string,
  fetcher: Fetcher = fetch,
): Promise<Deck> {
  const response = await fetcher(
    `/api/v1/projects/${encodeURIComponent(projectId)}/deck`,
    { credentials: "include" },
  );
  if (!response.ok) {
    throw new Error(await readError(response, "가져온 발표자료를 불러오지 못했습니다."));
  }
  return getDeckResponseSchema.parse(await response.json()).deck;
}

async function readError(response: Response, fallback: string) {
  const text = await response.text();
  return text || fallback;
}

function delay(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}
