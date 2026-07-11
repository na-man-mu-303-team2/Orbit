import { z } from "zod";

import { isoDateTimeSchema } from "../common/time.schema";
import { deckSchema, type Deck } from "./deck.schema";
import {
  deckPatchOperationSchema,
  deckPatchSchema,
  deckChangeRecordSchema,
  type DeckChangeRecord
} from "./patch.schema";
import {
  deckChangeIdSchema,
  deckIdSchema,
  deckSlideIdSchema
} from "./id.schema";
import { deckSnapshotSchema, type DeckSnapshot } from "./deck-api.schema";

const aiSuggestionIssuePath = {
  patch: ["patch"],
  operations: ["patch", "operations"]
} as const;

export const aiSuggestionIdSchema = z
  .string()
  .regex(/^suggestion_[A-Za-z0-9_-]+$/);

export const aiSuggestionStatusSchema = z.enum([
  "pending",
  "applied",
  "rejected"
]);

export const aiSuggestionErrorCodeSchema = z.enum([
  "AI_SUGGESTION_VALIDATION_FAILED",
  "AI_SUGGESTION_NOT_FOUND",
  "AI_SUGGESTION_NOT_PENDING",
  "AI_SUGGESTION_SLIDE_DELETED",
  "AI_SUGGESTION_STALE_BASE_VERSION",
  "AI_SUGGESTION_PATCH_APPLY_FAILED",
  "AI_SUGGESTION_PROJECT_MISMATCH"
]);

export const aiSuggestionErrorSchema = z.object({
  code: aiSuggestionErrorCodeSchema,
  message: z.string().min(1),
  details: z.array(z.string()).default([])
});

export const aiSuggestionPatchOperationSchema = deckPatchOperationSchema
  .refine((operation) => getSuggestionOperationSlideId(operation) !== null, {
    message: "AI suggestion operations must be slide-scoped"
  });

export const aiSuggestionPatchSchema = deckPatchSchema.superRefine(
  (patch, ctx) => {
    if (patch.source !== "ai") {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["source"],
        message: "AI suggestion patch source must be ai"
      });
    }

    const slideIds = new Set<string>();

    patch.operations.forEach((operation, index) => {
      const slideId = getSuggestionOperationSlideId(operation);

      if (!slideId) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["operations", index, "type"],
          message: "AI suggestion operations must be slide-scoped"
        });
        return;
      }

      slideIds.add(slideId);
    });

    if (slideIds.size > 1) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["operations"],
        message: "AI suggestion patch must target exactly one slide"
      });
    }
  }
);

export const aiSuggestionSchema = z
  .object({
    suggestionId: aiSuggestionIdSchema,
    projectId: z.string().min(1),
    deckId: deckIdSchema,
    slideId: deckSlideIdSchema,
    baseVersion: z.number().int().positive(),
    title: z.string().trim().min(1),
    summary: z.string().trim().min(1).optional(),
    patch: aiSuggestionPatchSchema,
    status: aiSuggestionStatusSchema,
    appliedChangeId: deckChangeIdSchema.optional(),
    rejectedReason: z.string().trim().min(1).optional(),
    createdAt: isoDateTimeSchema,
    updatedAt: isoDateTimeSchema
  })
  .superRefine((suggestion, ctx) => {
    requirePatchMatchesSuggestion(suggestion, ctx);

    if (suggestion.status === "applied" && !suggestion.appliedChangeId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["appliedChangeId"],
        message: "applied suggestions require appliedChangeId"
      });
    }

    if (suggestion.status !== "applied" && suggestion.appliedChangeId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["appliedChangeId"],
        message: "only applied suggestions can include appliedChangeId"
      });
    }

    if (suggestion.status !== "rejected" && suggestion.rejectedReason) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["rejectedReason"],
        message: "only rejected suggestions can include rejectedReason"
      });
    }
  });

export const createAiSuggestionRequestSchema = z
  .object({
    deckId: deckIdSchema,
    slideId: deckSlideIdSchema,
    baseVersion: z.number().int().positive(),
    title: z.string().trim().min(1),
    summary: z.string().trim().min(1).optional(),
    patch: aiSuggestionPatchSchema
  })
  .superRefine(requirePatchMatchesSuggestion);

export const listAiSuggestionsQuerySchema = z.object({
  deckId: deckIdSchema.optional(),
  slideId: deckSlideIdSchema.optional(),
  status: aiSuggestionStatusSchema.optional()
});

export const rejectAiSuggestionRequestSchema = z.object({
  reason: z.string().trim().min(1).max(500).optional()
});

export const createAiSuggestionResponseSchema = z.object({
  suggestion: aiSuggestionSchema
});

export const listAiSuggestionsResponseSchema = z.object({
  projectId: z.string().min(1),
  suggestions: z.array(aiSuggestionSchema)
});

export const applyAiSuggestionResponseSchema: z.ZodType<{
  suggestion: z.infer<typeof aiSuggestionSchema>;
  deck: Deck;
  changeRecord: DeckChangeRecord;
  snapshot: DeckSnapshot;
  updatedAt: string;
}, z.ZodTypeDef, unknown> = z.object({
  suggestion: aiSuggestionSchema,
  deck: deckSchema,
  changeRecord: deckChangeRecordSchema,
  snapshot: deckSnapshotSchema,
  updatedAt: isoDateTimeSchema
});

export const rejectAiSuggestionResponseSchema = z.object({
  suggestion: aiSuggestionSchema
});

function requirePatchMatchesSuggestion(
  suggestion: {
    deckId: string;
    slideId: string;
    baseVersion: number;
    patch: z.infer<typeof aiSuggestionPatchSchema>;
  },
  ctx: z.RefinementCtx
): void {
  if (suggestion.patch.deckId !== suggestion.deckId) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: [...aiSuggestionIssuePath.patch],
      message: "patch.deckId must match suggestion.deckId"
    });
  }

  if (suggestion.patch.baseVersion !== suggestion.baseVersion) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: [...aiSuggestionIssuePath.patch],
      message: "patch.baseVersion must match suggestion.baseVersion"
    });
  }

  suggestion.patch.operations.forEach((operation, index) => {
    const slideId = getSuggestionOperationSlideId(operation);

    if (slideId && slideId !== suggestion.slideId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: [...aiSuggestionIssuePath.operations, index, "slideId"],
        message: "operation.slideId must match suggestion.slideId"
      });
    }
  });
}

function getSuggestionOperationSlideId(
  operation: z.infer<typeof deckPatchOperationSchema>
): string | null {
  switch (operation.type) {
    case "update_slide":
    case "update_slide_style":
    case "add_element":
    case "update_element_frame":
    case "update_element_props":
    case "delete_element":
    case "update_speaker_notes":
    case "replace_keywords":
    case "replace_semantic_cues":
    case "add_animation":
    case "update_animation":
    case "delete_animation":
    case "add_slide_action":
    case "update_slide_action":
    case "delete_slide_action":
      return operation.slideId;
    default:
      return null;
  }
}

export type AiSuggestionId = z.infer<typeof aiSuggestionIdSchema>;
export type AiSuggestionStatus = z.infer<typeof aiSuggestionStatusSchema>;
export type AiSuggestionErrorCode = z.infer<
  typeof aiSuggestionErrorCodeSchema
>;
export type AiSuggestionError = z.infer<typeof aiSuggestionErrorSchema>;
export type AiSuggestion = z.infer<typeof aiSuggestionSchema>;
export type CreateAiSuggestionRequest = z.infer<
  typeof createAiSuggestionRequestSchema
>;
export type ListAiSuggestionsQuery = z.infer<
  typeof listAiSuggestionsQuerySchema
>;
export type RejectAiSuggestionRequest = z.infer<
  typeof rejectAiSuggestionRequestSchema
>;
export type CreateAiSuggestionResponse = z.infer<
  typeof createAiSuggestionResponseSchema
>;
export type ListAiSuggestionsResponse = z.infer<
  typeof listAiSuggestionsResponseSchema
>;
export type ApplyAiSuggestionResponse = z.infer<
  typeof applyAiSuggestionResponseSchema
>;
export type RejectAiSuggestionResponse = z.infer<
  typeof rejectAiSuggestionResponseSchema
>;
