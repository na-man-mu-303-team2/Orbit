import {
  deckExportJobResultSchema,
  pptxOoxmlGenerationJobResultSchema,
  type Deck,
  type DeckExportJobResult,
  type PptxOoxmlGenerationJobResult
} from "@orbit/shared";
import { jobSchema, type Job } from "../../../../../../../packages/shared/src/jobs/job.schema";

import { uploadProjectAsset } from "../../../projects/ProjectAssetWorkspace";
import { getPptxImportValidationMessage } from "../utils/editorFileValidation";

export async function createPptxOoxmlGenerationJob(
  projectId: string,
  fileId: string,
  fetcher: typeof fetch = fetch
): Promise<Job> {
  const response = await fetcher(
    `/api/v1/projects/${encodeURIComponent(projectId)}/pptx-ooxml-generations`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ fileId })
    }
  );

  if (!response.ok) {
    throw new Error(
      await readPlainError(response, "PPTX OOXML generation job creation failed")
    );
  }

  const payload = (await response.json()) as { job?: unknown };
  return jobSchema.parse(payload.job);
}

export async function createSemanticCueExtractionJob(
  projectId: string,
  force: boolean,
  fetcher: typeof fetch = fetch
): Promise<Job> {
  const response = await fetcher(
    `/api/v1/projects/${encodeURIComponent(projectId)}/deck/semantic-cues`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ force })
    }
  );

  if (!response.ok) {
    throw new Error(
      await readPlainError(response, "Semantic Cue extraction job creation failed")
    );
  }

  const payload = (await response.json()) as { job?: unknown };
  return jobSchema.parse(payload.job);
}

export async function waitForSemanticCueExtractionJob(
  jobId: string,
  fetcher: typeof fetch = fetch,
  options: { pollIntervalMs?: number; timeoutMs?: number } = {}
): Promise<Job> {
  const pollIntervalMs = options.pollIntervalMs ?? 1200;
  const timeoutMs = options.timeoutMs ?? 120_000;
  const startedAt = Date.now();

  for (;;) {
    const response = await fetcher(`/api/jobs/${encodeURIComponent(jobId)}`);
    if (!response.ok) {
      throw new Error(
        await readPlainError(response, "Semantic Cue extraction job fetch failed")
      );
    }

    const job = jobSchema.parse(await response.json());
    if (job.status === "succeeded" || job.status === "failed") {
      return job;
    }
    if (Date.now() - startedAt > timeoutMs) {
      throw new Error("Semantic Cue extraction job timed out.");
    }
    await delay(pollIntervalMs);
  }
}

export async function waitForPptxOoxmlGenerationJob(
  jobId: string,
  fetcher: typeof fetch = fetch,
  options: { pollIntervalMs?: number; timeoutMs?: number } = {}
): Promise<Job> {
  const pollIntervalMs = options.pollIntervalMs ?? 1200;
  const timeoutMs = options.timeoutMs ?? 120_000;
  const startedAt = Date.now();

  for (;;) {
    const response = await fetcher(`/api/jobs/${encodeURIComponent(jobId)}`);

    if (!response.ok) {
      throw new Error(
        await readPlainError(response, "PPTX OOXML generation job fetch failed")
      );
    }

    const job = jobSchema.parse(await response.json());
    if (job.status === "succeeded" || job.status === "failed") {
      return job;
    }

    if (Date.now() - startedAt > timeoutMs) {
      throw new Error("PPTX OOXML generation job timed out.");
    }

    await delay(pollIntervalMs);
  }
}

export async function createDeckExportJob(
  projectId: string,
  fetcher: typeof fetch = fetch
): Promise<Job> {
  const response = await fetcher(
    `/api/v1/projects/${encodeURIComponent(projectId)}/deck/exports`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ format: "pptx" })
    }
  );

  if (!response.ok) {
    throw new Error(await readPlainError(response, "Deck export job creation failed"));
  }

  const payload = (await response.json()) as { job?: unknown };
  return jobSchema.parse(payload.job);
}

export async function waitForDeckExportJob(
  jobId: string,
  fetcher: typeof fetch = fetch,
  options: { pollIntervalMs?: number; timeoutMs?: number } = {}
): Promise<Job> {
  const pollIntervalMs = options.pollIntervalMs ?? 1200;
  const timeoutMs = options.timeoutMs ?? 120_000;
  const startedAt = Date.now();

  for (;;) {
    const response = await fetcher(`/api/jobs/${encodeURIComponent(jobId)}`);

    if (!response.ok) {
      throw new Error(await readPlainError(response, "Deck export job fetch failed"));
    }

    const job = jobSchema.parse(await response.json());
    if (job.status === "succeeded" || job.status === "failed") {
      return job;
    }

    if (Date.now() - startedAt > timeoutMs) {
      throw new Error("Deck export job timed out.");
    }

    await delay(pollIntervalMs);
  }
}

export async function exportDeckToPptx(
  projectId: string,
  fetcher: typeof fetch = fetch
): Promise<DeckExportJobResult> {
  const queuedJob = await createDeckExportJob(projectId, fetcher);
  const job = await waitForDeckExportJob(queuedJob.jobId, fetcher);
  if (job.status === "failed") {
    throw new Error(job.error?.message ?? "Deck export failed.");
  }
  return deckExportJobResultSchema.parse(job.result);
}

export async function uploadAndImportPptxTemplate(
  projectId: string,
  file: File,
  options: {
    fetcher?: typeof fetch;
    onPhase?: (phase: "uploading" | "importing") => void;
    pollIntervalMs?: number;
    timeoutMs?: number;
  } = {}
): Promise<PptxOoxmlGenerationJobResult> {
  const validationMessage = getPptxImportValidationMessage(file);
  if (validationMessage) {
    throw new Error(validationMessage);
  }

  const fetcher = options.fetcher ?? fetch;
  options.onPhase?.("uploading");
  const uploaded = await uploadProjectAsset(projectId, file, "pptx-import", fetcher);
  options.onPhase?.("importing");
  const queuedJob = await createPptxOoxmlGenerationJob(
    projectId,
    uploaded.fileId,
    fetcher
  );
  const job = await waitForPptxOoxmlGenerationJob(queuedJob.jobId, fetcher, {
    pollIntervalMs: options.pollIntervalMs,
    timeoutMs: options.timeoutMs
  });

  if (job.status === "failed") {
    throw new Error(job.error?.message ?? "PPTX OOXML generation failed.");
  }

  return pptxOoxmlGenerationJobResultSchema.parse(job.result);
}

export function requireMatchingPptxImportedDeck(
  importResult: Pick<PptxOoxmlGenerationJobResult, "deckId">,
  importedDeck: Deck | undefined
): Deck {
  if (!importedDeck) {
    throw new Error("변환된 PPTX Deck을 불러오지 못했습니다.");
  }

  if (importedDeck.deckId !== importResult.deckId) {
    throw new Error("변환 결과와 불러온 PPTX Deck이 일치하지 않습니다.");
  }

  return importedDeck;
}

export async function importPptxIntoEditor(
  projectId: string,
  file: File,
  options: {
    fetcher?: typeof fetch;
    onPhase?: (phase: "uploading" | "importing") => void;
    pollIntervalMs?: number;
    timeoutMs?: number;
    refetchDeck: () => Promise<Deck | undefined>;
  }
): Promise<{
  importResult: PptxOoxmlGenerationJobResult;
  importedDeck: Deck;
}> {
  const importResult = await uploadAndImportPptxTemplate(projectId, file, options);
  const importedDeck = requireMatchingPptxImportedDeck(
    importResult,
    await options.refetchDeck()
  );

  return { importResult, importedDeck };
}

async function readPlainError(response: Response, fallbackMessage: string) {
  const text = await response.text();
  return text || fallbackMessage;
}

function delay(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}
