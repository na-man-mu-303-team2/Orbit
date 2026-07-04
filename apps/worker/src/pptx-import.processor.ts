import {
  deckSchema,
  pptxImportJobResultSchema,
  qualityReportSchema,
  templateBlueprintSchema,
  type Deck,
  type Job,
  type QualityReport,
  type TemplateBlueprint
} from "@orbit/shared";
import type { StoragePort } from "@orbit/storage";
import { randomUUID } from "crypto";
import type { DataSource } from "typeorm";
import { z } from "zod";

const pptxImportPayloadSchema = z.object({
  jobId: z.string().min(1),
  projectId: z.string().min(1),
  fileId: z.string().min(1)
});

const importedDesignAssetSchema = z.object({
  assetId: z.string().min(1),
  fileName: z.string().min(1),
  mimeType: z.string().min(1),
  contentBase64: z.string().min(1)
});

const pptxImportWorkerResponseSchema = z.object({
  blueprint: z.record(z.unknown()).default({}),
  templateBlueprint: templateBlueprintSchema,
  qualityReport: qualityReportSchema,
  assets: z.array(importedDesignAssetSchema).default([]),
  warnings: z.array(z.string()).default([])
});

type PptxImportWorkerResponse = z.infer<typeof pptxImportWorkerResponseSchema>;

type JobRow = {
  job_id: string;
  project_id: string;
  type: Job["type"];
  status: Job["status"];
  progress: number;
  message: string;
  result: Record<string, unknown> | null;
  error: { code: string; message: string } | null;
  created_at: Date | string;
  updated_at: Date | string;
};

type ProjectAssetRow = {
  file_id: string;
  project_id: string;
  storage_key: string;
  mime_type: string;
  original_name: string;
  size: number;
  purpose: string;
  status: string;
};

const pptxMimeType =
  "application/vnd.openxmlformats-officedocument.presentationml.presentation";

export async function processPptxImportJob(
  dataSource: DataSource,
  storage: Pick<StoragePort, "getSignedReadUrl" | "putObject">,
  pythonWorkerUrl: string,
  rawPayload: unknown
): Promise<Job> {
  const payloadResult = pptxImportPayloadSchema.safeParse(rawPayload);
  if (!payloadResult.success) {
    const jobId =
      rawPayload &&
      typeof rawPayload === "object" &&
      "jobId" in rawPayload &&
      typeof rawPayload.jobId === "string"
        ? rawPayload.jobId
        : "";

    if (!jobId) {
      throw new Error(payloadResult.error.message);
    }

    return failJob(
      dataSource,
      jobId,
      0,
      "PPTX_IMPORT_PAYLOAD_INVALID",
      payloadResult.error.message
    );
  }

  const payload = payloadResult.data;
  await updateJob(dataSource, payload.jobId, {
    status: "running",
    progress: 10,
    message: "PPTX import running.",
    result: null,
    error: null
  });

  let asset: ProjectAssetRow;
  let imported: PptxImportWorkerResponse;
  try {
    asset = await loadPptxAsset(dataSource, payload.projectId, payload.fileId);
    imported = await importPptxWithPython(
      storage,
      pythonWorkerUrl,
      payload.projectId,
      asset
    );
  } catch (error) {
    return failJob(
      dataSource,
      payload.jobId,
      10,
      "PPTX_IMPORT_SOURCE_FAILED",
      error instanceof Error ? error.message : "PPTX source import failed."
    );
  }

  try {
    const assetUrlMap = await saveImportedDesignAssets(
      dataSource,
      storage,
      payload.projectId,
      imported
    );
    const deck = buildImportedDeck(
      payload.projectId,
      asset,
      replaceImportedAssetRefs(imported.blueprint, assetUrlMap)
    );

    await saveDeck(dataSource, deck);
    await saveTemplateBlueprint(
      dataSource,
      payload.projectId,
      deck.deckId,
      imported.templateBlueprint,
      imported.qualityReport
    );

    const result = pptxImportJobResultSchema.parse({
      deckId: deck.deckId,
      templateId: imported.templateBlueprint.templateId,
      qualityReport: imported.qualityReport,
      warnings: imported.warnings
    });

    return updateJob(dataSource, payload.jobId, {
      status: "succeeded",
      progress: 100,
      message: "PPTX import completed.",
      result,
      error: null
    });
  } catch (error) {
    return failJob(
      dataSource,
      payload.jobId,
      75,
      "PPTX_IMPORT_SAVE_FAILED",
      error instanceof Error ? error.message : "PPTX import save failed."
    );
  }
}

async function loadPptxAsset(
  dataSource: DataSource,
  projectId: string,
  fileId: string
): Promise<ProjectAssetRow> {
  const rows = readQueryRows<ProjectAssetRow>(
    await dataSource.query(
      `
        SELECT file_id, project_id, storage_key, mime_type, original_name, size, purpose, status
        FROM project_assets
        WHERE file_id = $1
      `,
      [fileId]
    )
  );
  const asset = rows[0];

  if (!asset) {
    throw new Error(`PPTX asset not found: ${fileId}`);
  }
  if (asset.project_id !== projectId) {
    throw new Error(`PPTX asset project mismatch: ${fileId}`);
  }
  if (asset.status !== "uploaded") {
    throw new Error(`PPTX asset is not uploaded: ${fileId}`);
  }
  if (asset.purpose !== "pptx-import") {
    throw new Error(`PPTX asset purpose must be pptx-import: ${fileId}`);
  }
  if (asset.mime_type !== pptxMimeType) {
    throw new Error(`PPTX import requires a PPTX file: ${fileId}`);
  }

  return asset;
}

async function importPptxWithPython(
  storage: Pick<StoragePort, "getSignedReadUrl">,
  pythonWorkerUrl: string,
  projectId: string,
  asset: ProjectAssetRow
): Promise<PptxImportWorkerResponse> {
  const readUrl = await storage.getSignedReadUrl(asset.storage_key);
  const sourceResponse = await fetch(readUrl);
  if (!sourceResponse.ok) {
    throw new Error(`PPTX content unavailable: ${asset.file_id}`);
  }

  const form = new FormData();
  form.append("project_id", projectId);
  form.append("file_ids", asset.file_id);
  form.append(
    "files",
    new Blob([Buffer.from(await sourceResponse.arrayBuffer())], {
      type: asset.mime_type
    }),
    asset.original_name
  );

  const response = await fetch(workerUrl(pythonWorkerUrl, "/design/import-pptx"), {
    method: "POST",
    body: form,
    signal: AbortSignal.timeout(120_000)
  });

  if (!response.ok) {
    throw new Error((await response.text()) || "Python worker PPTX import failed.");
  }

  return pptxImportWorkerResponseSchema.parse(await response.json());
}

async function saveImportedDesignAssets(
  dataSource: DataSource,
  storage: Pick<StoragePort, "putObject">,
  projectId: string,
  imported: PptxImportWorkerResponse
): Promise<Map<string, string>> {
  const assetUrlMap = new Map<string, string>();

  for (const asset of imported.assets) {
    const fileId = `file_${randomUUID()}`;
    const originalName = safeStorageName(asset.fileName);
    const storageKey = `projects/${projectId}/assets/${fileId}-${originalName}`;
    const body = Buffer.from(asset.contentBase64, "base64");
    const url = createAssetContentUrl(projectId, fileId);

    await storage.putObject({
      key: storageKey,
      body,
      contentType: asset.mimeType,
      purpose: "design-asset"
    });
    await dataSource.query(
      `
        INSERT INTO project_assets (
          file_id, project_id, storage_key, original_name, mime_type, size, url,
          purpose, status, created_at, uploaded_at, deleted_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, 'design-asset', 'uploaded', now(), now(), null)
      `,
      [
        fileId,
        projectId,
        storageKey,
        originalName,
        asset.mimeType,
        body.byteLength,
        url
      ]
    );

    assetUrlMap.set(`asset:${asset.assetId}`, url);
  }

  return assetUrlMap;
}

function buildImportedDeck(
  projectId: string,
  asset: ProjectAssetRow,
  blueprint: Record<string, unknown>
): Deck {
  const slides = Array.isArray(blueprint.slides) ? blueprint.slides : [];
  const title = titleFromFileName(asset.original_name);

  return deckSchema.parse({
    deckId: `deck_import_${safeId(asset.file_id)}`,
    projectId,
    title,
    version: 1,
    metadata: {
      language: "ko",
      locale: "ko-KR",
      sourceType: "import"
    },
    canvas: {
      preset: "wide-16-9",
      width: 1920,
      height: 1080,
      aspectRatio: "16:9"
    },
    theme: isRecord(blueprint.theme) ? blueprint.theme : {},
    slides: slides.map((slide, index) =>
      buildImportedSlide(slide, index, asset.file_id)
    )
  });
}

function buildImportedSlide(
  slide: unknown,
  index: number,
  sourceFileId: string
) {
  const slideRecord = isRecord(slide) ? slide : {};
  const elements = Array.isArray(slideRecord.elements) ? slideRecord.elements : [];

  return {
    slideId: `slide_import_${safeId(sourceFileId)}_${index + 1}`,
    order: index + 1,
    title: slideTitle(elements, index + 1),
    thumbnailUrl: "",
    style: isRecord(slideRecord.style) ? slideRecord.style : {},
    speakerNotes: "",
    elements,
    keywords: [],
    animations: [],
    aiNotes: {
      emphasisPoints: [],
      sourceEvidence: []
    }
  };
}

async function saveDeck(
  dataSource: DataSource,
  deck: Deck
): Promise<void> {
  await dataSource.query(
    `
      INSERT INTO decks (project_id, deck_id, deck_json, version, updated_at)
      VALUES ($1, $2, $3, $4, now())
      ON CONFLICT (project_id)
      DO UPDATE SET
        deck_id = EXCLUDED.deck_id,
        deck_json = EXCLUDED.deck_json,
        version = EXCLUDED.version,
        updated_at = EXCLUDED.updated_at
    `,
    [deck.projectId, deck.deckId, deck, deck.version]
  );
}

async function saveTemplateBlueprint(
  dataSource: DataSource,
  projectId: string,
  deckId: string,
  templateBlueprint: TemplateBlueprint,
  qualityReport: QualityReport
): Promise<void> {
  await dataSource.query(
    `
      INSERT INTO template_blueprints (
        template_id, project_id, deck_id, source_file_id,
        blueprint_json, quality_report_json, created_at, updated_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, now(), now())
      ON CONFLICT (template_id)
      DO UPDATE SET
        project_id = EXCLUDED.project_id,
        deck_id = EXCLUDED.deck_id,
        source_file_id = EXCLUDED.source_file_id,
        blueprint_json = EXCLUDED.blueprint_json,
        quality_report_json = EXCLUDED.quality_report_json,
        updated_at = EXCLUDED.updated_at
    `,
    [
      templateBlueprint.templateId,
      projectId,
      deckId,
      templateBlueprint.sourceFileId,
      templateBlueprint,
      qualityReport
    ]
  );
}

function replaceImportedAssetRefs(
  value: unknown,
  assetUrlMap: Map<string, string>
): Record<string, unknown> {
  const replaced = replaceValue(value, assetUrlMap);
  return isRecord(replaced) ? replaced : {};
}

function replaceValue(value: unknown, assetUrlMap: Map<string, string>): unknown {
  if (typeof value === "string") {
    return assetUrlMap.get(value) ?? value;
  }

  if (Array.isArray(value)) {
    return value.map((item) => replaceValue(item, assetUrlMap));
  }

  if (isRecord(value)) {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [
        key,
        replaceValue(item, assetUrlMap)
      ])
    );
  }

  return value;
}

async function failJob(
  dataSource: DataSource,
  jobId: string,
  progress: number,
  code: string,
  message: string
): Promise<Job> {
  return updateJob(dataSource, jobId, {
    status: "failed",
    progress,
    message: "PPTX import failed.",
    result: null,
    error: { code, message }
  });
}

async function updateJob(
  dataSource: DataSource,
  jobId: string,
  patch: {
    status: "running" | "succeeded" | "failed";
    progress: number;
    message: string;
    result: Record<string, unknown> | null;
    error: { code: string; message: string } | null;
  }
): Promise<Job> {
  const rows = await dataSource.query(
    `
      UPDATE jobs
      SET status = $2,
          progress = $3,
          message = $4,
          result = $5,
          error = $6,
          updated_at = now()
      WHERE job_id = $1
      RETURNING *
    `,
    [jobId, patch.status, patch.progress, patch.message, patch.result, patch.error]
  );

  const row = readFirstQueryRow<JobRow>(rows);
  if (!row) {
    throw new Error(`Job not found: ${jobId}`);
  }

  return rowToJob(row);
}

function readFirstQueryRow<T>(queryResult: unknown): T | null {
  if (!Array.isArray(queryResult)) {
    return null;
  }

  const first = queryResult[0];
  if (Array.isArray(first)) {
    return (first[0] as T | undefined) ?? null;
  }

  return (first as T | undefined) ?? null;
}

function readQueryRows<T>(queryResult: unknown): T[] {
  if (!Array.isArray(queryResult)) {
    return [];
  }

  const first = queryResult[0];
  return (Array.isArray(first) ? first : queryResult) as T[];
}

function rowToJob(row: JobRow): Job {
  return {
    jobId: row.job_id,
    projectId: row.project_id,
    type: row.type,
    status: row.status,
    progress: row.progress,
    message: row.message,
    result: row.result,
    error: row.error,
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at)
  };
}

function toIso(value: Date | string): string {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new Error(`Invalid timestamp value: ${String(value)}`);
  }

  return date.toISOString();
}

function workerUrl(baseUrl: string, path: string): string {
  return new URL(
    path,
    baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`
  ).toString();
}

function createAssetContentUrl(projectId: string, fileId: string): string {
  return `/api/v1/projects/${encodeURIComponent(projectId)}/assets/${encodeURIComponent(
    fileId
  )}/content`;
}

function safeStorageName(fileName: string): string {
  return (fileName || "design-asset").replace(/[^a-zA-Z0-9._-]/g, "_");
}

function safeId(value: string): string {
  return value.replace(/[^A-Za-z0-9_-]/g, "_") || "pptx";
}

function titleFromFileName(fileName: string): string {
  const stem = fileName.replace(/\.[^.]+$/, "").trim();
  return stem || "Imported PPTX";
}

function slideTitle(elements: unknown[], slideNumber: number): string {
  const textElement =
    elements.find((element) => isTextElementWithRole(element, "title")) ??
    elements.find((element) => isTextElementWithRole(element));

  if (!isRecord(textElement) || !isRecord(textElement.props)) {
    return `Slide ${slideNumber}`;
  }

  const text = String(textElement.props.text ?? "").trim();
  return text || `Slide ${slideNumber}`;
}

function isTextElementWithRole(element: unknown, role?: string): boolean {
  return (
    isRecord(element) &&
    element.type === "text" &&
    (!role || element.role === role) &&
    isRecord(element.props) &&
    typeof element.props.text === "string" &&
    element.props.text.trim().length > 0
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
