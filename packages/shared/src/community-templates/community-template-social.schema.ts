import { z } from "zod";

import { isoDateTimeSchema } from "../common/time.schema";
import {
  communityTemplateCategorySchema,
  communityTemplateIdSchema,
  communityTemplateSnapshotSchema,
} from "./community-template.schema";
import { communityTemplateCardSchema } from "./community-template-api.schema";

const boundedUserIdSchema = z.string().trim().min(1).max(200);

export const communityTemplateSortSchema = z.enum([
  "popular",
  "latest",
  "recommended",
  "views",
  "likes",
]);

export const communityTemplateAuthorSchema = z
  .object({
    userId: boundedUserIdSchema,
    displayName: z.string().trim().min(1).max(20),
    avatarUrl: z.string().trim().max(500).nullable(),
  })
  .strict();

export const communityTemplateStatsSchema = z
  .object({
    likeCount: z.number().int().nonnegative(),
    viewCount: z.number().int().nonnegative(),
    shareCount: z.number().int().nonnegative(),
    commentCount: z.number().int().nonnegative(),
    useCount: z.number().int().nonnegative(),
  })
  .strict();

export const communityTemplateDiscoverQuerySchema = z
  .object({
    query: z.string().trim().max(60).optional(),
    category: communityTemplateCategorySchema.optional(),
    sort: communityTemplateSortSchema.default("popular"),
    page: z.coerce.number().int().positive().default(1),
    limit: z.coerce.number().int().positive().max(48).default(18),
  })
  .strict();

export const communityTemplateDiscoverCardSchema = communityTemplateCardSchema
  .extend({
    description: z.string().trim().max(500),
    author: communityTemplateAuthorSchema,
    stats: communityTemplateStatsSchema,
    likedByMe: z.boolean(),
  })
  .strict();

export const communityTemplateDiscoverResponseSchema = z
  .object({
    items: z.array(communityTemplateDiscoverCardSchema),
    page: z.number().int().positive(),
    hasMore: z.boolean(),
  })
  .strict();

export const communityTemplateDetailSchema = communityTemplateDiscoverCardSchema
  .extend({
    snapshot: communityTemplateSnapshotSchema,
    ownedByMe: z.boolean(),
  })
  .strict();

export const communityTemplateEngagementResponseSchema = z
  .object({
    templateId: communityTemplateIdSchema,
    stats: communityTemplateStatsSchema,
    likedByMe: z.boolean(),
  })
  .strict();

export const communityTemplateCommentIdSchema = z
  .string()
  .regex(/^community_comment_[A-Za-z0-9_-]+$/)
  .max(200);

export const communityTemplateCommentBodySchema = z
  .string()
  .trim()
  .min(1)
  .max(500)
  .refine(
    (value) => !/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u.test(value),
    "댓글에 허용되지 않는 제어 문자가 포함되어 있습니다.",
  );

export const communityTemplateCommentMutationSchema = z
  .object({ body: communityTemplateCommentBodySchema })
  .strict();

export const communityTemplateCommentListQuerySchema = z
  .object({
    page: z.coerce.number().int().positive().default(1),
    limit: z.coerce.number().int().positive().max(50).default(20),
  })
  .strict();

export const communityTemplateCommentSchema = z
  .object({
    commentId: communityTemplateCommentIdSchema,
    templateId: communityTemplateIdSchema,
    body: communityTemplateCommentBodySchema,
    author: communityTemplateAuthorSchema,
    ownedByMe: z.boolean(),
    createdAt: isoDateTimeSchema,
    updatedAt: isoDateTimeSchema,
  })
  .strict();

export const communityTemplateCommentListResponseSchema = z
  .object({
    items: z.array(communityTemplateCommentSchema),
    page: z.number().int().positive(),
    hasMore: z.boolean(),
  })
  .strict();

export const communityTemplateCommentResponseSchema = z
  .object({ comment: communityTemplateCommentSchema })
  .strict();

export const communityTemplateReportIdSchema = z
  .string()
  .regex(/^community_report_[A-Za-z0-9_-]+$/)
  .max(200);

export const communityTemplateReportReasonSchema = z.enum([
  "copyright",
  "spam",
  "harassment",
  "inappropriate",
  "other",
]);

export const communityTemplateReportStatusSchema = z.enum([
  "open",
  "reviewing",
  "resolved",
  "dismissed",
]);

const communityTemplateReportTextSchema = z
  .string()
  .trim()
  .max(500)
  .refine(
    (value) => !/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u.test(value),
    "허용되지 않는 제어 문자가 포함되어 있습니다.",
  );

export const createCommunityTemplateReportRequestSchema = z
  .object({
    reason: communityTemplateReportReasonSchema,
    details: communityTemplateReportTextSchema.optional(),
  })
  .strict();

export const createCommunityTemplateReportResponseSchema = z
  .object({
    reportId: communityTemplateReportIdSchema,
    status: communityTemplateReportStatusSchema,
    createdAt: isoDateTimeSchema,
  })
  .strict();

export const communityTemplateModerationQuerySchema = z
  .object({
    status: communityTemplateReportStatusSchema.optional(),
    page: z.coerce.number().int().positive().default(1),
    limit: z.coerce.number().int().positive().max(50).default(20),
  })
  .strict();

export const communityTemplateReportSchema = z
  .object({
    reportId: communityTemplateReportIdSchema,
    template: communityTemplateCardSchema,
    reporter: communityTemplateAuthorSchema,
    reason: communityTemplateReportReasonSchema,
    details: communityTemplateReportTextSchema,
    status: communityTemplateReportStatusSchema,
    resolutionNote: communityTemplateReportTextSchema.nullable(),
    createdAt: isoDateTimeSchema,
    updatedAt: isoDateTimeSchema,
  })
  .strict();

export const communityTemplateModerationListResponseSchema = z
  .object({
    items: z.array(communityTemplateReportSchema),
    page: z.number().int().positive(),
    hasMore: z.boolean(),
  })
  .strict();

export const updateCommunityTemplateReportRequestSchema = z
  .object({
    status: communityTemplateReportStatusSchema,
    resolutionNote: communityTemplateReportTextSchema.optional(),
    hideTemplate: z.boolean().default(false),
  })
  .strict();

export const updateCommunityTemplateReportResponseSchema = z
  .object({ report: communityTemplateReportSchema })
  .strict();

export type CommunityTemplateSort = z.infer<typeof communityTemplateSortSchema>;
export type CommunityTemplateAuthor = z.infer<typeof communityTemplateAuthorSchema>;
export type CommunityTemplateStats = z.infer<typeof communityTemplateStatsSchema>;
export type CommunityTemplateDiscoverQuery = z.infer<typeof communityTemplateDiscoverQuerySchema>;
export type CommunityTemplateDiscoverCard = z.infer<typeof communityTemplateDiscoverCardSchema>;
export type CommunityTemplateDiscoverResponse = z.infer<typeof communityTemplateDiscoverResponseSchema>;
export type CommunityTemplateDetail = z.infer<typeof communityTemplateDetailSchema>;
export type CommunityTemplateEngagementResponse = z.infer<typeof communityTemplateEngagementResponseSchema>;
export type CommunityTemplateComment = z.infer<typeof communityTemplateCommentSchema>;
export type CommunityTemplateCommentListQuery = z.infer<typeof communityTemplateCommentListQuerySchema>;
export type CommunityTemplateReportReason = z.infer<typeof communityTemplateReportReasonSchema>;
export type CommunityTemplateReportStatus = z.infer<typeof communityTemplateReportStatusSchema>;
export type CreateCommunityTemplateReportRequest = z.infer<typeof createCommunityTemplateReportRequestSchema>;
export type CommunityTemplateModerationQuery = z.infer<typeof communityTemplateModerationQuerySchema>;
export type UpdateCommunityTemplateReportRequest = z.infer<typeof updateCommunityTemplateReportRequestSchema>;
