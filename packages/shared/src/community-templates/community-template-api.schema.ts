import { z } from "zod";

import { isoDateTimeSchema } from "../common/time.schema";
import { projectSchema } from "../projects/project.schema";
import {
  communityTemplateCategoryIdSchema,
  communityTemplateCategoryOptionSchema,
  communityTemplateCategorySchema,
  communityTemplateIdSchema,
  communityTemplatePreviewSchema,
  communityTemplateTagNameSchema,
  communityTemplateTagSchema,
  communityTemplateTitleSchema,
  maxCommunityTemplateTags,
} from "./community-template.schema";

const boundedIdSchema = z.string().trim().min(1).max(200);

export const communityTemplateListQuerySchema = z
  .object({
    query: z.string().trim().max(60).optional(),
    category: communityTemplateCategorySchema.optional(),
    categoryId: communityTemplateCategoryIdSchema.optional(),
    page: z.coerce.number().int().positive().default(1),
    limit: z.coerce.number().int().positive().max(48).default(24),
  })
  .strict();

export const communityTemplateCategoryListResponseSchema = z
  .object({ items: z.array(communityTemplateCategoryOptionSchema) })
  .strict();

export const communityTemplateTagListQuerySchema = z
  .object({
    query: z.string().trim().max(30).optional(),
    scope: z.enum(["used", "all"]).default("used"),
    sort: z.enum(["popular", "name"]).default("popular"),
    limit: z.coerce.number().int().positive().max(30).default(12),
  })
  .strict();

export const communityTemplateTagSuggestionSchema =
  communityTemplateTagSchema.extend({
    usageCount: z.number().int().nonnegative(),
  });

export const communityTemplateTagListResponseSchema = z
  .object({ items: z.array(communityTemplateTagSuggestionSchema) })
  .strict();

export const communityTemplateTagNamesSchema = z
  .array(communityTemplateTagNameSchema)
  .transform((values) => {
    const seen = new Set<string>();
    return values.filter((value) => {
      const key = value.toLocaleLowerCase("ko-KR");
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  })
  .refine(
    (values) => values.length <= maxCommunityTemplateTags,
    "태그는 최대 5개까지 입력할 수 있습니다.",
  );

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
    publishable: z.boolean(),
    unavailableReason: z
      .enum([
        "ALREADY_PUBLISHED",
        "SOURCE_DECK_NOT_FOUND",
        "ACTIVITY_UNSUPPORTED",
        "SANITIZATION_FAILED",
        "SNAPSHOT_TOO_LARGE",
      ])
      .nullable(),
  })
  .strict();

export const communityTemplateSourceListResponseSchema = z
  .object({ items: z.array(communityTemplateSourceProjectSchema) })
  .strict();

export const publishCommunityTemplateRequestSchema = z
  .object({
    sourceProjectId: boundedIdSchema,
    title: communityTemplateTitleSchema,
    categoryId: communityTemplateCategoryIdSchema.optional(),
    category: communityTemplateCategorySchema.optional(),
    tags: communityTemplateTagNamesSchema.default([]),
    description: z.string().trim().max(300).optional(),
    rightsConfirmed: z.literal(true),
  })
  .strict()
  .refine(
    (value) => value.categoryId !== undefined || value.category !== undefined,
    { message: "대표 주제를 선택해 주세요.", path: ["categoryId"] },
  );

export const publishCommunityTemplateResponseSchema = z
  .object({ template: communityTemplateCardSchema })
  .strict();

export const updateCommunityTemplateRequestSchema = z
  .object({
    title: communityTemplateTitleSchema.optional(),
    category: communityTemplateCategorySchema.optional(),
    categoryId: communityTemplateCategoryIdSchema.optional(),
    tags: communityTemplateTagNamesSchema.optional(),
    description: z.string().trim().max(300).optional(),
  })
  .strict()
  .refine(
    (value) =>
      value.title !== undefined ||
      value.category !== undefined ||
      value.categoryId !== undefined ||
      value.tags !== undefined ||
      value.description !== undefined,
    "수정할 값을 하나 이상 입력해 주세요.",
  );

export const updateCommunityTemplateResponseSchema = z
  .object({
    templateId: communityTemplateIdSchema,
    title: communityTemplateTitleSchema,
    category: communityTemplateCategorySchema,
    description: z.string().trim().max(500),
    updatedAt: isoDateTimeSchema,
  })
  .strict();

export const unpublishCommunityTemplateResponseSchema = z
  .object({ templateId: communityTemplateIdSchema, unpublished: z.literal(true) })
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
  "COMMUNITY_TEMPLATE_ALREADY_PUBLISHED",
  "COMMUNITY_TEMPLATE_CATEGORY_NOT_FOUND",
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
export type CommunityTemplateCategoryListResponse = z.infer<
  typeof communityTemplateCategoryListResponseSchema
>;
export type CommunityTemplateTagListQuery = z.infer<
  typeof communityTemplateTagListQuerySchema
>;
export type CommunityTemplateTagListResponse = z.infer<
  typeof communityTemplateTagListResponseSchema
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
export type UpdateCommunityTemplateRequest = z.infer<
  typeof updateCommunityTemplateRequestSchema
>;
export type UpdateCommunityTemplateResponse = z.infer<
  typeof updateCommunityTemplateResponseSchema
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
