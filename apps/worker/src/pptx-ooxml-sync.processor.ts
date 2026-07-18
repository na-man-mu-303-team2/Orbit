import {
  deckCanvasSchema,
  deckPatchOperationSchema,
  deckPatchOperationTypeSchema,
  pptxOoxmlSyncJobResultSchema,
  templateElementSourceSchema,
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

const ooxmlSyncOperationTypeSchema = z.enum([
  "add_element",
  "update_element_frame",
  "update_element_props",
  "delete_element",
]);

const ooxmlUnsupportedReasonCodeSchema = z.enum([
  "ADD_ELEMENT_FAILED",
  "ADD_ELEMENT_TYPE_UNSUPPORTED",
  "CROP_CAPABILITY_UNSAFE",
  "RICH_TEXT_CAPABILITY_UNSAFE",
  "ELEMENT_TYPE_MISMATCH",
  "FRAME_FIELDS_UNSUPPORTED",
  "GROUPED_FRAME_UNSUPPORTED",
  "OPERATION_TYPE_UNSUPPORTED",
  "PROPS_FIELDS_UNSUPPORTED",
  "PROPS_UPDATE_FAILED",
  "SHAPE_MISSING",
  "SLIDE_PART_MISSING",
  "SOURCE_MISSING",
  "SOURCE_NOT_WRITABLE",
  "SOURCE_PROVENANCE_UNSAFE",
  "SYNC_RESPONSE_INCOMPLETE",
  "TABLE_CELL_CAPABILITY_UNSAFE",
  "TABLE_STRUCTURE_UNSUPPORTED",
]);

const ooxmlAppliedOperationSchema = z
  .object({
    operationType: ooxmlSyncOperationTypeSchema,
    slideId: z.string().min(1).optional(),
    elementId: z.string().min(1).optional(),
  })
  .strict();

const ooxmlUnsupportedOperationSchema = z
  .object({
    operationType: deckPatchOperationTypeSchema,
    slideId: z.string().min(1).optional(),
    elementId: z.string().min(1).optional(),
    reasonCode: ooxmlUnsupportedReasonCodeSchema,
  })
  .strict();

const pptxOoxmlSyncWorkerResponseSchema = z.object({
  assets: z.array(syncAssetSchema).default([]),
  elementSources: z.array(templateElementSourceSchema).max(500).default([]),
  appliedOperations: z.array(ooxmlAppliedOperationSchema).max(500).default([]),
  unsupportedOperations: z
    .array(ooxmlUnsupportedOperationSchema)
    .max(500)
    .default([]),
  warnings: z.array(z.string()).default([]),
});

type PptxOoxmlSyncWorkerResponse = z.infer<
  typeof pptxOoxmlSyncWorkerResponseSchema
>;
type OoxmlSyncOperation = Extract<
  DeckPatchOperation,
  {
    type:
      | "add_element"
      | "update_element_frame"
      | "update_element_props"
      | "delete_element";
  }
>;

type JobRow = {
  job_id: string;
  project_id: string;
  type: Job["type"];
  status: Job["status"];
  progress: number;
  message: string;
  result: Record<string, unknown> | null;
  error: { code: string; message: string; retryable?: boolean } | null;
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
  version: number;
};

type DeckPatchRow = {
  operations: DeckPatchOperation[];
};

type SavedSyncAssets = {
  currentPackageFileId: string;
  renderAssetFileIds: string[];
  renderAssetFileIdsByAssetId: Map<string, string>;
};

type QueryExecutor = Pick<DataSource, "query">;

type ImageAssetRow = {
  file_id: string;
  project_id: string;
  storage_key: string;
  mime_type: string;
  status: string;
};

const pptxMimeType =
  "application/vnd.openxmlformats-officedocument.presentationml.presentation";

class UnsupportedOoxmlOperationsError extends Error {
  constructor(
    readonly operation: z.infer<typeof ooxmlUnsupportedOperationSchema>,
  ) {
    const target = [operation.slideId, operation.elementId]
      .filter(Boolean)
      .join(":");
    super(
      `${operation.operationType}:${operation.reasonCode}${target ? `:${target}` : ""}`,
    );
    this.name = "UnsupportedOoxmlOperationsError";
  }
}

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
    return await dataSource.transaction(async (manager) => {
      await acquireDeckAdvisoryLock(manager, payload.projectId, payload.deckId);

      const templateRow = await loadTemplateBlueprintRow(
        manager,
        payload.projectId,
        payload.deckId,
      );
      const templateBlueprint = templateBlueprintSchema.parse(
        templateRow.blueprint_json,
      );
      const deck = await loadStoredDeck(
        manager,
        payload.projectId,
        payload.deckId,
      );
      const latestDeckVersion = deck.version;
      const syncedDeckVersion = templateBlueprint.ooxmlSyncedDeckVersion ?? 1;

      if (syncedDeckVersion >= latestDeckVersion) {
        await compactSyncedPatches(
          manager,
          payload.projectId,
          payload.deckId,
          latestDeckVersion,
        );
        return completeSyncJob(manager, payload, {
          templateId: templateBlueprint.templateId,
          currentPackageFileId: currentPackageFileId(templateBlueprint),
          renderAssetFileIds: templateBlueprint.slides.flatMap((slide) =>
            slide.renderAssetFileId ? [slide.renderAssetFileId] : [],
          ),
          syncedDeckVersion,
          warnings: [],
        });
      }

      const packageAsset = await loadPackageAsset(
        manager,
        payload.projectId,
        currentPackageFileId(templateBlueprint),
      );
      const operations = await loadUnsyncedPatchOperations(
        manager,
        payload.projectId,
        payload.deckId,
        syncedDeckVersion,
        latestDeckVersion,
      );
      const unsupportedPendingOperation = operations.find(
        (operation) =>
          !isOoxmlSyncOperation(operation) &&
          !isOoxmlPackageNeutralOperation(operation),
      );
      if (unsupportedPendingOperation) {
        throw new UnsupportedOoxmlOperationsError({
          ...operationIdentity(unsupportedPendingOperation),
          reasonCode: "OPERATION_TYPE_UNSUPPORTED",
        });
      }
      const embeddedOperations = await embedProjectImageAssets(
        manager,
        storage,
        payload.projectId,
        operations,
      );
      const synced = await syncPptxOoxmlWithPython(
        storage,
        pythonWorkerUrl,
        latestDeckVersion,
        packageAsset,
        templateBlueprint,
        deckCanvasSchema.parse((deck.deck_json as { canvas?: unknown }).canvas),
        embeddedOperations,
      );
      const savedAssets = await saveSyncAssets(
        manager,
        storage,
        payload.projectId,
        synced,
      );
      const nextTemplateBlueprint = withSyncResult(
        templateBlueprint,
        savedAssets,
        latestDeckVersion,
        synced,
      );
      const updated = await updateTemplateBlueprintConditionally(
        manager,
        payload.projectId,
        payload.deckId,
        nextTemplateBlueprint,
        latestDeckVersion,
      );
      if (!updated) {
        throw new Error(
          `A newer PPTX OOXML package already exists for deck: ${payload.deckId}`,
        );
      }
      await compactSyncedPatches(
        manager,
        payload.projectId,
        payload.deckId,
        latestDeckVersion,
      );

      return completeSyncJob(manager, payload, {
        templateId: nextTemplateBlueprint.templateId,
        currentPackageFileId: savedAssets.currentPackageFileId,
        renderAssetFileIds: savedAssets.renderAssetFileIds,
        syncedDeckVersion: latestDeckVersion,
        warnings: synced.warnings,
      });
    });
  } catch (error) {
    if (error instanceof UnsupportedOoxmlOperationsError) {
      return failJob(
        dataSource,
        payload.jobId,
        50,
        "PPTX_OOXML_SYNC_UNSUPPORTED_OPERATION",
        error.message,
        false,
      );
    }
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
  dataSource: QueryExecutor,
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
  dataSource: QueryExecutor,
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

async function loadStoredDeck(
  dataSource: QueryExecutor,
  projectId: string,
  deckId: string,
): Promise<DeckRow> {
  const rows = readQueryRows<DeckRow>(
    await dataSource.query(
      `
        SELECT deck_json, version
        FROM decks
        WHERE project_id = $1 AND deck_id = $2
      `,
      [projectId, deckId],
    ),
  );
  const deck = rows[0];
  if (deck && isRecord(deck.deck_json)) {
    deckCanvasSchema.parse(deck.deck_json.canvas);
    return deck;
  }
  throw new Error(`Deck not found for OOXML sync: ${deckId}`);
}

async function loadUnsyncedPatchOperations(
  dataSource: QueryExecutor,
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

async function acquireDeckAdvisoryLock(
  dataSource: QueryExecutor,
  projectId: string,
  deckId: string,
): Promise<void> {
  await dataSource.query(
    "SELECT pg_advisory_xact_lock(hashtextextended($1, 0))",
    [`${projectId}:${deckId}`],
  );
}

async function compactSyncedPatches(
  dataSource: QueryExecutor,
  projectId: string,
  deckId: string,
  syncedDeckVersion: number,
): Promise<void> {
  await dataSource.query(
    `
      DELETE FROM deck_patches
      WHERE project_id = $1 AND deck_id = $2 AND after_version <= $3
    `,
    [projectId, deckId, syncedDeckVersion],
  );
}

async function completeSyncJob(
  dataSource: QueryExecutor,
  payload: z.infer<typeof pptxOoxmlSyncPayloadSchema>,
  resultInput: {
    templateId: string;
    currentPackageFileId: string;
    renderAssetFileIds: string[];
    syncedDeckVersion: number;
    warnings: string[];
  },
): Promise<Job> {
  const result = pptxOoxmlSyncJobResultSchema.parse({
    deckId: payload.deckId,
    ...resultInput,
  });
  return updateJob(dataSource, payload.jobId, {
    status: "succeeded",
    progress: 100,
    message: "PPTX OOXML sync completed.",
    result,
    error: null,
  });
}

async function embedProjectImageAssets(
  dataSource: QueryExecutor,
  storage: Pick<StoragePort, "getSignedReadUrl">,
  projectId: string,
  operations: DeckPatchOperation[],
): Promise<DeckPatchOperation[]> {
  const references = operations.flatMap((operation) => {
    const src = operationImageSource(operation);
    const reference = src ? parseInternalAssetReference(src) : null;
    if (reference && reference.projectId !== projectId) {
      throw new Error(
        `OOXML image asset project mismatch: ${reference.fileId}`,
      );
    }
    return reference ? [reference] : [];
  });
  const fileIds = [...new Set(references.map((reference) => reference.fileId))];
  if (fileIds.length === 0) return operations;

  const rows = readQueryRows<ImageAssetRow>(
    await dataSource.query(
      `
        SELECT file_id, project_id, storage_key, mime_type, status
        FROM project_assets
        WHERE file_id = ANY($1)
      `,
      [fileIds],
    ),
  );
  const assets = new Map(rows.map((row) => [row.file_id, row]));
  const dataUrls = new Map<string, string>();

  for (const fileId of fileIds) {
    const asset = assets.get(fileId);
    if (!asset) throw new Error(`OOXML image asset not found: ${fileId}`);
    if (asset.project_id !== projectId) {
      throw new Error(`OOXML image asset project mismatch: ${fileId}`);
    }
    if (
      asset.status !== "uploaded" ||
      !isSupportedImageMimeType(asset.mime_type)
    ) {
      throw new Error(`OOXML image asset must be an uploaded image: ${fileId}`);
    }
    const response = await fetch(
      await storage.getSignedReadUrl(asset.storage_key),
    );
    if (!response.ok) {
      throw new Error(`OOXML image asset content unavailable: ${fileId}`);
    }
    const content = Buffer.from(await response.arrayBuffer()).toString(
      "base64",
    );
    dataUrls.set(fileId, `data:${asset.mime_type};base64,${content}`);
  }

  return operations.map((operation) => {
    const src = operationImageSource(operation);
    const reference = src ? parseInternalAssetReference(src) : null;
    const dataUrl = reference ? dataUrls.get(reference.fileId) : undefined;
    if (!dataUrl) return operation;
    if (operation.type === "update_element_props") {
      return deckPatchOperationSchema.parse({
        ...operation,
        props: { ...operation.props, src: dataUrl },
      });
    }
    if (
      operation.type === "add_element" &&
      operation.element.type === "image"
    ) {
      return deckPatchOperationSchema.parse({
        ...operation,
        element: {
          ...operation.element,
          props: { ...operation.element.props, src: dataUrl },
        },
      });
    }
    return operation;
  });
}

function operationImageSource(operation: DeckPatchOperation): string | null {
  if (
    operation.type === "update_element_props" &&
    typeof operation.props.src === "string"
  ) {
    return operation.props.src;
  }
  if (operation.type === "add_element" && operation.element.type === "image") {
    return operation.element.props.src;
  }
  return null;
}

function parseInternalAssetReference(src: string) {
  const match = src.match(
    /^\/api\/v1\/projects\/([^/]+)\/assets\/([^/]+)\/content$/,
  );
  if (!match) return null;
  return {
    projectId: decodeURIComponent(match[1]),
    fileId: decodeURIComponent(match[2]),
  };
}

function isSupportedImageMimeType(mimeType: string): boolean {
  return ["image/jpeg", "image/png", "image/webp"].includes(mimeType);
}

async function syncPptxOoxmlWithPython(
  storage: Pick<StoragePort, "getSignedReadUrl">,
  pythonWorkerUrl: string,
  targetDeckVersion: number,
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
  const ooxmlOperations = operations
    .filter(isOoxmlSyncOperation)
    .map((operation) => withSourceSlideId(operation, templateBlueprint));
  form.append("template_blueprint", JSON.stringify(templateBlueprint));
  form.append("operations", JSON.stringify(ooxmlOperations));
  form.append("deck_canvas", JSON.stringify(deckCanvas));
  form.append("synced_deck_version", String(targetDeckVersion));
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

  const synced = pptxOoxmlSyncWorkerResponseSchema.parse(
    await response.json(),
  );
  const unsupported = synced.unsupportedOperations[0];
  if (unsupported) {
    throw new UnsupportedOoxmlOperationsError(unsupported);
  }
  const incompleteOperation = findIncompleteAppliedOperation(
    ooxmlOperations,
    synced.appliedOperations,
  );
  if (incompleteOperation) {
    throw new UnsupportedOoxmlOperationsError(incompleteOperation);
  }
  return synced;
}

function findIncompleteAppliedOperation(
  operations: OoxmlSyncOperation[],
  appliedOperations: PptxOoxmlSyncWorkerResponse["appliedOperations"],
): z.infer<typeof ooxmlUnsupportedOperationSchema> | null {
  const comparisonLength = Math.max(
    operations.length,
    appliedOperations.length,
  );
  for (let index = 0; index < comparisonLength; index += 1) {
    const operation = operations[index];
    const applied = appliedOperations[index];
    if (operation && matchesAppliedOperation(operation, applied)) continue;

    const identity = operation ? operationIdentity(operation) : applied;
    if (identity) {
      return {
        operationType: identity.operationType,
        slideId: identity.slideId,
        elementId: identity.elementId,
        reasonCode: "SYNC_RESPONSE_INCOMPLETE",
      };
    }
  }
  return null;
}

function matchesAppliedOperation(
  operation: OoxmlSyncOperation,
  applied: z.infer<typeof ooxmlAppliedOperationSchema> | undefined,
): boolean {
  if (!applied) return false;
  const expected = operationIdentity(operation);
  return (
    applied.operationType === expected.operationType &&
    applied.slideId === expected.slideId &&
    applied.elementId === expected.elementId
  );
}

function isOoxmlSyncOperation(
  operation: DeckPatchOperation,
): operation is OoxmlSyncOperation {
  return [
    "update_element_frame",
    "update_element_props",
    "add_element",
    "delete_element",
  ].includes(operation.type);
}

function isOoxmlPackageNeutralOperation(
  operation: DeckPatchOperation,
): boolean {
  return [
    "update_deck",
    "update_slide",
    "update_speaker_notes",
    "replace_keywords",
    "replace_semantic_cues",
    "add_slide_action",
    "update_slide_action",
    "delete_slide_action",
  ].includes(operation.type);
}

function operationIdentity(operation: DeckPatchOperation) {
  return {
    operationType: operation.type,
    slideId:
      "slideId" in operation
        ? operation.slideId
        : operation.type === "add_slide"
          ? operation.slide.slideId
          : undefined,
    elementId:
      "elementId" in operation
        ? operation.elementId
        : operation.type === "add_element"
          ? operation.element.elementId
          : undefined,
  };
}

async function saveSyncAssets(
  dataSource: QueryExecutor,
  storage: Pick<StoragePort, "putObject">,
  projectId: string,
  synced: PptxOoxmlSyncWorkerResponse,
): Promise<SavedSyncAssets> {
  const renderAssetFileIds: string[] = [];
  const renderAssetFileIdsByAssetId = new Map<string, string>();
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
      renderAssetFileIdsByAssetId.set(asset.assetId, fileId);
    }
  }

  if (!currentPackageFileId) {
    throw new Error("PPTX OOXML sync did not return a current package asset.");
  }

  return {
    currentPackageFileId,
    renderAssetFileIds,
    renderAssetFileIdsByAssetId,
  };
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
        assets.renderAssetFileIdsByAssetId.get(
          `slide_render_${slide.sourceSlideIndex}`,
        ) ??
        assets.renderAssetFileIds[index] ??
        slide.renderAssetFileId,
      elementSources: mergeElementSources(
        slide.elementSources,
        synced.elementSources.filter((source) =>
          source.slidePart.endsWith(`slide${slide.sourceSlideIndex}.xml`),
        ),
      ),
    })),
  });
}

function withSourceSlideId(
  operation: OoxmlSyncOperation,
  templateBlueprint: TemplateBlueprint,
): OoxmlSyncOperation {
  if (!("slideId" in operation)) return operation;
  const generatedSlideIndex = slideIndexFromId(operation.slideId);
  const sourceSlideIndex = templateBlueprint.slides.find(
    (slide) => slide.slideIndex === generatedSlideIndex,
  )?.sourceSlideIndex;
  if (!sourceSlideIndex || sourceSlideIndex === generatedSlideIndex)
    return operation;
  return {
    ...operation,
    slideId: `slide_${sourceSlideIndex}`,
  } as OoxmlSyncOperation;
}

function slideIndexFromId(slideId: string): number {
  const suffix = slideId.split("_").at(-1);
  const index = Number.parseInt(suffix ?? "", 10);
  return Number.isFinite(index) && index > 0 ? index : 1;
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

async function updateTemplateBlueprintConditionally(
  dataSource: QueryExecutor,
  projectId: string,
  deckId: string,
  templateBlueprint: TemplateBlueprint,
  syncedDeckVersion: number,
): Promise<boolean> {
  const rows = readQueryRows<{ template_id: string }>(
    await dataSource.query(
      `
      UPDATE template_blueprints
      SET blueprint_json = $4,
          updated_at = now()
      WHERE project_id = $1 AND deck_id = $2 AND template_id = $3
        AND COALESCE((blueprint_json->>'ooxmlSyncedDeckVersion')::integer, 0) < $5
      RETURNING template_id
    `,
      [
        projectId,
        deckId,
        templateBlueprint.templateId,
        templateBlueprint,
        syncedDeckVersion,
      ],
    ),
  );
  return rows.length === 1;
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
  dataSource: QueryExecutor,
  jobId: string,
  progress: number,
  code: string,
  message: string,
  retryable?: boolean,
): Promise<Job> {
  return updateJob(dataSource, jobId, {
    status: "failed",
    progress,
    message: "PPTX OOXML sync failed.",
    result: null,
    error: {
      code,
      message,
      ...(retryable === undefined ? {} : { retryable }),
    },
  });
}

async function updateJob(
  dataSource: QueryExecutor,
  jobId: string,
  patch: {
    status: "running" | "succeeded" | "failed";
    progress: number;
    message: string;
    result: Record<string, unknown> | null;
    error: { code: string; message: string; retryable?: boolean } | null;
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
