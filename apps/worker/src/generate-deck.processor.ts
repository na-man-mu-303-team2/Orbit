import {
  deckSchema,
  generateDeckValidationSchema,
  generateDeckVisualIssueCodeSchema,
  generateDeckVisualRepairActionSchema,
  generateDeckVisualRepairActionTypeSchema,
  generateDeckJobResultSchema,
  generateDeckRequestSchema,
  generateDeckResponseSchema,
  qualityReportSchema,
  templateBlueprintSchema,
  type Deck,
  type GenerateDeckDiagnostics,
  type GenerateDeckValidation,
  type GenerateDeckVisualRepairAction,
  type Job,
  type QualityReport,
  savedDesignPackSnapshotSchema,
  type SavedDesignPackSnapshot,
  brandKitSnapshotSchema,
  type BrandKitSnapshot,
  getSemanticQaIssues,
  repairSemanticQaOnce,
  type TemplateBlueprint
} from "@orbit/shared";
import type { StoragePort } from "@orbit/storage";
import { randomUUID } from "crypto";
import type { DataSource } from "typeorm";
import { z } from "zod";
import {
  applyBrandKitLogoAsset,
  resolveDeckImageAssets,
  type ImageAssetRuntime
} from "./image-asset-pipeline";
import { embedDeckImageAssets } from "./deck-export.processor";

const generateDeckPayloadSchema = z.object({
  jobId: z.string().min(1),
  projectId: z.string().min(1),
  request: generateDeckRequestSchema,
  designPackSnapshot: savedDesignPackSnapshotSchema.optional(),
  brandKitSnapshot: brandKitSnapshotSchema.optional(),
  imageAssetScope: z
    .object({
      userId: z.string().min(1),
      organizationId: z.string().min(1).optional()
    })
    .optional()
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

const pythonVisualRepairActionSchema = z.object({
  action: generateDeckVisualRepairActionTypeSchema,
  slideId: z.string().min(1),
  targetElementId: z.string().min(1).nullish(),
  compositionId: z.string().min(1).nullish(),
  backgroundMode: z.enum(["light", "dark", "image"]).nullish(),
  reason: z.string().min(1)
});

const visualQaIssueSchema = z.object({
  code: generateDeckVisualIssueCodeSchema,
  slideOrder: z.number().int().positive(),
  message: z.string().min(1)
});

const visualQaReviewSchema = z
  .object({
    passed: z.boolean(),
    issues: z.array(visualQaIssueSchema).default([]),
    repairActions: z.array(pythonVisualRepairActionSchema).default([])
  })
  .superRefine((review, context) => {
    if (review.passed && review.issues.length > 0) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["passed"],
        message: "passed visual review cannot contain issues"
      });
    }
    if (!review.passed && review.issues.length === 0) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["issues"],
        message: "failed visual review must contain at least one issue"
      });
    }
  });

const visualQaResponseSchema = z.object({
  review: visualQaReviewSchema,
  warnings: z.array(z.string()).default([])
});

const visualRepairResponseSchema = z.object({
  deck: deckSchema,
  validation: generateDeckValidationSchema,
  assetSlideIds: z.array(z.string().min(1)).default([]),
  warnings: z.array(z.string()).default([])
});

type DesignImportResponse = z.infer<typeof designImportResponseSchema>;
type GenerateDeckPayload = z.infer<typeof generateDeckPayloadSchema>;
type VisualQaIssue = z.infer<typeof visualQaIssueSchema>;
type VisualRepairResponse = z.infer<typeof visualRepairResponseSchema>;
type NormalizedVisualQaReview = {
  passed: boolean;
  issues: VisualQaIssue[];
  repairActions: GenerateDeckVisualRepairAction[];
};
type ProgramV2VisualOutcome = {
  passed: boolean;
  deck: Deck;
  validation: GenerateDeckValidation;
  warnings: string[];
  reviewAttempts: number;
  repairAttempts: number;
  issues: VisualQaIssue[];
};
class ProgramV2VisualQaUnavailableError extends Error {
  constructor(
    message: string,
    readonly reviewAttempts: number,
    readonly repairAttempts: number,
    readonly deck: Deck,
    readonly validation: GenerateDeckValidation,
    readonly warnings: string[]
  ) {
    super(message);
    this.name = "ProgramV2VisualQaUnavailableError";
  }
}
export type GenerateDeckEventLogger = (
  event: string,
  fields: Record<string, unknown>
) => void;
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
const visualQaTimeoutMs = 300_000;
const visualRepairTimeoutMs = 120_000;
const maxVisualRepairAttempts = 2;

export async function processGenerateDeckJob(
  dataSource: DataSource,
  storage: Pick<StoragePort, "getSignedReadUrl" | "putObject">,
  pythonWorkerUrl: string,
  rawPayload: unknown,
  imageRuntime?: ImageAssetRuntime,
  eventLogger?: GenerateDeckEventLogger
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
  const usesProgramV2 =
    payload.request.generationMode === "design-pack" &&
    payload.request.design.engineVersion === "program-v2";
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
          : {}),
        ...(payload.request.design.engineVersion === "program-v2"
          ? {
              designProgramContext: {
                savedDesignPreferences:
                  payload.designPackSnapshot?.preferences ?? {},
                brandKitLockedValues: payload.brandKitSnapshot?.values ?? {}
              }
            }
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
    let deck = markDeckForInitialThumbnailRefresh(
      workerPayload.deck,
      payload.designPackSnapshot,
      payload.brandKitSnapshot
    );
    if (usesProgramV2) {
      emitGenerateDeckEvent(eventLogger, "ai-ppt.design-program.created", {
        jobId: payload.jobId,
        projectId: payload.projectId,
        deckId: deck.deckId,
        slideCount: deck.slides.length
      });
      emitGenerateDeckEvent(eventLogger, "ai-ppt.composition.completed", {
        jobId: payload.jobId,
        projectId: payload.projectId,
        deckId: deck.deckId,
        compositionCount: new Set(
          deck.slides
            .map(
              (slide) => slide.aiNotes?.compositionPlan?.compositionId
            )
            .flatMap((value) => (value ? [value] : []))
        ).size
      });
      await updateJob(dataSource, payload.jobId, {
        status: "running",
        progress: 45,
        message: "AI deck composition completed.",
        result: null,
        error: null
      });
    }
    if (
      payload.request.generationMode === "design-pack" &&
      hasQualityGateIssues(workerPayload.validation)
    ) {
      if (usesProgramV2) {
        emitGenerateDeckEvent(eventLogger, "ai-ppt.visual-gate.failed", {
          jobId: payload.jobId,
          projectId: payload.projectId,
          deckId: deck.deckId,
          issueCount: allValidationIssues(workerPayload.validation).length,
          stage: "deterministic"
        });
      }
      return failQualityGate(
        dataSource,
        payload.jobId,
        workerPayload,
        deck,
        workerPayload.validation,
        workerPayload.warnings
      );
    }
    let imageWarnings: string[] = [];
    let deterministicValidation = workerPayload.validation;
    if (
      payload.brandKitSnapshot &&
      payload.request.generationMode === "design-pack"
    ) {
      const brandAssets = await applyBrandKitLogoAsset(
        dataSource,
        storage,
        deck,
        payload.brandKitSnapshot
      );
      deck = brandAssets.deck;
      imageWarnings.push(...brandAssets.warnings);
      if (
        payload.brandKitSnapshot.values.lockedFields.includes("typography") &&
        payload.request.design.fontOverride?.pptxEmbeddable === false
      ) {
        imageWarnings.push(
          `Brand Kit font is not embeddable; PPTX fallback ${payload.brandKitSnapshot.values.typography.fallbackFamily} will be used when unavailable.`
        );
      }
    }
    if (
      imageRuntime &&
      payload.imageAssetScope &&
      payload.request.generationMode === "design-pack"
    ) {
      try {
        const resolvedImages = await resolveDeckImageAssets(
          dataSource,
          storage,
          deck,
          imageRuntime,
          payload.imageAssetScope
        );
        deck = resolvedImages.deck;
        imageWarnings.push(...resolvedImages.warnings);
      } catch (error) {
        imageWarnings.push(
          `Image asset pipeline fallback retained placeholders: ${
            error instanceof Error ? error.message : "unknown error"
          }`
        );
      }
    }

    if (usesProgramV2) {
      const optionalSlideIds = unresolvedOptionalMediaSlideIds(deck);
      if (optionalSlideIds.length > 0) {
        try {
          const fallback = await requestVisualRepair(
            pythonWorkerUrl,
            deck,
            [],
            optionalSlideIds
          );
          deck = fallback.deck;
          deterministicValidation = fallback.validation;
          imageWarnings.push(...fallback.warnings);
        } catch (error) {
          emitGenerateDeckEvent(eventLogger, "ai-ppt.visual-gate.failed", {
            jobId: payload.jobId,
            projectId: payload.projectId,
            deckId: deck.deckId,
            stage: "optional-asset-fallback"
          });
          return failVisualQaUnavailable(
            dataSource,
            payload.jobId,
            workerPayload,
            deck,
            deterministicValidation,
            [...workerPayload.warnings, ...imageWarnings],
            error instanceof Error ? error.message : "Visual repair unavailable.",
            { visualReviewAttempts: 0, visualRepairAttempts: 0 }
          );
        }
      }
      emitGenerateDeckEvent(eventLogger, "ai-ppt.asset.resolved", {
        jobId: payload.jobId,
        projectId: payload.projectId,
        deckId: deck.deckId,
        resolvedAssetCount: resolvedVisualAssetCount(deck),
        unresolvedRequiredCount: unresolvedRequiredMediaSlideIds(deck).length,
        unresolvedOptionalCount: unresolvedOptionalMediaSlideIds(deck).length
      });
      await updateJob(dataSource, payload.jobId, {
        status: "running",
        progress: 65,
        message: "AI deck image assets prepared.",
        result: null,
        error: null
      });
    }

    const initialSemanticIssues = getSemanticQaIssues(deck);
    const shouldRepairSemanticIssues = initialSemanticIssues.some((issue) =>
      ["SLIDE_MESSAGE_MULTIPLE", "IMAGE_RELEVANCE_WEAK"].includes(issue.code)
    );
    if (shouldRepairSemanticIssues) {
      deck = deckSchema.parse(repairSemanticQaOnce(deck));
      imageWarnings.push("Semantic QA bounded repair applied once.");
    }
    const semanticIssues = getSemanticQaIssues(deck);
    let validation: GenerateDeckValidation = {
      ...deterministicValidation,
      passed: deterministicValidation.passed && semanticIssues.length === 0,
      presentationIssues: [
        ...deterministicValidation.presentationIssues,
        ...semanticIssues
      ]
    };

    const unresolvedMedia = hasMediaPlaceholder(deck);
    if (
      payload.request.generationMode === "design-pack" &&
      (hasQualityGateIssues(validation) || unresolvedMedia)
    ) {
      const finalValidation = unresolvedMedia
        ? withUnresolvedMediaIssue(validation)
        : validation;
      if (usesProgramV2) {
        emitGenerateDeckEvent(eventLogger, "ai-ppt.visual-gate.failed", {
          jobId: payload.jobId,
          projectId: payload.projectId,
          deckId: deck.deckId,
          issueCount: allValidationIssues(finalValidation).length,
          stage: unresolvedMedia ? "asset" : "semantic"
        });
      }
      return failQualityGate(
        dataSource,
        payload.jobId,
        workerPayload,
        deck,
        finalValidation,
        [...workerPayload.warnings, ...imageWarnings]
      );
    }

    let diagnostics: GenerateDeckDiagnostics = {
      ...workerPayload.diagnostics,
      validationIssueCount: allValidationIssues(validation).length
    };
    if (usesProgramV2) {
      await updateJob(dataSource, payload.jobId, {
        status: "running",
        progress: 75,
        message: "AI deck rendered visual review running.",
        result: null,
        error: null
      });
      let visualOutcome: ProgramV2VisualOutcome;
      try {
        visualOutcome = await runProgramV2VisualQa({
          dataSource,
          storage,
          pythonWorkerUrl,
          deck,
          validation,
          imageRuntime,
          imageAssetScope: payload.imageAssetScope,
          eventLogger,
          jobId: payload.jobId,
          projectId: payload.projectId
        });
      } catch (error) {
        const unavailable =
          error instanceof ProgramV2VisualQaUnavailableError ? error : undefined;
        emitGenerateDeckEvent(eventLogger, "ai-ppt.visual-gate.failed", {
          jobId: payload.jobId,
          projectId: payload.projectId,
          deckId: deck.deckId,
          stage: "visual-qa-unavailable"
        });
        return failVisualQaUnavailable(
          dataSource,
          payload.jobId,
          workerPayload,
          unavailable?.deck ?? deck,
          unavailable?.validation ?? validation,
          [
            ...workerPayload.warnings,
            ...imageWarnings,
            ...(unavailable?.warnings ?? [])
          ],
          error instanceof Error ? error.message : "Vision QA unavailable.",
          {
            visualReviewAttempts: unavailable?.reviewAttempts ?? 0,
            visualRepairAttempts: unavailable?.repairAttempts ?? 0
          }
        );
      }
      deck = visualOutcome.deck;
      validation = visualOutcome.validation;
      imageWarnings.push(...visualOutcome.warnings);
      diagnostics = {
        ...diagnostics,
        visualQaStatus: visualOutcome.passed ? "passed" : "failed",
        visualReviewAttempts: visualOutcome.reviewAttempts,
        visualRepairAttempts: visualOutcome.repairAttempts,
        visualIssueCodes: visualOutcome.issues.map((issue) => issue.code),
        validationIssueCount: allValidationIssues(validation).length
      };
      if (!visualOutcome.passed) {
        const visualValidation = withVisualIssues(
          validation,
          visualOutcome.issues
        );
        emitGenerateDeckEvent(eventLogger, "ai-ppt.visual-gate.failed", {
          jobId: payload.jobId,
          projectId: payload.projectId,
          deckId: deck.deckId,
          issueCount: visualOutcome.issues.length,
          stage: "visual-review"
        });
        return failQualityGate(
          dataSource,
          payload.jobId,
          workerPayload,
          deck,
          visualValidation,
          [...workerPayload.warnings, ...imageWarnings],
          {
            errorCode: "GENERATE_DECK_VISUAL_QUALITY_GATE_FAILED",
            diagnostics
          }
        );
      }
      await updateJob(dataSource, payload.jobId, {
        status: "running",
        progress: 95,
        message: "AI deck final publication running.",
        result: null,
        error: null
      });
    }

    await saveDeck(dataSource, deck);
    if (usesProgramV2) {
      emitGenerateDeckEvent(eventLogger, "ai-ppt.deck.published", {
        jobId: payload.jobId,
        projectId: payload.projectId,
        deckId: deck.deckId,
        slideCount: deck.slides.length
      });
    }
    const result = generateDeckJobResultSchema.parse({
      deckId: deck.deckId,
      ...workerPayload,
      warnings: [...workerPayload.warnings, ...imageWarnings],
      validation,
      diagnostics,
      deck
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

function hasQualityGateIssues(
  validation: ReturnType<typeof generateDeckResponseSchema.parse>["validation"]
) {
  return !validation.passed || allValidationIssues(validation).length > 0;
}

function hasMediaPlaceholder(deck: Deck) {
  return deck.slides.some(isUnresolvedMediaSlide);
}

function unresolvedOptionalMediaSlideIds(deck: Deck) {
  return deck.slides
    .filter(
      (slide) =>
        isUnresolvedMediaSlide(slide) &&
        slide.aiNotes?.compositionPlan?.requiredAsset === false
    )
    .map((slide) => slide.slideId);
}

function unresolvedRequiredMediaSlideIds(deck: Deck) {
  return deck.slides
    .filter(
      (slide) =>
        isUnresolvedMediaSlide(slide) &&
        slide.aiNotes?.compositionPlan?.requiredAsset !== false
    )
    .map((slide) => slide.slideId);
}

function isUnresolvedMediaSlide(deckSlide: Deck["slides"][number]) {
  return (
    deckSlide.aiNotes?.visualPlan?.imageNeeded === true &&
    deckSlide.elements.some(
      (element) =>
        element.visible &&
        element.role === "media" &&
        element.elementId.endsWith("_media_placeholder")
    )
  );
}

function resolvedVisualAssetCount(deck: Deck) {
  return deck.slides.filter((slide) => slide.aiNotes?.visualPlan?.asset).length;
}

function withUnresolvedMediaIssue(
  validation: GenerateDeckValidation
): GenerateDeckValidation {
  if (
    validation.designIssues.some(
      (issue) => issue.code === "MEDIA_PLACEHOLDER_UNRESOLVED"
    )
  ) {
    return { ...validation, passed: false };
  }
  return {
    ...validation,
    passed: false,
    designIssues: [
      ...validation.designIssues,
      {
        code: "MEDIA_PLACEHOLDER_UNRESOLVED",
        scope: "deck",
        severity: "warning",
        blocking: false,
        path: "slides",
        message:
          "이미지 자리 표시자가 실제 asset 또는 no-media composition으로 해소되지 않았습니다."
      }
    ]
  };
}

function withVisualIssues(
  validation: GenerateDeckValidation,
  issues: VisualQaIssue[]
): GenerateDeckValidation {
  const existing = new Set(
    validation.designIssues.map((issue) => `${issue.code}:${issue.path}`)
  );
  const visualIssues = issues
    .map((issue) => ({
      code: issue.code,
      scope: "slide" as const,
      severity: "warning" as const,
      blocking: false,
      path: `slides.${issue.slideOrder - 1}`,
      message: issue.message
    }))
    .filter((issue) => !existing.has(`${issue.code}:${issue.path}`));
  return {
    ...validation,
    passed: false,
    designIssues: [...validation.designIssues, ...visualIssues]
  };
}

async function runProgramV2VisualQa(input: {
  dataSource: DataSource;
  storage: Pick<StoragePort, "getSignedReadUrl" | "putObject">;
  pythonWorkerUrl: string;
  deck: Deck;
  validation: GenerateDeckValidation;
  imageRuntime?: ImageAssetRuntime;
  imageAssetScope?: { userId: string; organizationId?: string };
  eventLogger?: GenerateDeckEventLogger;
  jobId: string;
  projectId: string;
}): Promise<ProgramV2VisualOutcome> {
  let deck = input.deck;
  let validation = input.validation;
  const warnings: string[] = [];
  let reviewAttempts = 0;
  let repairAttempts = 0;
  reviewAttempts += 1;
  let reviewed: Awaited<ReturnType<typeof requestVisualReview>>;
  try {
    reviewed = await requestVisualReview(
      input.dataSource,
      input.storage,
      input.pythonWorkerUrl,
      deck
    );
  } catch (error) {
    throw unavailableVisualQaError(
      error,
      reviewAttempts,
      repairAttempts,
      deck,
      validation,
      warnings
    );
  }
  let review = reviewed.review;
  warnings.push(...reviewed.warnings);
  emitVisualReviewEvent(input, deck, review, reviewAttempts);

  while (
    !review.passed &&
    repairAttempts < maxVisualRepairAttempts &&
    review.repairActions.length > 0
  ) {
    repairAttempts += 1;
    await updateJob(input.dataSource, input.jobId, {
      status: "running",
      progress: Math.min(90, 80 + repairAttempts * 5),
      message: `AI deck visual repair ${repairAttempts}/${maxVisualRepairAttempts} running.`,
      result: null,
      error: null
    });
    let repaired: VisualRepairResponse;
    try {
      repaired = await requestVisualRepair(
        input.pythonWorkerUrl,
        deck,
        review.repairActions,
        []
      );
    } catch (error) {
      throw unavailableVisualQaError(
        error,
        reviewAttempts,
        repairAttempts,
        deck,
        validation,
        warnings
      );
    }
    deck = repaired.deck;
    validation = repaired.validation;
    warnings.push(...repaired.warnings);
    emitGenerateDeckEvent(input.eventLogger, "ai-ppt.visual-repair.applied", {
      jobId: input.jobId,
      projectId: input.projectId,
      deckId: deck.deckId,
      attempt: repairAttempts,
      actionTypes: review.repairActions.map((action) => action.action),
      slideCount: new Set(
        review.repairActions.map((action) => action.slideId)
      ).size
    });

    if (repaired.assetSlideIds.length > 0) {
      if (input.imageRuntime && input.imageAssetScope) {
        try {
          const resolved = await resolveDeckImageAssets(
            input.dataSource,
            input.storage,
            deck,
            input.imageRuntime,
            input.imageAssetScope,
            new Set(repaired.assetSlideIds)
          );
          deck = resolved.deck;
          warnings.push(...resolved.warnings);
        } catch (error) {
          warnings.push(
            `Visual repair image re-resolution failed: ${
              error instanceof Error ? error.message : "unknown error"
            }`
          );
        }
      } else {
        warnings.push(
          "Visual repair requested image re-resolution without an available provider scope."
        );
      }
    }

    const optionalSlideIds = unresolvedOptionalMediaSlideIds(deck);
    if (optionalSlideIds.length > 0) {
      let fallback: VisualRepairResponse;
      try {
        fallback = await requestVisualRepair(
          input.pythonWorkerUrl,
          deck,
          [],
          optionalSlideIds
        );
      } catch (error) {
        throw unavailableVisualQaError(
          error,
          reviewAttempts,
          repairAttempts,
          deck,
          validation,
          warnings
        );
      }
      deck = fallback.deck;
      validation = fallback.validation;
      warnings.push(...fallback.warnings);
    }

    const semanticIssues = getSemanticQaIssues(deck);
    validation = {
      ...validation,
      passed: validation.passed && semanticIssues.length === 0,
      presentationIssues: [
        ...validation.presentationIssues,
        ...semanticIssues
      ]
    };
    if (hasMediaPlaceholder(deck)) {
      validation = withUnresolvedMediaIssue(validation);
    }
    if (hasQualityGateIssues(validation)) {
      return {
        passed: false,
        deck,
        validation,
        warnings,
        reviewAttempts,
        repairAttempts,
        issues: review.issues
      };
    }

    reviewAttempts += 1;
    try {
      reviewed = await requestVisualReview(
        input.dataSource,
        input.storage,
        input.pythonWorkerUrl,
        deck
      );
    } catch (error) {
      throw unavailableVisualQaError(
        error,
        reviewAttempts,
        repairAttempts,
        deck,
        validation,
        warnings
      );
    }
    review = reviewed.review;
    warnings.push(...reviewed.warnings);
    emitVisualReviewEvent(input, deck, review, reviewAttempts);
  }

  return {
    passed: review.passed,
    deck,
    validation,
    warnings,
    reviewAttempts,
    repairAttempts,
    issues: review.issues
  };
}

function unavailableVisualQaError(
  error: unknown,
  reviewAttempts: number,
  repairAttempts: number,
  deck: Deck,
  validation: GenerateDeckValidation,
  warnings: string[]
) {
  return new ProgramV2VisualQaUnavailableError(
    error instanceof Error ? error.message : "Vision QA unavailable.",
    reviewAttempts,
    repairAttempts,
    deck,
    validation,
    [...warnings]
  );
}

async function requestVisualReview(
  dataSource: DataSource,
  storage: Pick<StoragePort, "getSignedReadUrl">,
  pythonWorkerUrl: string,
  deck: Deck
): Promise<{ review: NormalizedVisualQaReview; warnings: string[] }> {
  let response: Response;
  try {
    const reviewDeck = await embedDeckImageAssets(
      dataSource,
      storage,
      deck.projectId,
      deck
    );
    response = await fetch(workerUrl(pythonWorkerUrl, "/ai/review-deck-visuals"), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ deck: reviewDeck }),
      signal: AbortSignal.timeout(visualQaTimeoutMs)
    });
  } catch (error) {
    throw new Error(
      error instanceof Error ? error.message : "Vision QA request unavailable."
    );
  }
  if (!response.ok) {
    throw new Error((await response.text()) || "Vision QA request failed.");
  }
  const payload = visualQaResponseSchema.parse(await response.json());
  return {
    review: {
      passed: payload.review.passed,
      issues: payload.review.issues,
      repairActions: payload.review.repairActions.map((action) =>
        generateDeckVisualRepairActionSchema.parse({
          action: action.action,
          slideId: action.slideId,
          ...(action.targetElementId
            ? { targetElementId: action.targetElementId }
            : {}),
          ...(action.compositionId
            ? { compositionId: action.compositionId }
            : {}),
          ...(action.backgroundMode
            ? { backgroundMode: action.backgroundMode }
            : {}),
          reason: action.reason
        })
      )
    },
    warnings: payload.warnings
  };
}

async function requestVisualRepair(
  pythonWorkerUrl: string,
  deck: Deck,
  actions: GenerateDeckVisualRepairAction[],
  dropOptionalMediaSlideIds: string[]
): Promise<VisualRepairResponse> {
  let response: Response;
  try {
    response = await fetch(workerUrl(pythonWorkerUrl, "/ai/repair-deck-visuals"), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ deck, actions, dropOptionalMediaSlideIds }),
      signal: AbortSignal.timeout(visualRepairTimeoutMs)
    });
  } catch (error) {
    throw new Error(
      error instanceof Error ? error.message : "Visual repair request unavailable."
    );
  }
  if (!response.ok) {
    throw new Error((await response.text()) || "Visual repair request failed.");
  }
  return visualRepairResponseSchema.parse(await response.json());
}

function emitVisualReviewEvent(
  input: {
    eventLogger?: GenerateDeckEventLogger;
    jobId: string;
    projectId: string;
  },
  deck: Deck,
  review: NormalizedVisualQaReview,
  attempt: number
) {
  emitGenerateDeckEvent(input.eventLogger, "ai-ppt.visual-review.completed", {
    jobId: input.jobId,
    projectId: input.projectId,
    deckId: deck.deckId,
    attempt,
    passed: review.passed,
    issueCodes: review.issues.map((issue) => issue.code)
  });
}

function emitGenerateDeckEvent(
  logger: GenerateDeckEventLogger | undefined,
  event: string,
  fields: Record<string, unknown>
) {
  try {
    logger?.(event, fields);
  } catch {
    // Business event logging must not change generation behavior.
  }
}

async function failQualityGate(
  dataSource: DataSource,
  jobId: string,
  workerPayload: ReturnType<typeof generateDeckResponseSchema.parse>,
  deck: Deck,
  validation: ReturnType<typeof generateDeckResponseSchema.parse>["validation"],
  warnings: string[],
  options: {
    errorCode?: string;
    diagnostics?: GenerateDeckDiagnostics;
  } = {}
) {
  const issueCount = allValidationIssues(validation).length;
  const result = generateDeckJobResultSchema.parse({
    deckId: deck.deckId,
    ...workerPayload,
    deck,
    warnings,
    validation,
    diagnostics: {
      ...workerPayload.diagnostics,
      ...options.diagnostics,
      validationIssueCount: issueCount
    }
  });
  return failJob(
    dataSource,
    jobId,
    90,
    options.errorCode ?? "GENERATE_DECK_QUALITY_GATE_FAILED",
    `Deck generation retained ${issueCount} quality issue(s).`,
    result
  );
}

async function failVisualQaUnavailable(
  dataSource: DataSource,
  jobId: string,
  workerPayload: ReturnType<typeof generateDeckResponseSchema.parse>,
  deck: Deck,
  validation: GenerateDeckValidation,
  warnings: string[],
  message: string,
  attempts: {
    visualReviewAttempts: number;
    visualRepairAttempts: number;
  }
) {
  const result = generateDeckJobResultSchema.parse({
    deckId: deck.deckId,
    ...workerPayload,
    deck,
    warnings,
    validation,
    diagnostics: {
      ...workerPayload.diagnostics,
      visualQaStatus: "failed",
      ...attempts,
      visualIssueCodes: [],
      validationIssueCount: allValidationIssues(validation).length
    }
  });
  return failJob(
    dataSource,
    jobId,
    90,
    "GENERATE_DECK_VISUAL_QA_UNAVAILABLE",
    message,
    result
  );
}

function markDeckForInitialThumbnailRefresh(
  deck: Deck,
  designPackSnapshot?: SavedDesignPackSnapshot,
  brandKitSnapshot?: BrandKitSnapshot
): Deck {
  return {
    ...deck,
    metadata: {
      ...deck.metadata,
      thumbnailSource: "import-render",
      ...(designPackSnapshot && deck.metadata.sourceType === "ai"
        ? { designPackSnapshot }
        : {}),
      ...(brandKitSnapshot && deck.metadata.sourceType === "ai"
        ? { brandKitSnapshot }
        : {})
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
