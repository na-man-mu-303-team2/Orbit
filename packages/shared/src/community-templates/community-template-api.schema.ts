import { z } from "zod";

import { isoDateTimeSchema } from "../common/time.schema";
import { projectSchema } from "../projects/project.schema";
import {
  communityTemplateCategorySchema,
  communityTemplateIdSchema,
  communityTemplatePreviewSchema,
  communityTemplateTitleSchema,
} from "./community-template.schema";

const boundedIdSchema = z.string().trim().min(1).max(200);

export const communityTemplateListQuerySchema = z
  .object({
    query: z.string().trim().max(60).optional(),
    category: communityTemplateCategorySchema.optional(),
    page: z.coerce.number().int().positive().default(1),
    limit: z.coerce.number().int().positive().max(48).default(24),
  })
  .strict();

export const communityTemplateCardSchema = z
  .object({
    templateId: communityTemplateIdSchema,
    title: communityTemplateTitleSchema,
    category: communityTemplateCategorySchema,
    preview: communityTemplatePreviewSchema,
    createdAt: isoDateTimeSchema,
  })
  .strict();

export const communityTemplateListResponseSchema = z
  .object({
    items: z.array(communityTemplateCardSchema),
    page: z.number().int().positive(),
    hasMore: z.boolean(),
  })
  .strict();

export const communityTemplateRecentResponseSchema = z
  .object({ items: z.array(communityTemplateCardSchema).max(4) })
  .strict();

export const communityTemplateSourceProjectSchema = z
  .object({
    projectId: boundedIdSchema,
    title: z.string().trim().min(1).max(120),
    createdAt: isoDateTimeSchema,
  })
  .strict();

export const communityTemplateSourceListResponseSchema = z
  .object({ items: z.array(communityTemplateSourceProjectSchema) })
  .strict();

export const publishCommunityTemplateRequestSchema = z
  .object({
    sourceProjectId: boundedIdSchema,
    title: communityTemplateTitleSchema,
    category: communityTemplateCategorySchema,
    rightsConfirmed: z.literal(true),
  })
  .strict();

export const publishCommunityTemplateResponseSchema = z
  .object({ template: communityTemplateCardSchema })
  .strict();

export const useCommunityTemplateRequestSchema = z
  .object({ clientRequestId: z.string().uuid() })
  .strict();

export const useCommunityTemplateResponseSchema = z
  .object({
    templateId: communityTemplateIdSchema,
    project: projectSchema,
    deckId: boundedIdSchema.regex(/^deck_[A-Za-z0-9_-]+$/),
  })
  .strict();

export const communityTemplateApiErrorCodeSchema = z.enum([
  "COMMUNITY_TEMPLATE_NOT_FOUND",
  "COMMUNITY_TEMPLATE_SOURCE_NOT_FOUND",
  "COMMUNITY_TEMPLATE_OWNER_REQUIRED",
  "COMMUNITY_TEMPLATE_ACTIVITY_UNSUPPORTED",
  "COMMUNITY_TEMPLATE_SANITIZATION_FAILED",
  "COMMUNITY_TEMPLATE_SNAPSHOT_TOO_LARGE",
  "COMMUNITY_TEMPLATE_USE_CONFLICT",
  "COMMUNITY_TEMPLATE_SCHEMA_NOT_READY",
]);

export const communityTemplateApiErrorSchema = z
  .object({
    code: communityTemplateApiErrorCodeSchema,
    message: z.string().trim().min(1).max(240),
    details: z.array(z.string().trim().min(1).max(200)).max(10).default([]),
  })
  .strict();

export type CommunityTemplateListQuery = z.infer<
  typeof communityTemplateListQuerySchema
>;
export type CommunityTemplateCard = z.infer<typeof communityTemplateCardSchema>;
export type CommunityTemplateListResponse = z.infer<
  typeof communityTemplateListResponseSchema
>;
export type CommunityTemplateRecentResponse = z.infer<
  typeof communityTemplateRecentResponseSchema
>;
export type CommunityTemplateSourceProject = z.infer<
  typeof communityTemplateSourceProjectSchema
>;
export type CommunityTemplateSourceListResponse = z.infer<
  typeof communityTemplateSourceListResponseSchema
>;
export type PublishCommunityTemplateRequest = z.infer<
  typeof publishCommunityTemplateRequestSchema
>;
export type PublishCommunityTemplateResponse = z.infer<
  typeof publishCommunityTemplateResponseSchema
>;
export type UseCommunityTemplateRequest = z.infer<
  typeof useCommunityTemplateRequestSchema
>;
export type UseCommunityTemplateResponse = z.infer<
  typeof useCommunityTemplateResponseSchema
>;
export type CommunityTemplateApiErrorCode = z.infer<
  typeof communityTemplateApiErrorCodeSchema
>;
export type CommunityTemplateApiError = z.infer<
  typeof communityTemplateApiErrorSchema
>;
