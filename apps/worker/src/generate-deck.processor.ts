import {
  deckSchema,
  generateDeckJobResultSchema,
  generateDeckRequestSchema,
  generateDeckResponseSchema,
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

const generateDeckPayloadSchema = z.object({
  jobId: z.string().min(1),
  projectId: z.string().min(1),
  request: generateDeckRequestSchema
});

const designImportResponseSchema = z.object({
  blueprint: z.record(z.unknown()).default({}),
  templateBlueprint: templateBlueprintSchema,
  qualityReport: qualityReportSchema,
  assets: z
    .array(
      z.object({
        assetId: z.string().min(1),
        fileName: z.string().min(1),
        mimeType: z.string().min(1),
        contentBase64: z.string().min(1)
      })
    )
    .default([]),
  warnings: z.array(z.string()).default([])
});

type DesignImportResponse = z.infer<typeof designImportResponseSchema>;
type GenerateDeckPayload = z.infer<typeof generateDeckPayloadSchema>;
type DesignTemplateContext = {
  designBlueprint?: Record<string, unknown>;
  qualityReport?: QualityReport;
  templateBlueprint?: TemplateBlueprint;
};

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
  project_id: string;
  deck_id: string;
  source_file_id: string;
  blueprint_json: unknown;
  quality_report_json: unknown;
  deck_json: unknown;
};

const pptxMimeType =
  "application/vnd.openxmlformats-officedocument.presentationml.presentation";
const legacyGenerateDeckTimeoutMs = 120_000;
const designPackGenerateDeckTimeoutMs = 300_000;

export async function processGenerateDeckJob(
  dataSource: DataSource,
  storage: Pick<StoragePort, "getSignedReadUrl" | "putObject">,
  pythonWorkerUrl: string,
  rawPayload: unknown
): Promise<Job> {
  const payloadResult = generateDeckPayloadSchema.safeParse(rawPayload);
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
      "GENERATE_DECK_PAYLOAD_INVALID",
      payloadResult.error.message
    );
  }

  const payload = payloadResult.data;
  await updateJob(dataSource, payload.jobId, {
    status: "running",
    progress: 15,
    message: "AI deck generation running.",
    result: null,
    error: null
  });

  let designTemplate: DesignTemplateContext = {};
  try {
    designTemplate = await resolveDesignTemplate(
      dataSource,
      storage,
      pythonWorkerUrl,
      payload
    );
  } catch (error) {
    return failJob(
      dataSource,
      payload.jobId,
      15,
      "GENERATE_DECK_DESIGN_REFERENCE_FAILED",
      error instanceof Error ? error.message : "Design reference import failed."
    );
  }

  let response: Response;
  try {
    response = await fetch(workerUrl(pythonWorkerUrl, "/ai/generate-deck"), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        projectId: payload.projectId,
        ...payload.request,
        ...(designTemplate.designBlueprint
          ? { designBlueprint: designTemplate.designBlueprint }
          : {}),
        ...(designTemplate.templateBlueprint
          ? { templateBlueprint: designTemplate.templateBlueprint }
          : {})
      }),
      signal: AbortSignal.timeout(
        payload.request.generationMode === "design-pack"
          ? designPackGenerateDeckTimeoutMs
          : legacyGenerateDeckTimeoutMs
      )
    });
  } catch (error) {
    return failJob(
      dataSource,
      payload.jobId,
      15,
      "PYTHON_WORKER_GENERATE_DECK_UNAVAILABLE",
      error instanceof Error ? error.message : "Python worker unavailable."
    );
  }

  if (!response.ok) {
    const message = (await response.text()) || "Python worker deck generation failed.";
    return failJob(
      dataSource,
      payload.jobId,
      15,
      "PYTHON_WORKER_GENERATE_DECK_FAILED",
      message
    );
  }

  try {
    const workerPayload = generateDeckResponseSchema.parse(await response.json());
    const blockingIssues = allValidationIssues(workerPayload.validation).filter(
      (issue) => issue.blocking
    );
    if (blockingIssues.length > 0) {
      return failJob(
        dataSource,
        payload.jobId,
        75,
        "GENERATE_DECK_VALIDATION_BLOCKING",
        `Deck generation retained ${blockingIssues.length} blocking validation issue(s).`,
        {
          warnings: workerPayload.warnings,
          validation: workerPayload.validation,
          diagnostics: workerPayload.diagnostics
        }
      );
    }
    const deck = markDeckForInitialThumbnailRefresh(workerPayload.deck);

    await saveDeck(dataSource, deck);
    const result = generateDeckJobResultSchema.parse({
      deckId: deck.deckId,
      ...workerPayload,
      deck,
      coachingProvenance: payload.request.coachingContext
    });

    return updateJob(dataSource, payload.jobId, {
      status: "succeeded",
      progress: 100,
      message: "AI deck generation completed.",
      result,
      error: null
    });
  } catch (error) {
    return failJob(
      dataSource,
      payload.jobId,
      75,
      "PYTHON_WORKER_GENERATE_DECK_INVALID_RESPONSE",
      error instanceof Error
        ? error.message
        : "Python worker returned invalid deck generation response."
    );
  }
}

function allValidationIssues(
  validation: ReturnType<typeof generateDeckResponseSchema.parse>["validation"]
) {
  return [
    ...validation.layoutIssues,
    ...validation.contentIssues,
    ...validation.designIssues,
    ...validation.presentationIssues
  ];
}

function markDeckForInitialThumbnailRefresh(deck: Deck): Deck {
  return {
    ...deck,
    metadata: {
      ...deck.metadata,
      thumbnailSource: "import-render"
    },
    slides: deck.slides.map((slide, index) => ({
      ...slide,
      thumbnailUrl: slide.thumbnailUrl.trim()
        ? slide.thumbnailUrl
        : `asset:generated_slide_render_${safeId(slide.slideId || String(index + 1))}`
    }))
  };
}

async function resolveDesignTemplate(
  dataSource: DataSource,
  storage: Pick<StoragePort, "getSignedReadUrl" | "putObject">,
  pythonWorkerUrl: string,
  payload: GenerateDeckPayload
): Promise<DesignTemplateContext> {
  if (payload.request.templateBlueprintId) {
    return loadTemplateBlueprintContext(
      dataSource,
      payload.projectId,
      payload.request.templateBlueprintId
    );
  }

  if (payload.request.designReferences.length === 0) {
    return {};
  }

  const assets = await loadDesignReferenceAssets(
    dataSource,
    payload.projectId,
    payload.request.designReferences.map((reference) => reference.fileId)
  );
  const form = new FormData();
  form.append("project_id", payload.projectId);

  for (const asset of assets) {
    const readUrl = await storage.getSignedReadUrl(asset.storage_key);
    const response = await fetch(readUrl);
    if (!response.ok) {
      throw new Error(`Design reference content unavailable: ${asset.file_id}`);
    }

    form.append("file_ids", asset.file_id);
    form.append(
      "files",
      new Blob([Buffer.from(await response.arrayBuffer())], {
        type: asset.mime_type
      }),
      asset.original_name
    );
  }

  const response = await fetch(workerUrl(pythonWorkerUrl, "/design/import-pptx"), {
    method: "POST",
    body: form,
    signal: AbortSignal.timeout(120_000)
  });

  if (!response.ok) {
    throw new Error((await response.text()) || "Design reference import failed.");
  }

  const imported = designImportResponseSchema.parse(await response.json());
  const assetUrlMap = await saveImportedDesignAssets(
    dataSource,
    storage,
    payload.projectId,
    imported
  );
  const designBlueprint = replaceImportedAssetRefs(imported.blueprint, assetUrlMap);
  await saveTemplateBlueprint(
    dataSource,
    payload.projectId,
    `deck_import_${safeId(imported.templateBlueprint.sourceFileId)}`,
    imported.templateBlueprint,
    imported.qualityReport
  );

  return {
    designBlueprint,
    qualityReport: imported.qualityReport,
    templateBlueprint: imported.templateBlueprint
  };
}

async function loadTemplateBlueprintContext(
  dataSource: DataSource,
  projectId: string,
  templateBlueprintId: string
): Promise<DesignTemplateContext> {
  const rows = readQueryRows<TemplateBlueprintRow>(
    await dataSource.query(
      `
        SELECT
          template_id,
          project_id,
          deck_id,
          source_file_id,
          blueprint_json,
          quality_report_json,
          (
            SELECT deck_json
            FROM decks
            WHERE project_id = template_blueprints.project_id
              AND deck_id = template_blueprints.deck_id
            LIMIT 1
          ) AS deck_json
        FROM template_blueprints
        WHERE template_id = $1
      `,
      [templateBlueprintId]
    )
  );
  const row = rows[0];
  if (!row) {
    throw new Error(`Template blueprint not found: ${templateBlueprintId}`);
  }
  if (row.project_id !== projectId) {
    throw new Error(`Template blueprint project mismatch: ${templateBlueprintId}`);
  }

  return {
    designBlueprint: designBlueprintFromDeck(row.deck_json, row.source_file_id),
    qualityReport: qualityReportSchema.parse(row.quality_report_json),
    templateBlueprint: templateBlueprintSchema.parse(row.blueprint_json)
  };
}

async function loadDesignReferenceAssets(
  dataSource: DataSource,
  projectId: string,
  fileIds: string[]
): Promise<ProjectAssetRow[]> {
  const rows = readQueryRows<ProjectAssetRow>(
    await dataSource.query(
      `
        SELECT file_id, project_id, storage_key, mime_type, original_name, size, purpose, status
        FROM project_assets
        WHERE file_id = ANY($1)
      `,
      [fileIds]
    )
  );
  const byFileId = new Map(rows.map((row) => [row.file_id, row]));

  return fileIds.map((fileId) => {
    const asset = byFileId.get(fileId);
    if (!asset) {
      throw new Error(`Design reference asset not found: ${fileId}`);
    }
    if (asset.project_id !== projectId) {
      throw new Error(`Design reference project mismatch: ${fileId}`);
    }
    if (asset.status !== "uploaded") {
      throw new Error(`Design reference asset is not uploaded: ${fileId}`);
    }
    if (asset.mime_type !== pptxMimeType) {
      throw new Error(`Design reference must be PPTX: ${fileId}`);
    }

    return asset;
  });
}

async function saveImportedDesignAssets(
  dataSource: DataSource,
  storage: Pick<StoragePort, "putObject">,
  projectId: string,
  imported: DesignImportResponse
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

function designBlueprintFromDeck(
  deckJson: unknown,
  sourceFileId: string
): Record<string, unknown> {
  const deck = deckSchema.parse(deckJson);
  return {
    sourceFileId,
    canvas: {
      width: deck.canvas.width,
      height: deck.canvas.height
    },
    theme: deck.theme,
    warnings: [],
    slides: deck.slides.map((slide) => ({
      sourceFileId,
      sourceSlideIndex: slide.order,
      style: slide.style,
      elements: slide.elements
    }))
  };
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

async function failJob(
  dataSource: DataSource,
  jobId: string,
  progress: number,
  code: string,
  message: string,
  result: Record<string, unknown> | null = null
): Promise<Job> {
  return updateJob(dataSource, jobId, {
    status: "failed",
    progress,
    message: "AI deck generation failed.",
    result,
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
