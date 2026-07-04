import {
  aiTemplateDeckGenerationJobResultSchema,
  aiTemplateDeckGenerationRequestSchema,
  deckSchema,
  generateDeckResponseSchema,
  qualityReportSchema,
  templateBlueprintSchema,
  type Deck,
  type Job,
  type QualityReport,
  type TemplateBlueprint,
} from "@orbit/shared";
import type { StoragePort } from "@orbit/storage";
import { randomUUID } from "crypto";
import type { DataSource } from "typeorm";
import { z } from "zod";

const aiTemplateDeckGenerationPayloadSchema = z.object({
  jobId: z.string().min(1),
  projectId: z.string().min(1),
  request: aiTemplateDeckGenerationRequestSchema,
});

const generatedDesignAssetSchema = z.object({
  assetId: z.string().min(1),
  fileName: z.string().min(1),
  mimeType: z.string().min(1),
  contentBase64: z.string().min(1),
});

const ooxmlGenerationWorkerResponseSchema = z.object({
  canvas: z.record(z.unknown()),
  blueprint: z.record(z.unknown()).default({}),
  templateBlueprint: templateBlueprintSchema.passthrough(),
  qualityReport: qualityReportSchema,
  assets: z.array(generatedDesignAssetSchema).default([]),
  warnings: z.array(z.string()).default([]),
});

const ooxmlApplySlotTextsResponseSchema = z.object({
  assets: z.array(generatedDesignAssetSchema).default([]),
  warnings: z.array(z.string()).default([]),
});

const extractedFileSchema = z
  .object({
    referenceDocumentId: z.string().optional(),
    fileName: z.string().default(""),
    status: z.string().default("failed"),
    keywords: z
      .array(
        z
          .object({
            keyword: z.string().optional(),
          })
          .passthrough(),
      )
      .optional(),
  })
  .passthrough();

const referenceExtractWorkerResponseSchema = z.object({
  files: z.array(extractedFileSchema),
});

type AiTemplateDeckGenerationPayload = z.infer<
  typeof aiTemplateDeckGenerationPayloadSchema
>;
type AiTemplateDeckGenerationRequest = AiTemplateDeckGenerationPayload["request"];
type OoxmlGenerationWorkerResponse = z.infer<
  typeof ooxmlGenerationWorkerResponseSchema
>;
type OoxmlApplySlotTextsResponse = z.infer<
  typeof ooxmlApplySlotTextsResponseSchema
>;
type ExtractedFile = z.infer<typeof extractedFileSchema>;

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

type SavedAssetRefs = {
  fileIds: Map<string, string>;
  urls: Map<string, string>;
};

type ContentPreparation = {
  references: Array<{ fileId: string }>;
  referenceKeywords: Array<{ text: string }>;
  files: ExtractedFile[];
};

type DesignPreparation = {
  asset: ProjectAssetRow;
  designBlueprint: Record<string, unknown>;
  templateBlueprint: TemplateBlueprint;
  qualityReport: QualityReport;
  warnings: string[];
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

const pptxMimeType =
  "application/vnd.openxmlformats-officedocument.presentationml.presentation";

export async function processAiTemplateDeckGenerationJob(
  dataSource: DataSource,
  storage: Pick<StoragePort, "getSignedReadUrl" | "putObject">,
  pythonWorkerUrl: string,
  rawPayload: unknown,
): Promise<Job> {
  const payloadResult =
    aiTemplateDeckGenerationPayloadSchema.safeParse(rawPayload);
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
      "AI_TEMPLATE_DECK_GENERATION_PAYLOAD_INVALID",
      payloadResult.error.message,
    );
  }

  const payload = payloadResult.data;
  await updateJob(dataSource, payload.jobId, {
    status: "running",
    progress: 8,
    message: "AI template deck generation running.",
    result: null,
    error: null,
  });

  let content: ContentPreparation;
  let design: DesignPreparation;
  try {
    const assets = await loadProjectAssets(
      dataSource,
      payload.projectId,
      payload.request.assets.map((asset) => asset.fileId),
    );
    const designAsset = selectDesignAsset(payload.request, assets);
    const contentAssets = selectContentAssets(payload.request, assets);

    [content, design] = await Promise.all([
      prepareContentReferences(
        storage,
        pythonWorkerUrl,
        payload.projectId,
        contentAssets,
      ),
      prepareDesignTemplate(
        dataSource,
        storage,
        pythonWorkerUrl,
        payload.projectId,
        designAsset,
      ),
    ]);
  } catch (error) {
    return failJob(
      dataSource,
      payload.jobId,
      18,
      "AI_TEMPLATE_DECK_GENERATION_PREPARE_FAILED",
      error instanceof Error
        ? error.message
        : "AI template deck generation preparation failed.",
    );
  }

  await updateJob(dataSource, payload.jobId, {
    status: "running",
    progress: 55,
    message: "AI deck content generation running.",
    result: null,
    error: null,
  });

  let generatedDeck: z.infer<typeof generateDeckResponseSchema>;
  try {
    generatedDeck = await generateDeckWithPython(
      pythonWorkerUrl,
      payload.projectId,
      payload.request,
      content,
      design,
    );
  } catch (error) {
    return failJob(
      dataSource,
      payload.jobId,
      55,
      "AI_TEMPLATE_DECK_GENERATION_CONTENT_FAILED",
      error instanceof Error ? error.message : "AI deck content generation failed.",
    );
  }

  if (!generatedDeck.validation.passed) {
    return failJob(
      dataSource,
      payload.jobId,
      70,
      "AI_TEMPLATE_DECK_GENERATION_VALIDATION_FAILED",
      "Generated deck did not pass validation.",
      { validation: generatedDeck.validation },
    );
  }

  try {
    const applyResult = await applyGeneratedContentToPptx(
      storage,
      pythonWorkerUrl,
      design.asset,
      design.templateBlueprint,
      generatedDeck.deck,
    );
    const finalAssetRefs = await saveGeneratedAssets(
      dataSource,
      storage,
      payload.projectId,
      applyResult,
    );
    const finalTemplateBlueprint = templateBlueprintSchema.parse(
      applyFinalTemplateAssetRefs(design.templateBlueprint, finalAssetRefs.fileIds),
    );
    const finalDeck = applyFinalRenderAssetsToDeck(
      generatedDeck.deck,
      finalTemplateBlueprint,
      finalAssetRefs.urls,
    );

    await saveDeck(dataSource, finalDeck);
    await saveTemplateBlueprint(
      dataSource,
      payload.projectId,
      finalDeck.deckId,
      finalTemplateBlueprint,
      design.qualityReport,
    );

    const result = aiTemplateDeckGenerationJobResultSchema.parse({
      deckId: finalDeck.deckId,
      templateId: finalTemplateBlueprint.templateId,
      sourceFileId: design.asset.file_id,
      currentPackageFileId: finalTemplateBlueprint.currentPackageFileId,
      contentReferenceFileIds: content.references.map(
        (reference) => reference.fileId,
      ),
      qualityReport: design.qualityReport,
      warnings: uniqueWarnings([
        ...design.warnings,
        ...generatedDeck.warnings,
        ...applyResult.warnings,
      ]),
    });

    return updateJob(dataSource, payload.jobId, {
      status: "succeeded",
      progress: 100,
      message: "AI template deck generation completed.",
      result,
      error: null,
    });
  } catch (error) {
    return failJob(
      dataSource,
      payload.jobId,
      82,
      "AI_TEMPLATE_DECK_GENERATION_SAVE_FAILED",
      error instanceof Error
        ? error.message
        : "AI template deck generation save failed.",
    );
  }
}

async function loadProjectAssets(
  dataSource: DataSource,
  projectId: string,
  fileIds: string[],
): Promise<Map<string, ProjectAssetRow>> {
  const rows = readQueryRows<ProjectAssetRow>(
    await dataSource.query(
      `
        SELECT file_id, project_id, storage_key, mime_type, original_name, size, purpose, status
        FROM project_assets
        WHERE file_id = ANY($1)
      `,
      [fileIds],
    ),
  );
  const byFileId = new Map(rows.map((row) => [row.file_id, row]));

  for (const fileId of fileIds) {
    const asset = byFileId.get(fileId);
    if (!asset) {
      throw new Error(`Project asset not found: ${fileId}`);
    }
    if (asset.project_id !== projectId) {
      throw new Error(`Project asset mismatch: ${fileId}`);
    }
    if (asset.status !== "uploaded") {
      throw new Error(`Project asset is not uploaded: ${fileId}`);
    }
  }

  return byFileId;
}

function selectDesignAsset(
  request: AiTemplateDeckGenerationRequest,
  assets: Map<string, ProjectAssetRow>,
): ProjectAssetRow {
  const designAssets = request.assets.filter(
    (asset) => asset.role === "design" || asset.role === "both",
  );
  if (designAssets.length !== 1) {
    throw new Error("Exactly one design PPTX asset is required.");
  }

  const asset = assets.get(designAssets[0].fileId);
  if (!asset) {
    throw new Error(`Design asset not found: ${designAssets[0].fileId}`);
  }
  if (asset.mime_type !== pptxMimeType) {
    throw new Error(`Design asset must be PPTX: ${asset.file_id}`);
  }
  if (asset.purpose !== "pptx-import") {
    throw new Error(`Design asset purpose must be pptx-import: ${asset.file_id}`);
  }

  return asset;
}

function selectContentAssets(
  request: AiTemplateDeckGenerationRequest,
  assets: Map<string, ProjectAssetRow>,
): ProjectAssetRow[] {
  return request.assets
    .filter((asset) => asset.role === "content" || asset.role === "both")
    .map((asset) => {
      const row = assets.get(asset.fileId);
      if (!row) {
        throw new Error(`Content asset not found: ${asset.fileId}`);
      }
      return row;
    });
}

async function prepareContentReferences(
  storage: Pick<StoragePort, "getSignedReadUrl">,
  pythonWorkerUrl: string,
  projectId: string,
  assets: ProjectAssetRow[],
): Promise<ContentPreparation> {
  if (assets.length === 0) {
    return { references: [], referenceKeywords: [], files: [] };
  }

  const form = new FormData();
  form.append("project_id", projectId);
  for (const asset of assets) {
    const content = await readAssetContent(storage, asset);
    form.append("file_ids", asset.file_id);
    form.append(
      "files",
      new Blob([content], { type: asset.mime_type }),
      asset.original_name,
    );
  }

  const response = await fetch(workerUrl(pythonWorkerUrl, "/documents/parse"), {
    method: "POST",
    body: form,
    signal: AbortSignal.timeout(180_000),
  });

  if (!response.ok) {
    throw new Error((await response.text()) || "Content reference extraction failed.");
  }

  const extracted = referenceExtractWorkerResponseSchema.parse(await response.json());
  return buildReferenceInput(extracted.files);
}

function buildReferenceInput(files: ExtractedFile[]): ContentPreparation {
  const references: Array<{ fileId: string }> = [];
  const referenceKeywords: Array<{ text: string }> = [];
  const seenFileIds = new Set<string>();
  const seenKeywords = new Set<string>();

  for (const file of files) {
    const fileId = file.referenceDocumentId?.trim() ?? "";
    if (file.status.toLowerCase() !== "succeeded" || !fileId) {
      continue;
    }
    if (!seenFileIds.has(fileId)) {
      seenFileIds.add(fileId);
      references.push({ fileId });
    }

    for (const keyword of file.keywords ?? []) {
      const text = keyword.keyword?.trim() ?? "";
      const key = text.toLocaleLowerCase("ko-KR");
      if (!text || seenKeywords.has(key)) continue;
      seenKeywords.add(key);
      referenceKeywords.push({ text });
    }
  }

  return { references, referenceKeywords, files };
}

async function prepareDesignTemplate(
  dataSource: DataSource,
  storage: Pick<StoragePort, "getSignedReadUrl" | "putObject">,
  pythonWorkerUrl: string,
  projectId: string,
  asset: ProjectAssetRow,
): Promise<DesignPreparation> {
  const generated = await generatePptxOoxmlWithPython(
    storage,
    pythonWorkerUrl,
    projectId,
    asset,
  );
  const assetRefs = await saveGeneratedAssets(
    dataSource,
    storage,
    projectId,
    generated,
  );
  const templateBlueprint = promoteAiTemplateContentSlots(
    templateBlueprintSchema.parse(
      replaceAssetRefs(generated.templateBlueprint, assetRefs.fileIds),
    ),
  );
  const designBlueprint = replaceAssetRefs(
    generated.blueprint,
    assetRefs.urls,
  );

  return {
    asset,
    designBlueprint: isRecord(designBlueprint) ? designBlueprint : {},
    templateBlueprint,
    qualityReport: generated.qualityReport,
    warnings: generated.warnings,
  };
}

function promoteAiTemplateContentSlots(
  templateBlueprint: TemplateBlueprint,
): TemplateBlueprint {
  return templateBlueprintSchema.parse({
    ...templateBlueprint,
    slides: templateBlueprint.slides.map((slide) => {
      const hasContentSlots = slide.slots.some(
        (slot) => slot.usage === "content-slot" && slot.replaceMode === "replace",
      );
      if (hasContentSlots) return slide;

      return {
        ...slide,
        slots: slide.slots.map((slot) =>
          isPromotableAiTextSlot(slot)
            ? {
                ...slot,
                usage: "content-slot",
                replaceMode: "replace",
                confidence: Math.max(slot.confidence, 0.65),
              }
            : slot,
        ),
      };
    }),
  });
}

function isPromotableAiTextSlot(
  slot: TemplateBlueprint["slides"][number]["slots"][number],
): boolean {
  const source = slot.source as Record<string, unknown>;
  const writable = source.writable;
  return (
    slot.usage === "fixed-text" &&
    slot.replaceMode === "preserve" &&
    ["title", "subtitle", "body", "caption"].includes(slot.slotRole) &&
    slot.source.type === "slide" &&
    typeof slot.source.shapeId === "string" &&
    slot.source.shapeId.trim() !== "" &&
    (writable === true || writable === undefined)
  );
}

async function generatePptxOoxmlWithPython(
  storage: Pick<StoragePort, "getSignedReadUrl">,
  pythonWorkerUrl: string,
  projectId: string,
  asset: ProjectAssetRow,
): Promise<OoxmlGenerationWorkerResponse> {
  const content = await readAssetContent(storage, asset);
  const form = new FormData();
  form.append("project_id", projectId);
  form.append("file_id", asset.file_id);
  form.append(
    "file",
    new Blob([content], { type: asset.mime_type }),
    asset.original_name,
  );

  const response = await fetch(
    workerUrl(pythonWorkerUrl, "/ai/pptx-ooxml-generation"),
    {
      method: "POST",
      body: form,
      signal: AbortSignal.timeout(180_000),
    },
  );

  if (!response.ok) {
    throw new Error((await response.text()) || "PPTX OOXML generation failed.");
  }

  return ooxmlGenerationWorkerResponseSchema.parse(await response.json());
}

async function generateDeckWithPython(
  pythonWorkerUrl: string,
  projectId: string,
  request: AiTemplateDeckGenerationRequest,
  content: ContentPreparation,
  design: DesignPreparation,
) {
  const templateSlideCount = Math.max(
    1,
    Math.min(20, design.templateBlueprint.slides.length),
  );
  const response = await fetch(workerUrl(pythonWorkerUrl, "/ai/generate-deck"), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      projectId,
      topic: request.topic,
      prompt: request.prompt ?? "",
      designPrompt: request.designPrompt ?? "",
      targetDurationMinutes: request.targetDurationMinutes,
      slideCountRange: { min: templateSlideCount, max: templateSlideCount },
      template: request.template,
      metadata: request.metadata,
      design: request.design,
      references: content.references,
      designReferences: [{ fileId: design.asset.file_id }],
      referenceKeywords: content.referenceKeywords,
      designBlueprint: design.designBlueprint,
      templateBlueprint: design.templateBlueprint,
    }),
    signal: AbortSignal.timeout(180_000),
  });

  if (!response.ok) {
    throw new Error((await response.text()) || "AI deck generation failed.");
  }

  return generateDeckResponseSchema.parse(await response.json());
}

async function applyGeneratedContentToPptx(
  storage: Pick<StoragePort, "getSignedReadUrl">,
  pythonWorkerUrl: string,
  asset: ProjectAssetRow,
  templateBlueprint: TemplateBlueprint,
  deck: Deck,
): Promise<OoxmlApplySlotTextsResponse> {
  const content = await readAssetContent(storage, asset);
  const form = new FormData();
  form.append("template_blueprint", JSON.stringify(templateBlueprint));
  form.append("slot_texts", JSON.stringify(slotTextsFromDeck(deck, templateBlueprint)));
  form.append("render", "true");
  form.append(
    "file",
    new Blob([content], { type: asset.mime_type }),
    asset.original_name,
  );

  const response = await fetch(
    workerUrl(pythonWorkerUrl, "/ai/pptx-ooxml-apply-slot-texts"),
    {
      method: "POST",
      body: form,
      signal: AbortSignal.timeout(180_000),
    },
  );

  if (!response.ok) {
    throw new Error((await response.text()) || "PPTX content application failed.");
  }

  return ooxmlApplySlotTextsResponseSchema.parse(await response.json());
}

function slotTextsFromDeck(deck: Deck, templateBlueprint: TemplateBlueprint): string[] {
  const slidesByOrder = new Map(deck.slides.map((slide) => [slide.order, slide]));
  const texts: string[] = [];

  for (const [index, templateSlide] of templateBlueprint.slides.entries()) {
    const slide = slidesByOrder.get(index + 1) ?? deck.slides[index] ?? deck.slides[0];
    if (!slide) continue;

    let bodyUsed = false;
    let keywordIndex = 0;
    for (const slot of templateSlide.slots) {
      if (slot.usage !== "content-slot" || slot.replaceMode !== "replace") {
        continue;
      }

      if (slot.slotRole === "title") {
        texts.push(slide.title);
        continue;
      }

      if (!bodyUsed) {
        texts.push(primarySlideBodyText(slide));
        bodyUsed = true;
        continue;
      }

      texts.push(slide.keywords[keywordIndex]?.text ?? "");
      keywordIndex += 1;
    }
  }

  return texts;
}

function primarySlideBodyText(slide: Deck["slides"][number]): string {
  const emphasis = slide.aiNotes?.emphasisPoints?.[0]?.trim();
  if (emphasis) return emphasis;

  const bodyElement = slide.elements.find(
    (element) => {
      const role = element.role;
      return (
        element.type === "text" &&
        typeof role === "string" &&
        ["body", "subtitle", "caption"].includes(role)
      );
    },
  );
  if (bodyElement?.type === "text" && bodyElement.props.text.trim()) {
    return bodyElement.props.text.trim();
  }

  return slide.speakerNotes.trim() || slide.title;
}

async function saveGeneratedAssets(
  dataSource: DataSource,
  storage: Pick<StoragePort, "putObject">,
  projectId: string,
  generated: { assets: Array<z.infer<typeof generatedDesignAssetSchema>> },
): Promise<SavedAssetRefs> {
  const refs: SavedAssetRefs = {
    fileIds: new Map(),
    urls: new Map(),
  };

  for (const asset of generated.assets) {
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

    refs.fileIds.set(`asset:${asset.assetId}`, fileId);
    refs.urls.set(`asset:${asset.assetId}`, url);
  }

  return refs;
}

function applyFinalTemplateAssetRefs(
  templateBlueprint: TemplateBlueprint,
  finalAssetFileIds: Map<string, string>,
): TemplateBlueprint {
  return templateBlueprintSchema.parse({
    ...templateBlueprint,
    currentPackageFileId:
      finalAssetFileIds.get("asset:current_package") ??
      templateBlueprint.currentPackageFileId,
    slides: templateBlueprint.slides.map((slide) => ({
      ...slide,
      renderAssetFileId:
        finalAssetFileIds.get(`asset:slide_render_${slide.sourceSlideIndex}`) ??
        slide.renderAssetFileId,
    })),
  });
}

function applyFinalRenderAssetsToDeck(
  deck: Deck,
  templateBlueprint: TemplateBlueprint,
  finalAssetUrls: Map<string, string>,
): Deck {
  return deckSchema.parse({
    ...deck,
    slides: deck.slides.map((slide, index) => {
      const templateSlide =
        templateBlueprint.slides[index] ?? templateBlueprint.slides[0];
      const renderUrl = templateSlide
        ? finalAssetUrls.get(`asset:slide_render_${templateSlide.sourceSlideIndex}`)
        : undefined;
      return {
        ...slide,
        thumbnailUrl: renderUrl ?? slide.thumbnailUrl,
        style:
          renderUrl && slide.style.backgroundImage?.fit === "stretch"
            ? {
                ...slide.style,
                backgroundImage: {
                  ...slide.style.backgroundImage,
                  src: renderUrl,
                },
              }
            : slide.style,
      };
    }),
  });
}

async function readAssetContent(
  storage: Pick<StoragePort, "getSignedReadUrl">,
  asset: ProjectAssetRow,
): Promise<Buffer> {
  const readUrl = await storage.getSignedReadUrl(asset.storage_key);
  const response = await fetch(readUrl);
  if (!response.ok) {
    throw new Error(`Asset content unavailable: ${asset.file_id}`);
  }

  return Buffer.from(await response.arrayBuffer());
}

async function saveDeck(dataSource: DataSource, deck: Deck): Promise<void> {
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
    [deck.projectId, deck.deckId, deck, deck.version],
  );
}

async function saveTemplateBlueprint(
  dataSource: DataSource,
  projectId: string,
  deckId: string,
  templateBlueprint: TemplateBlueprint,
  qualityReport: QualityReport,
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
      qualityReport,
    ],
  );
}

function replaceAssetRefs(value: unknown, refs: Map<string, string>): unknown {
  if (typeof value === "string") {
    return refs.get(value) ?? value;
  }

  if (Array.isArray(value)) {
    return value.map((item) => replaceAssetRefs(item, refs));
  }

  if (isRecord(value)) {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [
        key,
        replaceAssetRefs(item, refs),
      ]),
    );
  }

  return value;
}

async function failJob(
  dataSource: DataSource,
  jobId: string,
  progress: number,
  code: string,
  message: string,
  result: Record<string, unknown> | null = null,
): Promise<Job> {
  return updateJob(dataSource, jobId, {
    status: "failed",
    progress,
    message: "AI template deck generation failed.",
    result,
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

function uniqueWarnings(warnings: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const warning of warnings) {
    if (!warning.trim() || seen.has(warning)) continue;
    seen.add(warning);
    result.push(warning);
  }
  return result;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
