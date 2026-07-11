import { z } from "zod";

import { deckCanvasSchema, slideSchema } from "./deck.schema";
import {
  deckElementIdSchema,
  deckIdSchema,
  deckSlideIdSchema,
} from "./id.schema";
import { deckPatchOperationSchema } from "./patch.schema";
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

export type DesignAgentMessageRole = z.infer<
  typeof designAgentMessageRoleSchema
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
