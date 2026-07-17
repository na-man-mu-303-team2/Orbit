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
  type TemplateElementSource,
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
  "ELEMENT_TYPE_MISMATCH",
  "FRAME_FIELDS_UNSUPPORTED",
  "GROUPED_FRAME_UNSUPPORTED",
  "IMAGE_CONTAIN_SOURCE_UNAVAILABLE",
  "MOTION_REFERENCE_COVERAGE_UNSAFE",
  "OPERATION_TYPE_UNSUPPORTED",
  "PROPS_FIELDS_UNSUPPORTED",
  "PROPS_UPDATE_FAILED",
  "RICH_TEXT_CAPABILITY_UNSAFE",
  "SHAPE_MISSING",
  "SLIDE_PART_MISSING",
  "SOURCE_MISSING",
  "SOURCE_NOT_WRITABLE",
  "SOURCE_PROVENANCE_UNSAFE",
  "SHARED_SHAPE_COHORT_UNSAFE",
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
type ElementSourceIdentity = Pick<
  TemplateElementSource,
  "elementId" | "slidePart"
>;
type PptxOoxmlSyncResult = Pick<
  PptxOoxmlSyncWorkerResponse,
  "assets" | "elementSources" | "warnings"
> & {
  deletedElementSources: ElementSourceIdentity[];
};
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
const ooxmlSyncBatchSize = 500;

class UnsupportedOoxmlOperationsError extends Error {
  readonly operation: z.infer<typeof ooxmlUnsupportedOperationSchema>;

  constructor(operation: z.infer<typeof ooxmlUnsupportedOperationSchema>) {
    const target = [operation.slideId, operation.elementId]
      .filter(Boolean)
      .join(":");
    super(
      `${operation.operationType}:${operation.reasonCode}${target ? `:${target}` : ""}`,
    );
    this.name = "UnsupportedOoxmlOperationsError";
    this.operation = operation;
  }
}

class PythonWorkerHttpError extends Error {
  constructor(readonly status: number) {
    super(`Python worker request failed with status ${status}.`);
    this.name = "PythonWorkerHttpError";
  }
}

export async function processPptxOoxmlSyncJob(
  dataSource: DataSource,
  storage: Pick<StoragePort, "getSignedReadUrl" | "putObject" | "removeObject">,
  pythonWorkerUrl: string,
  rawPayload: unknown,
): Promise<Job> {
  const payloadResult = pptxOoxmlSyncPayloadSchema.safeParse(rawPayload);
  if (!payloadResult.success) {
    const jobId = readRawJobId(rawPayload);
    if (!jobId) {
      throw new Error("PPTX OOXML sync payload is invalid.");
    }
    return failJob(
      dataSource,
      jobId,
      0,
      "PPTX_OOXML_SYNC_PAYLOAD_INVALID",
      `PPTX_OOXML_SYNC_PAYLOAD_INVALID:jobId=${jobId}`,
    );
  }

  const payload = payloadResult.data;
  const newStorageObjectKeys: string[] = [];
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
        newStorageObjectKeys,
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
    await cleanupNewStorageObjects(storage, newStorageObjectKeys, payload);
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
      safeSyncFailureMessage(error, payload),
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
): Promise<PptxOoxmlSyncResult> {
  const readUrl = await storage.getSignedReadUrl(asset.storage_key);
  const sourceResponse = await fetch(readUrl);
  if (!sourceResponse.ok) {
    throw new Error(`PPTX package content unavailable: ${asset.file_id}`);
  }

  let packageBytes = Buffer.from(await sourceResponse.arrayBuffer());
  let nextTemplateBlueprint = templateBlueprint;
  let finalAssets: PptxOoxmlSyncWorkerResponse["assets"] = [];
  let elementSources: PptxOoxmlSyncWorkerResponse["elementSources"] = [];
  let deletedElementSources: ElementSourceIdentity[] = [];
  const warnings: string[] = [];
  const ooxmlOperations = operations
    .filter(isOoxmlSyncOperation)
    .map((operation) => withSourceSlideId(operation, templateBlueprint));
  const operationBatches = splitOoxmlOperationBatches(
    ooxmlOperations,
    templateBlueprint,
  );

  for (const [batchIndex, operationBatch] of operationBatches.entries()) {
    const synced = await syncPptxOoxmlBatchWithPython(
      pythonWorkerUrl,
      targetDeckVersion,
      asset,
      packageBytes,
      nextTemplateBlueprint,
      deckCanvas,
      operationBatch,
      batchIndex === operationBatches.length - 1,
    );
    const batchDeletedElementSources = deletedElementSourceIdentities(
      operationBatch,
      nextTemplateBlueprint,
    );
    packageBytes = currentPackageBytes(synced);
    elementSources = mergeResponseElementSources(
      withoutDeletedElementSources(elementSources, batchDeletedElementSources),
      synced.elementSources,
    );
    deletedElementSources = mergeElementSourceIdentities(
      deletedElementSources,
      batchDeletedElementSources,
    );
    nextTemplateBlueprint = withMergedElementSources(
      nextTemplateBlueprint,
      synced.elementSources,
      batchDeletedElementSources,
    );
    warnings.push(...synced.warnings);
    finalAssets = synced.assets;
  }

  return {
    assets: finalAssets,
    deletedElementSources,
    elementSources,
    warnings,
  };
}

async function syncPptxOoxmlBatchWithPython(
  pythonWorkerUrl: string,
  targetDeckVersion: number,
  asset: ProjectAssetRow,
  packageBytes: Buffer,
  templateBlueprint: TemplateBlueprint,
  deckCanvas: DeckCanvas,
  ooxmlOperations: OoxmlSyncOperation[],
  render: boolean,
): Promise<PptxOoxmlSyncWorkerResponse> {
  const form = new FormData();
  form.append("template_blueprint", JSON.stringify(templateBlueprint));
  form.append("operations", JSON.stringify(ooxmlOperations));
  form.append("deck_canvas", JSON.stringify(deckCanvas));
  form.append("synced_deck_version", String(targetDeckVersion));
  form.append("render", String(render));
  form.append(
    "file",
    new Blob([packageBytes], {
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
    throw new PythonWorkerHttpError(response.status);
  }

  const synced = pptxOoxmlSyncWorkerResponseSchema.parse(await response.json());
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

function splitOoxmlOperationBatches(
  operations: OoxmlSyncOperation[],
  templateBlueprint: TemplateBlueprint,
): OoxmlSyncOperation[][] {
  if (operations.length === 0) return [[]];
  const protectedIntervals = sharedShapeRoundIntervals(
    operations,
    templateBlueprint,
  );
  const atomicOperationGroups: OoxmlSyncOperation[][] = [];
  let operationIndex = 0;
  let intervalIndex = 0;

  while (operationIndex < operations.length) {
    const interval = protectedIntervals[intervalIndex];
    if (interval?.start === operationIndex) {
      atomicOperationGroups.push(
        operations.slice(interval.start, interval.end + 1),
      );
      operationIndex = interval.end + 1;
      intervalIndex += 1;
      continue;
    }
    atomicOperationGroups.push([operations[operationIndex]!]);
    operationIndex += 1;
  }

  const batches: OoxmlSyncOperation[][] = [];
  let currentBatch: OoxmlSyncOperation[] = [];
  for (const operationGroup of atomicOperationGroups) {
    if (operationGroup.length > ooxmlSyncBatchSize) {
      throw new Error(
        "PPTX OOXML shared-shape operation round exceeds the batch size.",
      );
    }
    if (currentBatch.length + operationGroup.length > ooxmlSyncBatchSize) {
      batches.push(currentBatch);
      currentBatch = [];
    }
    currentBatch.push(...operationGroup);
  }
  if (currentBatch.length > 0) batches.push(currentBatch);
  return batches;
}

function sharedShapeRoundIntervals(
  operations: OoxmlSyncOperation[],
  templateBlueprint: TemplateBlueprint,
) {
  const sourcesByShape = new Map<string, Map<string, TemplateElementSource>>();
  const sourcesByIdentity = new Map<string, TemplateElementSource>();
  for (const source of templateBlueprint.slides.flatMap(
    (slide) => slide.elementSources,
  )) {
    const shapeKey = elementSourceShapeKey(source);
    const members = sourcesByShape.get(shapeKey) ?? new Map();
    members.set(source.elementId, source);
    sourcesByShape.set(shapeKey, members);
    sourcesByIdentity.set(elementSourceIdentityKey(source), source);
  }
  const sharedShapeMemberCounts = new Map(
    [...sourcesByShape.entries()]
      .filter(([, sources]) => sources.size > 1)
      .map(([shapeKey, sources]) => [shapeKey, sources.size]),
  );
  const operationIndexesByShape = new Map<string, number[]>();

  operations.forEach((operation, index) => {
    if (
      operation.type !== "delete_element" &&
      operation.type !== "update_element_frame"
    ) {
      return;
    }
    const source = sourceForOperation(
      operation,
      templateBlueprint,
      sourcesByIdentity,
    );
    if (!source) return;
    const shapeKey = elementSourceShapeKey(source);
    if (!sharedShapeMemberCounts.has(shapeKey)) return;
    const indexes = operationIndexesByShape.get(shapeKey) ?? [];
    indexes.push(index);
    operationIndexesByShape.set(shapeKey, indexes);
  });

  const intervals: Array<{ start: number; end: number }> = [];
  for (const [shapeKey, operationIndexes] of operationIndexesByShape) {
    const memberCount = sharedShapeMemberCounts.get(shapeKey)!;
    for (
      let roundStart = 0;
      roundStart + memberCount <= operationIndexes.length;
      roundStart += memberCount
    ) {
      intervals.push({
        start: operationIndexes[roundStart]!,
        end: operationIndexes[roundStart + memberCount - 1]!,
      });
    }
  }

  intervals.sort(
    (left, right) => left.start - right.start || left.end - right.end,
  );
  const merged: Array<{ start: number; end: number }> = [];
  for (const interval of intervals) {
    const previous = merged.at(-1);
    if (previous && interval.start <= previous.end) {
      previous.end = Math.max(previous.end, interval.end);
    } else {
      merged.push({ ...interval });
    }
  }
  return merged;
}

function currentPackageBytes(synced: PptxOoxmlSyncWorkerResponse) {
  const currentPackage = synced.assets.find(
    (asset) => asset.assetId === "current_package",
  );
  if (!currentPackage) {
    throw new Error("PPTX OOXML sync did not return a current package asset.");
  }
  return Buffer.from(currentPackage.contentBase64, "base64");
}

function mergeResponseElementSources(
  current: PptxOoxmlSyncWorkerResponse["elementSources"],
  incoming: PptxOoxmlSyncWorkerResponse["elementSources"],
) {
  const bySourceIdentity = new Map(
    current.map((source) => [
      `${source.slidePart}\0${source.elementId}`,
      source,
    ]),
  );
  for (const source of incoming) {
    bySourceIdentity.set(`${source.slidePart}\0${source.elementId}`, source);
  }
  return [...bySourceIdentity.values()];
}

function withoutDeletedElementSources<TSource extends ElementSourceIdentity>(
  sources: TSource[],
  deletedElementSources: ElementSourceIdentity[],
): TSource[] {
  const deletedIdentityKeys = new Set(
    deletedElementSources.map(elementSourceIdentityKey),
  );
  return sources.filter(
    (source) => !deletedIdentityKeys.has(elementSourceIdentityKey(source)),
  );
}

function mergeElementSourceIdentities(
  current: ElementSourceIdentity[],
  incoming: ElementSourceIdentity[],
) {
  const byIdentity = new Map(
    current.map((source) => [elementSourceIdentityKey(source), source]),
  );
  for (const source of incoming) {
    byIdentity.set(elementSourceIdentityKey(source), source);
  }
  return [...byIdentity.values()];
}

function deletedElementSourceIdentities(
  operations: OoxmlSyncOperation[],
  templateBlueprint: TemplateBlueprint,
): ElementSourceIdentity[] {
  const sourcesByIdentity = new Map(
    templateBlueprint.slides
      .flatMap((slide) => slide.elementSources)
      .map((source) => [elementSourceIdentityKey(source), source]),
  );
  return operations.flatMap((operation) => {
    if (operation.type !== "delete_element") return [];
    const source = sourceForOperation(
      operation,
      templateBlueprint,
      sourcesByIdentity,
    );
    return source
      ? [{ elementId: source.elementId, slidePart: source.slidePart }]
      : [];
  });
}

function withMergedElementSources(
  templateBlueprint: TemplateBlueprint,
  incoming: PptxOoxmlSyncWorkerResponse["elementSources"],
  deletedElementSources: ElementSourceIdentity[],
): TemplateBlueprint {
  return templateBlueprintSchema.parse({
    ...templateBlueprint,
    slides: templateBlueprint.slides.map((slide) => ({
      ...slide,
      elementSources: mergeElementSources(
        withoutDeletedElementSources(
          slide.elementSources,
          deletedElementSources,
        ),
        incoming.filter((source) =>
          sourceBelongsToSlide(source.slidePart, slide),
        ),
      ),
    })),
  });
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
  synced: PptxOoxmlSyncResult,
  newStorageObjectKeys: string[],
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
    newStorageObjectKeys.push(storageKey);
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

async function cleanupNewStorageObjects(
  storage: Pick<StoragePort, "removeObject">,
  objectKeys: string[],
  payload: z.infer<typeof pptxOoxmlSyncPayloadSchema>,
): Promise<void> {
  if (objectKeys.length === 0) return;

  const cleanupResults = await Promise.allSettled(
    objectKeys.map((key) => storage.removeObject(key)),
  );
  const failedObjectCount = cleanupResults.filter(
    (result) => result.status === "rejected",
  ).length;
  if (failedObjectCount === 0) return;

  console.warn(
    {
      event: "pptx_ooxml.sync.storage_cleanup_failed",
      jobId: payload.jobId,
      projectId: payload.projectId,
      deckId: payload.deckId,
      failedObjectCount,
    },
    "PPTX OOXML sync storage cleanup failed.",
  );
}

function withSyncResult(
  templateBlueprint: TemplateBlueprint,
  assets: SavedSyncAssets,
  syncedDeckVersion: number,
  synced: PptxOoxmlSyncResult,
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
        withoutDeletedElementSources(
          slide.elementSources,
          synced.deletedElementSources,
        ),
        synced.elementSources.filter((source) =>
          sourceBelongsToSlide(source.slidePart, slide),
        ),
      ),
    })),
  });
}

function withSourceSlideId<TOperation extends DeckPatchOperation>(
  operation: TOperation,
  templateBlueprint: TemplateBlueprint,
): TOperation {
  if (!("slideId" in operation)) return operation;
  const generatedSlideIndex = slideIndexFromId(operation.slideId);
  const sourceSlide = templateBlueprint.slides.find(
    (slide) => slide.slideIndex === generatedSlideIndex,
  );
  if (!sourceSlide) return operation;
  const sourceSlideIndex = sourceSlide.sourceSlideIndex;
  const sourceSlidePart = resolveSourceSlidePart(sourceSlide);
  return {
    ...operation,
    ...(sourceSlideIndex === generatedSlideIndex
      ? {}
      : { slideId: `slide_${sourceSlideIndex}` }),
    ...(sourceSlidePart ? { sourceSlidePart } : {}),
  } as TOperation;
}

function sourceForOperation(
  operation: OoxmlSyncOperation,
  templateBlueprint: TemplateBlueprint,
  sourcesByIdentity: Map<string, TemplateElementSource>,
): TemplateElementSource | undefined {
  const elementId =
    operation.type === "add_element"
      ? operation.element.elementId
      : operation.elementId;
  const sourceSlidePart = operationSourceSlidePart(operation);
  if (sourceSlidePart) {
    const exactSource = sourcesByIdentity.get(
      elementSourceIdentityKey({ elementId, slidePart: sourceSlidePart }),
    );
    if (exactSource) return exactSource;
  }

  const candidates = templateBlueprint.slides.flatMap((slide) =>
    slide.elementSources.filter((source) => source.elementId === elementId),
  );
  return candidates.length === 1 ? candidates[0] : undefined;
}

function operationSourceSlidePart(
  operation: OoxmlSyncOperation,
): string | undefined {
  const sourceSlidePart = (
    operation as OoxmlSyncOperation & { sourceSlidePart?: unknown }
  ).sourceSlidePart;
  return typeof sourceSlidePart === "string" && sourceSlidePart.length > 0
    ? sourceSlidePart
    : undefined;
}

function elementSourceIdentityKey(source: ElementSourceIdentity) {
  return `${source.slidePart}\0${source.elementId}`;
}

function elementSourceShapeKey(
  source: Pick<TemplateElementSource, "shapeId" | "slidePart">,
) {
  return `${source.slidePart}\0${source.shapeId}`;
}

function sourceBelongsToSlide(
  sourceSlidePart: string,
  slide: TemplateBlueprint["slides"][number],
): boolean {
  const resolvedSlidePart = resolveSourceSlidePart(slide);
  return resolvedSlidePart ? sourceSlidePart === resolvedSlidePart : false;
}

function resolveSourceSlidePart(
  slide: TemplateBlueprint["slides"][number],
): string | undefined {
  if (slide.sourceSlidePart) return slide.sourceSlidePart;
  const writableParts = [
    ...new Set(
      slide.elementSources
        .filter((source) => source.writable)
        .map((source) => source.slidePart),
    ),
  ];
  return writableParts.length === 1 ? writableParts[0] : undefined;
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

function safeSyncFailureMessage(
  error: unknown,
  payload: z.infer<typeof pptxOoxmlSyncPayloadSchema>,
): string {
  const status =
    error instanceof PythonWorkerHttpError ? `:status=${error.status}` : "";
  return `PPTX_OOXML_SYNC_FAILED${status}:projectId=${payload.projectId}:deckId=${payload.deckId}`;
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
