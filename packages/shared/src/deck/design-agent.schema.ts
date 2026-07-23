import { z } from "zod";

import { deckSnapshotSchema, type DeckSnapshot } from "./deck-api.schema";
import {
  deckCanvasSchema,
  deckSchema,
  slideSchema,
  type Deck,
} from "./deck.schema";
import {
  deckElementIdSchema,
  deckIdSchema,
  deckSlideIdSchema,
} from "./id.schema";
import {
  deckChangeRecordSchema,
  deckPatchOperationSchema,
  type DeckChangeRecord,
} from "./patch.schema";
import {
  availableSmartArtLayoutSchema,
  smartArtRequestSchema,
} from "./smart-art-layout.schema";
import { speakerNotesSuggestionModeSchema } from "./speaker-notes-assistant.schema";
import {
  slideRedesignPaletteOptionSchema,
  slideRedesignPaletteOptionsSchema,
} from "./slide-redesign.schema";
import { themeSchema } from "./theme.schema";

export const designAgentMessageRoleSchema = z.enum(["user", "assistant"]);
export const designAgentIntentPresetSchema = z.enum([
  "redesign-slide",
  "tidy-layout",
  "emphasize-message",
  "recommend-animation",
]);
export const designAgentMessageStatusSchema = z.enum([
  "pending",
  "succeeded",
  "failed",
]);
export const designAgentProposalStatusSchema = z.enum([
  "pending",
  "applied",
  "rejected",
  "stale",
  "failed",
]);

export const designAgentHistoryItemSchema = z.object({
  role: designAgentMessageRoleSchema,
  content: z.string().trim().min(1).max(2_000),
});

export const designAgentCapabilityOperationSchema = z.enum([
  "add_element",
  "update_element_frame",
  "update_element_props",
  "delete_element",
  "update_slide_style",
  "add_animation",
  "update_animation",
  "delete_animation",
]);

export const designAgentCapabilitiesSchema = z.object({
  version: z.enum(["1", "2"]),
  operations: z.array(designAgentCapabilityOperationSchema).min(1),
  addableElementTypes: z.array(
    z.enum([
      "text",
      "rect",
      "ellipse",
      "line",
      "polygon",
      "image",
      "chart",
      "table",
    ]),
  ),
  canEditTextContent: z.boolean(),
  canGenerateImages: z.boolean(),
  canModifyLockedElements: z.boolean(),
});

export const designAgentCapabilities = designAgentCapabilitiesSchema.parse({
  version: "2",
  operations: [
    "add_element",
    "update_element_frame",
    "update_element_props",
    "delete_element",
    "update_slide_style",
    "add_animation",
    "update_animation",
    "delete_animation",
  ],
  addableElementTypes: [
    "text",
    "rect",
    "ellipse",
    "line",
    "polygon",
    "image",
    "chart",
    "table",
  ],
  canEditTextContent: true,
  canGenerateImages: true,
  canModifyLockedElements: true,
});

export const designAgentContextSchema = z.object({
  deckId: deckIdSchema,
  baseVersion: z.number().int().positive(),
  canvas: deckCanvasSchema,
  slide: slideSchema,
  selectedElementIds: z.array(deckElementIdSchema).max(100).default([]),
  theme: themeSchema,
});

export const motionImportContextSchema = z
  .object({
    renderMode: z.enum(["editable", "hybrid", "snapshot"]),
    sourceSlidePartPresent: z.boolean(),
    importedMainSequenceCoverage: z.enum([
      "absent",
      "complete",
      "partial",
      "unknown",
    ]),
    stableTargetElementIds: z.array(deckElementIdSchema).max(200),
  })
  .strict();

export const motionEffectiveTypographySchema = z
  .object({
    elementId: deckElementIdSchema,
    characterCount: z.number().int().nonnegative(),
    dominantFontSize: z.number().finite().nonnegative(),
    effectiveFontSize: z.number().finite().nonnegative(),
    effectiveLetterSpacing: z.number().finite(),
    effectiveLineHeight: z.number().finite().nonnegative(),
    resolvedFontScale: z.number().finite().positive().max(1),
  })
  .strict();

export const motionPlanningContextSchema = z
  .object({
    allowedTargetElementIds: z.array(deckElementIdSchema).max(200),
    effectiveTypography: z.array(motionEffectiveTypographySchema).max(200),
    speakerNotes: z.string().max(4_000),
    notesPresent: z.boolean(),
    notesTruncated: z.boolean(),
  })
  .strict();

export const motionIntentSchema = z.enum([
  "introduce",
  "reveal",
  "focus",
  "support",
  "compare",
  "connect",
  "conclude",
]);

export const motionPlanPurposeSchema = z.enum([
  "orient",
  "reveal",
  "connect",
  "contrast",
  "emphasize",
  "conclude",
]);

export const motionPlanPatternSchema = z.enum([
  "hero-then-support",
  "stepwise-process",
  "paired-comparison",
  "evidence-then-insight",
  "cluster-reveal",
  "summary-recap",
]);

export const motionPlanPacingSchema = z.enum([
  "deliberate",
  "balanced",
  "brisk",
]);

export const motionUnitKindSchema = z.enum([
  "element",
  "explicit-group",
  "spatial-cluster",
]);

export const motionUnitSemanticRoleSchema = z.enum([
  "title",
  "subtitle",
  "body",
  "card",
  "focal",
  "media",
  "data",
  "label",
  "supporting",
  "other",
]);

export const motionPlanTargetSchema = z
  .object({
    elementId: deckElementIdSchema,
    motionIntent: motionIntentSchema,
  })
  .strict();

export const motionPlanBeatSchema = z
  .object({
    beatId: z.string().regex(/^beat_[a-z0-9_-]{1,32}$/),
    purpose: motionPlanPurposeSchema,
    trigger: z.enum(["entry", "click"]),
    relation: z.enum(["together", "sequence"]),
    targets: z.array(motionPlanTargetSchema).min(1).max(4),
  })
  .strict()
  .superRefine((beat, context) => {
    const targetIds = beat.targets.map((target) => target.elementId);
    if (new Set(targetIds).size !== targetIds.length) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Motion plan beat target IDs must be unique.",
        path: ["targets"],
      });
    }
  });

export const motionPlanV2Schema = z
  .object({
    schemaVersion: z.literal(2),
    pattern: motionPlanPatternSchema,
    pacing: motionPlanPacingSchema,
    beats: z.array(motionPlanBeatSchema).min(1).max(6),
  })
  .strict()
  .superRefine((plan, context) => {
    const entryBeats = plan.beats.filter((beat) => beat.trigger === "entry");
    const clickBeats = plan.beats.filter((beat) => beat.trigger === "click");
    const targetIds = plan.beats.flatMap((beat) =>
      beat.targets.map((target) => target.elementId),
    );
    if (entryBeats.length > 1) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Motion plan allows at most one entry beat.",
        path: ["beats"],
      });
    }
    if ((entryBeats[0]?.targets.length ?? 0) > 2) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Motion plan entry beat allows at most two targets.",
        path: ["beats"],
      });
    }
    if (clickBeats.length > 4) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Motion plan allows at most four click beats.",
        path: ["beats"],
      });
    }
    if (targetIds.length > 8 || new Set(targetIds).size !== targetIds.length) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Motion plan allows at most eight unique targets.",
        path: ["beats"],
      });
    }
  });

export const motionPlanUnitSchema = z
  .object({
    unitId: z.string().regex(/^motion_unit_[a-z0-9_-]{1,160}$/),
    kind: motionUnitKindSchema,
    animationElementIds: z.array(deckElementIdSchema).min(1).max(4),
    memberElementIds: z.array(deckElementIdSchema).min(1).max(8),
    semanticRole: motionUnitSemanticRoleSchema,
    readingOrder: z.number().int().min(1).max(200),
  })
  .strict()
  .superRefine((unit, context) => {
    if (
      new Set(unit.animationElementIds).size !== unit.animationElementIds.length
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Motion plan unit animation element IDs must be unique.",
        path: ["animationElementIds"],
      });
    }
    if (new Set(unit.memberElementIds).size !== unit.memberElementIds.length) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Motion plan unit member element IDs must be unique.",
        path: ["memberElementIds"],
      });
    }
  });

export const motionPlanV3TargetSchema = z
  .object({
    unitId: z.string().regex(/^motion_unit_[a-z0-9_-]{1,160}$/),
    motionIntent: motionIntentSchema,
  })
  .strict();

export const motionPlanV3BeatSchema = z
  .object({
    beatId: z.string().regex(/^beat_[a-z0-9_-]{1,32}$/),
    purpose: motionPlanPurposeSchema,
    trigger: z.enum(["entry", "click"]),
    relation: z.enum(["together", "sequence"]),
    targets: z.array(motionPlanV3TargetSchema).min(1).max(4),
  })
  .strict()
  .superRefine((beat, context) => {
    const unitIds = beat.targets.map((target) => target.unitId);
    if (new Set(unitIds).size !== unitIds.length) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Motion plan beat unit IDs must be unique.",
        path: ["targets"],
      });
    }
  });

export const motionPlanV3Schema = z
  .object({
    schemaVersion: z.literal(3),
    pattern: motionPlanPatternSchema,
    pacing: motionPlanPacingSchema,
    beats: z.array(motionPlanV3BeatSchema).min(1).max(6),
  })
  .strict()
  .superRefine((plan, context) => {
    const entryBeats = plan.beats.filter((beat) => beat.trigger === "entry");
    const clickBeats = plan.beats.filter((beat) => beat.trigger === "click");
    const unitIds = plan.beats.flatMap((beat) =>
      beat.targets.map((target) => target.unitId),
    );
    if (entryBeats.length > 1) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Motion plan allows at most one entry beat.",
        path: ["beats"],
      });
    }
    if ((entryBeats[0]?.targets.length ?? 0) > 2) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Motion plan entry beat allows at most two units.",
        path: ["beats"],
      });
    }
    if (clickBeats.length > 5) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Motion plan allows at most five click beats.",
        path: ["beats"],
      });
    }
    if (unitIds.length > 8 || new Set(unitIds).size !== unitIds.length) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Motion plan allows at most eight unique units.",
        path: ["beats"],
      });
    }
  });

export const motionPlanSchema = z.union([
  motionPlanV2Schema,
  motionPlanV3Schema,
]);

export const motionPlanMetadataV2Schema = z
  .object({
    source: z.literal("llm"),
    model: z.string().trim().min(1).max(200),
    attemptCount: z.union([z.literal(1), z.literal(2)]),
    compilerVersion: z.literal("motion-compiler-v2"),
    plan: motionPlanV2Schema,
  })
  .strict();

export const motionPlanMetadataV3Schema = z
  .object({
    source: z.literal("llm"),
    model: z.string().trim().min(1).max(200),
    attemptCount: z.union([z.literal(1), z.literal(2)]),
    compilerVersion: z.literal("motion-compiler-v3"),
    units: z.array(motionPlanUnitSchema).min(1).max(8),
    plan: motionPlanV3Schema,
  })
  .strict()
  .superRefine((metadata, context) => {
    const declaredUnitIds = metadata.units.map((unit) => unit.unitId);
    const referencedUnitIds = metadata.plan.beats.flatMap((beat) =>
      beat.targets.map((target) => target.unitId),
    );
    if (new Set(declaredUnitIds).size !== declaredUnitIds.length) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Motion plan metadata unit IDs must be unique.",
        path: ["units"],
      });
    }
    if (
      declaredUnitIds.length !== referencedUnitIds.length ||
      declaredUnitIds.some((unitId) => !referencedUnitIds.includes(unitId))
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Motion plan metadata units must match referenced plan units.",
        path: ["units"],
      });
    }
    const animationElementIds = metadata.units.flatMap(
      (unit) => unit.animationElementIds,
    );
    if (
      animationElementIds.length > 24 ||
      new Set(animationElementIds).size !== animationElementIds.length
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          "Motion plan metadata allows at most 24 unique animation elements.",
        path: ["units"],
      });
    }
    const memberElementIds = metadata.units.flatMap(
      (unit) => unit.memberElementIds,
    );
    if (new Set(memberElementIds).size !== memberElementIds.length) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Motion plan metadata unit members must not overlap.",
        path: ["units"],
      });
    }
  });

export const motionPlanMetadataSchema = z.union([
  motionPlanMetadataV2Schema,
  motionPlanMetadataV3Schema,
]);

export const createDesignAgentMessageRequestSchema = z.object({
  sessionId: z.string().trim().min(1).max(200).optional(),
  content: z.string().trim().min(1).max(2_000),
  intentPreset: designAgentIntentPresetSchema.optional(),
  selectedPaletteOptionId: z.string().trim().min(1).nullable().optional(),
  context: designAgentContextSchema,
});

export const designAgentIntentSchema = z.object({
  target: z.enum(["selected-elements", "current-slide"]),
  action: z.string().trim().min(1).max(1_000),
  alignment: z
    .enum([
      "canvas-left",
      "canvas-center",
      "canvas-right",
      "canvas-top",
      "canvas-bottom",
      "custom",
    ])
    .nullable()
    .default(null),
});

export const designAgentWorkerRequestSchema = z.object({
  projectId: z.string().trim().min(1),
  sessionId: z.string().trim().min(1).max(200),
  question: z.string().trim().min(1).max(2_000),
  intentPreset: designAgentIntentPresetSchema.optional(),
  context: designAgentContextSchema,
  motionImportContext: motionImportContextSchema.optional(),
  motionPlanningContext: motionPlanningContextSchema.optional(),
  history: z.array(designAgentHistoryItemSchema).max(10).default([]),
  availableSmartArtLayouts: z
    .array(availableSmartArtLayoutSchema)
    .max(200)
    .default([]),
  capabilities: designAgentCapabilitiesSchema.default(designAgentCapabilities),
  requestPaletteOptions: z.boolean().default(false),
  selectedPaletteOption: slideRedesignPaletteOptionSchema.optional(),
});

export const designAgentWorkerResponseSchema = z.object({
  message: z.string().trim().min(1).max(2_000),
  interpretedIntent: designAgentIntentSchema,
  operations: z.array(deckPatchOperationSchema).max(200).default([]),
  affectedElementIds: z.array(deckElementIdSchema).max(200).default([]),
  warnings: z.array(z.string().trim().min(1).max(1_000)).max(20).default([]),
  motionPlan: motionPlanMetadataSchema.optional(),
  paletteOptions: slideRedesignPaletteOptionsSchema.optional(),
  smartArtRequest: smartArtRequestSchema.nullable().default(null),
  uiAction: z
    .object({
      type: z.literal("open-speaker-notes-assistant"),
      mode: speakerNotesSuggestionModeSchema,
    })
    .nullable()
    .default(null),
});

export const designAgentMessageSchema = z.object({
  messageId: z.string().trim().min(1),
  sessionId: z.string().trim().min(1),
  projectId: z.string().trim().min(1),
  deckId: deckIdSchema,
  slideId: deckSlideIdSchema,
  role: designAgentMessageRoleSchema,
  content: z.string().trim().min(1),
  status: designAgentMessageStatusSchema,
  errorCode: z.string().optional(),
  errorMessage: z.string().optional(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export const designAgentProposalSchema = z.object({
  proposalId: z.string().trim().min(1),
  projectId: z.string().trim().min(1),
  deckId: deckIdSchema,
  slideId: deckSlideIdSchema,
  requestMessageId: z.string().trim().min(1),
  responseMessageId: z.string().trim().min(1).optional(),
  baseVersion: z.number().int().positive(),
  title: z.string().trim().min(1),
  summary: z.string().optional(),
  operations: z.array(deckPatchOperationSchema).min(1),
  interpretedIntent: designAgentIntentSchema.optional(),
  affectedElementIds: z.array(deckElementIdSchema),
  warnings: z.array(z.string()),
  motionPlan: motionPlanMetadataSchema.optional(),
  status: designAgentProposalStatusSchema,
  appliedChangeId: z.string().optional(),
  rejectedReason: z.string().optional(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export const createDesignAgentMessageResponseSchema = z.object({
  sessionId: z.string().trim().min(1),
  requestMessage: designAgentMessageSchema,
  responseMessage: designAgentMessageSchema,
  proposal: designAgentProposalSchema.optional(),
  paletteOptions: slideRedesignPaletteOptionsSchema.optional(),
  uiAction: designAgentWorkerResponseSchema.shape.uiAction,
});

export const applyDesignAgentProposalResponseSchema: z.ZodType<
  {
    proposal: z.infer<typeof designAgentProposalSchema>;
    deck: Deck;
    changeRecord: DeckChangeRecord;
    snapshot: DeckSnapshot | null;
    updatedAt: string;
  },
  z.ZodTypeDef,
  unknown
> = z.object({
  proposal: designAgentProposalSchema,
  deck: deckSchema,
  changeRecord: deckChangeRecordSchema,
  snapshot: deckSnapshotSchema.nullable(),
  updatedAt: z.string().datetime(),
});

export type DesignAgentMessageRole = z.infer<
  typeof designAgentMessageRoleSchema
>;
export type DesignAgentIntentPreset = z.infer<
  typeof designAgentIntentPresetSchema
>;
export type DesignAgentCapabilities = z.infer<
  typeof designAgentCapabilitiesSchema
>;
export type DesignAgentMessageStatus = z.infer<
  typeof designAgentMessageStatusSchema
>;
export type DesignAgentProposalStatus = z.infer<
  typeof designAgentProposalStatusSchema
>;
export type DesignAgentContext = z.infer<typeof designAgentContextSchema>;
export type MotionImportContext = z.infer<typeof motionImportContextSchema>;
export type MotionEffectiveTypography = z.infer<
  typeof motionEffectiveTypographySchema
>;
export type MotionPlanningContext = z.infer<typeof motionPlanningContextSchema>;
export type MotionIntent = z.infer<typeof motionIntentSchema>;
export type MotionPlanPurpose = z.infer<typeof motionPlanPurposeSchema>;
export type MotionPlanPattern = z.infer<typeof motionPlanPatternSchema>;
export type MotionPlanPacing = z.infer<typeof motionPlanPacingSchema>;
export type MotionUnitKind = z.infer<typeof motionUnitKindSchema>;
export type MotionUnitSemanticRole = z.infer<
  typeof motionUnitSemanticRoleSchema
>;
export type MotionPlanTarget = z.infer<typeof motionPlanTargetSchema>;
export type MotionPlanBeat = z.infer<typeof motionPlanBeatSchema>;
export type MotionPlanUnit = z.infer<typeof motionPlanUnitSchema>;
export type MotionPlanV3Target = z.infer<typeof motionPlanV3TargetSchema>;
export type MotionPlanV3Beat = z.infer<typeof motionPlanV3BeatSchema>;
export type MotionPlan = z.infer<typeof motionPlanSchema>;
export type MotionPlanMetadata = z.infer<typeof motionPlanMetadataSchema>;
export type CreateDesignAgentMessageRequest = z.infer<
  typeof createDesignAgentMessageRequestSchema
>;
export type DesignAgentWorkerRequest = z.infer<
  typeof designAgentWorkerRequestSchema
>;
export type DesignAgentWorkerResponse = z.infer<
  typeof designAgentWorkerResponseSchema
>;
export type DesignAgentMessage = z.infer<typeof designAgentMessageSchema>;
export type DesignAgentProposal = z.infer<typeof designAgentProposalSchema>;
export type CreateDesignAgentMessageResponse = z.infer<
  typeof createDesignAgentMessageResponseSchema
>;
export type ApplyDesignAgentProposalResponse = z.infer<
  typeof applyDesignAgentProposalResponseSchema
>;
