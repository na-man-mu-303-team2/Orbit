import { z } from "zod";

import { deckSnapshotSchema, type DeckSnapshot } from "./deck-api.schema";
import { deckCanvasSchema, deckSchema, slideSchema, type Deck } from "./deck.schema";
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
import { themeSchema } from "./theme.schema";

export const designAgentMessageRoleSchema = z.enum(["user", "assistant"]);
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
]);

export const designAgentCapabilitiesSchema = z.object({
  version: z.literal("1"),
  operations: z.array(designAgentCapabilityOperationSchema).min(1),
  addableElementTypes: z.array(z.enum(["text", "rect"])),
  canEditTextContent: z.boolean(),
  canGenerateImages: z.boolean(),
  canModifyLockedElements: z.boolean(),
});

export const designAgentCapabilities = designAgentCapabilitiesSchema.parse({
  version: "1",
  operations: [
    "add_element",
    "update_element_frame",
    "update_element_props",
    "delete_element",
    "update_slide_style",
  ],
  addableElementTypes: ["text", "rect"],
  canEditTextContent: true,
  canGenerateImages: false,
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

export const createDesignAgentMessageRequestSchema = z.object({
  sessionId: z.string().trim().min(1).max(200).optional(),
  content: z.string().trim().min(1).max(2_000),
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
  context: designAgentContextSchema,
  history: z.array(designAgentHistoryItemSchema).max(10).default([]),
  capabilities: designAgentCapabilitiesSchema.default(designAgentCapabilities),
});

export const designAgentWorkerResponseSchema = z.object({
  message: z.string().trim().min(1).max(2_000),
  interpretedIntent: designAgentIntentSchema,
  operations: z.array(deckPatchOperationSchema).max(200).default([]),
  affectedElementIds: z.array(deckElementIdSchema).max(200).default([]),
  warnings: z.array(z.string().trim().min(1).max(1_000)).max(20).default([]),
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
});

export const applyDesignAgentProposalResponseSchema: z.ZodType<{
  proposal: z.infer<typeof designAgentProposalSchema>;
  deck: Deck;
  changeRecord: DeckChangeRecord;
  snapshot: DeckSnapshot | null;
  updatedAt: string;
}, z.ZodTypeDef, unknown> = z.object({
  proposal: designAgentProposalSchema,
  deck: deckSchema,
  changeRecord: deckChangeRecordSchema,
  snapshot: deckSnapshotSchema.nullable(),
  updatedAt: z.string().datetime(),
});

export type DesignAgentMessageRole = z.infer<
  typeof designAgentMessageRoleSchema
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
