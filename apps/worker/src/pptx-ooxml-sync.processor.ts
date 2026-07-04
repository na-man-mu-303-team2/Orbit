import {
  deckCanvasSchema,
  pptxOoxmlSyncJobResultSchema,
  templateBlueprintSchema,
  type DeckCanvas,
  type DeckPatchOperation,
  type Job,
  type TemplateBlueprint,
} from "@orbit/shared";
import type { StoragePort } from "@orbit/storage";
import { randomUUID } from "crypto";
import type { DataSource } from "typeorm";
import { z } from "zod";

const pptxOoxmlSyncPayloadSchema = z.object({
  jobId: z.string().min(1),
  projectId: z.string().min(1),
  deckId: z.string().min(1),
  changeId: z.string().min(1),
  targetDeckVersion: z.number().int().positive(),
});

const syncAssetSchema = z.object({
  assetId: z.string().min(1),
  fileName: z.string().min(1),
  mimeType: z.string().min(1),
  contentBase64: z.string().min(1),
});

const pptxOoxmlSyncWorkerResponseSchema = z.object({
  assets: z.array(syncAssetSchema).default([]),
  elementSources: z
    .array(
      z.object({
        elementId: z.string().min(1),
        slidePart: z.string().min(1),
        shapeId: z.string().min(1),
        relationshipId: z.string().min(1).optional(),
        sourceType: z.enum([
          "placeholder",
          "slide",
          "layout",
          "master",
          "table",
          "image",
          "shape",
          "unknown",
        ]),
        writable: z.boolean(),
        fallbackReason: z.string().min(1).optional(),
      }),
    )
    .default([]),
  warnings: z.array(z.string()).default([]),
});

type PptxOoxmlSyncWorkerResponse = z.infer<
  typeof pptxOoxmlSyncWorkerResponseSchema
>;

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

type TemplateBlueprintRow = {
  template_id: string;
  blueprint_json: unknown;
  quality_report_json: unknown;
};

type DeckRow = {
  deck_json: unknown;
};

type DeckPatchRow = {
  operations: DeckPatchOperation[];
};

type SavedSyncAssets = {
  currentPackageFileId: string;
  renderAssetFileIds: string[];
};

const pptxMimeType =
  "application/vnd.openxmlformats-officedocument.presentationml.presentation";

export async function processPptxOoxmlSyncJob(
  dataSource: DataSource,
  storage: Pick<StoragePort, "getSignedReadUrl" | "putObject">,
  pythonWorkerUrl: string,
  rawPayload: unknown,
): Promise<Job> {
  const payloadResult = pptxOoxmlSyncPayloadSchema.safeParse(rawPayload);
  if (!payloadResult.success) {
    const jobId = readRawJobId(rawPayload);
    if (!jobId) {
      throw new Error(payloadResult.error.message);
    }
    return failJob(
      dataSource,
      jobId,
      0,
      "PPTX_OOXML_SYNC_PAYLOAD_INVALID",
      payloadResult.error.message,
    );
  }

  const payload = payloadResult.data;
  await updateJob(dataSource, payload.jobId, {
    status: "running",
    progress: 10,
    message: "PPTX OOXML sync running.",
    result: null,
    error: null,
  });

  try {
    const templateRow = await loadTemplateBlueprintRow(
      dataSource,
      payload.projectId,
      payload.deckId,
    );
    const templateBlueprint = templateBlueprintSchema.parse(
      templateRow.blueprint_json,
    );
    const packageAsset = await loadPackageAsset(
      dataSource,
      payload.projectId,
      currentPackageFileId(templateBlueprint),
    );
    const deckCanvas = await loadDeckCanvas(
      dataSource,
      payload.projectId,
      payload.deckId,
    );
    const operations = await loadUnsyncedPatchOperations(
      dataSource,
      payload.projectId,
      payload.deckId,
      templateBlueprint.ooxmlSyncedDeckVersion ?? 1,
      payload.targetDeckVersion,
    );
    const synced = await syncPptxOoxmlWithPython(
      storage,
      pythonWorkerUrl,
      payload,
      packageAsset,
      templateBlueprint,
      deckCanvas,
      operations,
    );
    const savedAssets = await saveSyncAssets(
      dataSource,
      storage,
      payload.projectId,
      synced,
    );
    const nextTemplateBlueprint = withSyncResult(
      templateBlueprint,
      savedAssets,
      payload.targetDeckVersion,
      synced,
    );
    await updateTemplateBlueprint(
      dataSource,
      payload.projectId,
      payload.deckId,
      nextTemplateBlueprint,
      templateRow.quality_report_json,
    );

    const result = pptxOoxmlSyncJobResultSchema.parse({
      deckId: payload.deckId,
      templateId: nextTemplateBlueprint.templateId,
      currentPackageFileId: savedAssets.currentPackageFileId,
      renderAssetFileIds: savedAssets.renderAssetFileIds,
      syncedDeckVersion: payload.targetDeckVersion,
      warnings: synced.warnings,
    });

    return updateJob(dataSource, payload.jobId, {
      status: "succeeded",
      progress: 100,
      message: "PPTX OOXML sync completed.",
      result,
      error: null,
    });
  } catch (error) {
    return failJob(
      dataSource,
      payload.jobId,
      50,
      "PPTX_OOXML_SYNC_FAILED",
      error instanceof Error ? error.message : "PPTX OOXML sync failed.",
    );
  }
}

async function loadTemplateBlueprintRow(
  dataSource: DataSource,
  projectId: string,
  deckId: string,
): Promise<TemplateBlueprintRow> {
  const rows = readQueryRows<TemplateBlueprintRow>(
    await dataSource.query(
      `
        SELECT template_id, blueprint_json, quality_report_json
        FROM template_blueprints
        WHERE project_id = $1 AND deck_id = $2
        ORDER BY updated_at DESC, created_at DESC
        LIMIT 1
      `,
      [projectId, deckId],
    ),
  );
  const row = rows[0];
  if (!row) {
    throw new Error(`Template blueprint not found for deck: ${deckId}`);
  }
  return row;
}

async function loadPackageAsset(
  dataSource: DataSource,
  projectId: string,
  fileId: string,
): Promise<ProjectAssetRow> {
  const rows = readQueryRows<ProjectAssetRow>(
    await dataSource.query(
      `
        SELECT file_id, project_id, storage_key, mime_type, original_name, size, purpose, status
        FROM project_assets
        WHERE file_id = $1
      `,
      [fileId],
    ),
  );
  const asset = rows[0];
  if (!asset) {
    throw new Error(`PPTX package asset not found: ${fileId}`);
  }
  if (asset.project_id !== projectId) {
    throw new Error(`PPTX package asset project mismatch: ${fileId}`);
  }
  if (asset.status !== "uploaded" || asset.mime_type !== pptxMimeType) {
    throw new Error(
      `PPTX OOXML sync requires an uploaded PPTX package: ${fileId}`,
    );
  }
  return asset;
}

async function loadDeckCanvas(
  dataSource: DataSource,
  projectId: string,
  deckId: string,
): Promise<DeckCanvas> {
  const rows = readQueryRows<DeckRow>(
    await dataSource.query(
      `
        SELECT deck_json
        FROM decks
        WHERE project_id = $1 AND deck_id = $2
      `,
      [projectId, deckId],
    ),
  );
  const deck = rows[0]?.deck_json;
  if (isRecord(deck)) {
    return deckCanvasSchema.parse(deck.canvas);
  }
  throw new Error(`Deck not found for OOXML sync: ${deckId}`);
}

async function loadUnsyncedPatchOperations(
  dataSource: DataSource,
  projectId: string,
  deckId: string,
  syncedVersion: number,
  targetDeckVersion: number,
): Promise<DeckPatchOperation[]> {
  const rows = readQueryRows<DeckPatchRow>(
    await dataSource.query(
      `
        SELECT operations
        FROM deck_patches
        WHERE project_id = $1
          AND deck_id = $2
          AND after_version > $3
          AND after_version <= $4
        ORDER BY after_version ASC, created_at ASC, change_id ASC
      `,
      [projectId, deckId, syncedVersion, targetDeckVersion],
    ),
  );
  return rows.flatMap((row) => row.operations);
}

async function syncPptxOoxmlWithPython(
  storage: Pick<StoragePort, "getSignedReadUrl">,
  pythonWorkerUrl: string,
  payload: z.infer<typeof pptxOoxmlSyncPayloadSchema>,
  asset: ProjectAssetRow,
  templateBlueprint: TemplateBlueprint,
  deckCanvas: DeckCanvas,
  operations: DeckPatchOperation[],
): Promise<PptxOoxmlSyncWorkerResponse> {
  const readUrl = await storage.getSignedReadUrl(asset.storage_key);
  const sourceResponse = await fetch(readUrl);
  if (!sourceResponse.ok) {
    throw new Error(`PPTX package content unavailable: ${asset.file_id}`);
  }

  const form = new FormData();
  form.append("template_blueprint", JSON.stringify(templateBlueprint));
  form.append(
    "operations",
    JSON.stringify(operations.filter(isOoxmlSyncOperation)),
  );
  form.append("deck_canvas", JSON.stringify(deckCanvas));
  form.append("synced_deck_version", String(payload.targetDeckVersion));
  form.append("render", "true");
  form.append(
    "file",
    new Blob([Buffer.from(await sourceResponse.arrayBuffer())], {
      type: asset.mime_type,
    }),
    asset.original_name,
  );

  const response = await fetch(
    workerUrl(pythonWorkerUrl, "/ai/pptx-ooxml-sync"),
    {
      method: "POST",
      body: form,
      signal: AbortSignal.timeout(180_000),
    },
  );

  if (!response.ok) {
    throw new Error(
      (await response.text()) || "Python worker PPTX sync failed.",
    );
  }

  return pptxOoxmlSyncWorkerResponseSchema.parse(await response.json());
}

function isOoxmlSyncOperation(operation: DeckPatchOperation): boolean {
  return [
    "update_element_frame",
    "update_element_props",
    "add_element",
    "delete_element",
  ].includes(operation.type);
}

async function saveSyncAssets(
  dataSource: DataSource,
  storage: Pick<StoragePort, "putObject">,
  projectId: string,
  synced: PptxOoxmlSyncWorkerResponse,
): Promise<SavedSyncAssets> {
  const renderAssetFileIds: string[] = [];
  let currentPackageFileId = "";

  for (const asset of synced.assets) {
    const fileId = `file_${randomUUID()}`;
    const originalName = safeStorageName(asset.fileName);
    const storageKey = `projects/${projectId}/assets/${fileId}-${originalName}`;
    const body = Buffer.from(asset.contentBase64, "base64");
    const url = createAssetContentUrl(projectId, fileId);

    await storage.putObject({
      key: storageKey,
      body,
      contentType: asset.mimeType,
      purpose: "design-asset",
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
        url,
      ],
    );

    if (asset.assetId === "current_package") {
      currentPackageFileId = fileId;
    } else if (asset.assetId.startsWith("slide_render_")) {
      renderAssetFileIds.push(fileId);
    }
  }

  if (!currentPackageFileId) {
    throw new Error("PPTX OOXML sync did not return a current package asset.");
  }

  return { currentPackageFileId, renderAssetFileIds };
}

function withSyncResult(
  templateBlueprint: TemplateBlueprint,
  assets: SavedSyncAssets,
  syncedDeckVersion: number,
  synced: PptxOoxmlSyncWorkerResponse,
): TemplateBlueprint {
  return templateBlueprintSchema.parse({
    ...templateBlueprint,
    currentPackageFileId: assets.currentPackageFileId,
    ooxmlSyncedDeckVersion: syncedDeckVersion,
    slides: templateBlueprint.slides.map((slide, index) => ({
      ...slide,
      renderAssetFileId:
        assets.renderAssetFileIds[index] ?? slide.renderAssetFileId,
      elementSources: mergeElementSources(
        slide.elementSources,
        synced.elementSources.filter((source) =>
          source.slidePart.endsWith(`slide${slide.sourceSlideIndex}.xml`),
        ),
      ),
    })),
  });
}

function mergeElementSources(
  current: TemplateBlueprint["slides"][number]["elementSources"],
  incoming: PptxOoxmlSyncWorkerResponse["elementSources"],
) {
  const byElementId = new Map(
    current.map((source) => [source.elementId, source]),
  );
  for (const source of incoming) {
    byElementId.set(source.elementId, source);
  }
  return [...byElementId.values()];
}

async function updateTemplateBlueprint(
  dataSource: DataSource,
  projectId: string,
  deckId: string,
  templateBlueprint: TemplateBlueprint,
  qualityReport: unknown,
): Promise<void> {
  await dataSource.query(
    `
      UPDATE template_blueprints
      SET blueprint_json = $4,
          quality_report_json = $5,
          updated_at = now()
      WHERE project_id = $1 AND deck_id = $2 AND template_id = $3
    `,
    [
      projectId,
      deckId,
      templateBlueprint.templateId,
      templateBlueprint,
      qualityReport,
    ],
  );
}

function currentPackageFileId(templateBlueprint: TemplateBlueprint): string {
  const fileId =
    templateBlueprint.currentPackageFileId ??
    templateBlueprint.sourcePackageFileId;
  if (!fileId) {
    throw new Error("Template blueprint has no OOXML package file id.");
  }
  return fileId;
}

async function failJob(
  dataSource: DataSource,
  jobId: string,
  progress: number,
  code: string,
  message: string,
): Promise<Job> {
  return updateJob(dataSource, jobId, {
    status: "failed",
    progress,
    message: "PPTX OOXML sync failed.",
    result: null,
    error: { code, message },
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
  },
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
    [
      jobId,
      patch.status,
      patch.progress,
      patch.message,
      patch.result,
      patch.error,
    ],
  );

  const row = readFirstQueryRow<JobRow>(rows);
  if (!row) {
    throw new Error(`Job not found: ${jobId}`);
  }

  return rowToJob(row);
}

function readRawJobId(rawPayload: unknown): string {
  return isRecord(rawPayload) && typeof rawPayload.jobId === "string"
    ? rawPayload.jobId
    : "";
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
    updatedAt: toIso(row.updated_at),
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
    baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`,
  ).toString();
}

function createAssetContentUrl(projectId: string, fileId: string): string {
  return `/api/v1/projects/${encodeURIComponent(projectId)}/assets/${encodeURIComponent(
    fileId,
  )}/content`;
}

function safeStorageName(fileName: string): string {
  return (fileName || "design-asset").replace(/[^a-zA-Z0-9._-]/g, "_");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
