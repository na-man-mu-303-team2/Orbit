import { z } from "zod";

import { isoDateTimeSchema } from "../common/time.schema";

export const projectSchema = z.object({
  projectId: z.string().min(1),
  workspaceId: z.string().min(1),
  title: z.string().min(1),
  createdBy: z.string().min(1),
  createdAt: isoDateTimeSchema,
});

export const createProjectRequestSchema = z.object({
  title: z.string().trim().min(1).max(120).optional(),
});

export const updateProjectRequestSchema = z
  .object({ title: z.string().trim().min(1).max(120) })
  .strict();

export const deleteProjectResponseSchema = z.object({
  projectId: z.string().min(1),
});

export const projectTagColorSchema = z.enum([
  "yellow",
  "blue",
  "green",
  "orange",
  "purple",
  "red",
]);
export const projectTagDefinitionSchema = z.object({
  name: z.lazy(() => projectTagSchema),
  color: projectTagColorSchema,
});
export const defaultProjectTagDefinition = {
  name: "중요",
  color: "yellow",
} as const;
export const userProjectTagsSchema = z
  .array(projectTagDefinitionSchema)
  .max(12)
  .refine(
    (tags) => new Set(tags.map((tag) => tag.name.toLocaleLowerCase())).size === tags.length,
    "Project tag names must be unique",
  );
export const projectTagDefinitionsResponseSchema = z.object({
  tags: userProjectTagsSchema,
});
export const createProjectTagDefinitionRequestSchema = projectTagDefinitionSchema.strict();
export const projectTagSchema = z.string().trim().min(1).max(20);
export const projectTagsSchema = z
  .array(projectTagSchema)
  .max(12)
  .refine((tags) => new Set(tags).size === tags.length, {
    message: "Project tags must be unique",
  });

export const projectGenerationSummarySchema = z.object({
  jobId: z.string().min(1),
  status: z.enum(["queued", "running"]),
  progress: z.number().int().min(0).max(100),
  message: z.string(),
});

export const projectListItemSchema = projectSchema.extend({
  isPinned: z.boolean(),
  pinnedAt: isoDateTimeSchema.nullable(),
  tags: projectTagsSchema,
  generation: projectGenerationSummarySchema.nullable(),
});

export const projectListSortSchema = z.enum(["latest", "oldest", "name"]);
export const projectListFilterSchema = z.enum([
  "all",
  "presentation",
  "draft",
  "shared",
  "pinned",
]);
export const projectPageRequestSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(6),
  query: z.string().trim().max(100).default(""),
  sort: projectListSortSchema.default("latest"),
  filter: projectListFilterSchema.default("all"),
  tags: z.preprocess(
    (value) => {
      if (Array.isArray(value)) return value;
      if (typeof value === "string" && value.length > 0) return value.split(",");
      return [];
    },
    projectTagsSchema,
  ),
});
export const projectPageResponseSchema = z.object({
  items: z.array(projectListItemSchema),
  total: z.number().int().min(0),
  page: z.number().int().min(1),
  limit: z.number().int().min(1),
  hasMore: z.boolean(),
});

export const updateProjectPinRequestSchema = z
  .object({ isPinned: z.boolean() })
  .strict();

export const updateProjectPinResponseSchema = z.object({
  projectId: z.string().min(1),
  isPinned: z.boolean(),
  pinnedAt: isoDateTimeSchema.nullable(),
});

export const updateProjectTagsRequestSchema = z
  .object({ tags: projectTagsSchema })
  .strict();

export const updateProjectTagsResponseSchema = z.object({
  projectId: z.string().min(1),
  tags: projectTagsSchema,
});

export const projectMemberRoleSchema = z.enum(["owner", "editor", "viewer"]);
export const projectMemberStatusSchema = z.enum([
  "pending",
  "accepted",
  "rejected",
]);
export const projectMemberSchema = z.object({
  userId: z.string().min(1),
  email: z.string().email(),
  role: projectMemberRoleSchema,
  status: projectMemberStatusSchema,
  createdAt: isoDateTimeSchema,
});
export const projectAccessResponseSchema = z.object({
  project: projectSchema,
  membership: z
    .object({
      role: projectMemberRoleSchema,
      status: projectMemberStatusSchema,
    })
    .nullable(),
});
export const projectApiErrorCodeSchema = z.enum([
  "PROJECT_ACCESS_UNAVAILABLE",
  "PROJECT_MEMBERS_UNAVAILABLE",
  "PROJECT_SCHEMA_NOT_READY",
]);
export const projectApiErrorSchema = z.object({
  code: projectApiErrorCodeSchema,
  message: z.string().min(1),
  details: z.array(z.string()).default([]),
});
export const projectMembersResponseSchema = z.object({
  members: z.array(projectMemberSchema),
  requests: z.array(projectMemberSchema),
});
export const upsertProjectMemberRequestSchema = z.object({
  email: z.string().trim().email().transform((email) => email.toLowerCase()),
  role: z.enum(["editor", "viewer"]),
});
export const createProjectAccessRequestSchema = z.object({
  role: z.enum(["editor", "viewer"]),
});
export const updateProjectMemberRoleRequestSchema = z.object({
  role: projectMemberRoleSchema,
});
export const updateProjectMemberStatusRequestSchema = z.object({
  status: z.enum(["accepted", "rejected"]),
});

export const projectListResponseSchema = z.array(projectListItemSchema);

export type Project = z.infer<typeof projectSchema>;
export type ProjectListItem = z.infer<typeof projectListItemSchema>;
export type ProjectGenerationSummary = z.infer<typeof projectGenerationSummarySchema>;
export type ProjectTag = z.infer<typeof projectTagSchema>;
export type ProjectTagColor = z.infer<typeof projectTagColorSchema>;
export type ProjectTagDefinition = z.infer<typeof projectTagDefinitionSchema>;
export type ProjectTagDefinitionsResponse = z.infer<typeof projectTagDefinitionsResponseSchema>;
export type CreateProjectTagDefinitionRequest = z.infer<typeof createProjectTagDefinitionRequestSchema>;
export type ProjectListSort = z.infer<typeof projectListSortSchema>;
export type ProjectListFilter = z.infer<typeof projectListFilterSchema>;
export type ProjectPageRequest = z.infer<typeof projectPageRequestSchema>;
export type ProjectPageResponse = z.infer<typeof projectPageResponseSchema>;
export type CreateProjectRequest = z.infer<typeof createProjectRequestSchema>;
export type UpdateProjectRequest = z.infer<typeof updateProjectRequestSchema>;
export type DeleteProjectResponse = z.infer<typeof deleteProjectResponseSchema>;
export type UpdateProjectPinRequest = z.infer<typeof updateProjectPinRequestSchema>;
export type UpdateProjectPinResponse = z.infer<typeof updateProjectPinResponseSchema>;
export type UpdateProjectTagsRequest = z.infer<typeof updateProjectTagsRequestSchema>;
export type UpdateProjectTagsResponse = z.infer<typeof updateProjectTagsResponseSchema>;
export type ProjectMemberRole = z.infer<typeof projectMemberRoleSchema>;
export type ProjectMemberStatus = z.infer<typeof projectMemberStatusSchema>;
export type ProjectMember = z.infer<typeof projectMemberSchema>;
export type ProjectAccessResponse = z.infer<typeof projectAccessResponseSchema>;
export type ProjectApiErrorCode = z.infer<typeof projectApiErrorCodeSchema>;
export type ProjectApiError = z.infer<typeof projectApiErrorSchema>;
export type ProjectMembersResponse = z.infer<typeof projectMembersResponseSchema>;
export type UpsertProjectMemberRequest = z.infer<typeof upsertProjectMemberRequestSchema>;
export type CreateProjectAccessRequest = z.infer<typeof createProjectAccessRequestSchema>;
export type UpdateProjectMemberRoleRequest = z.infer<typeof updateProjectMemberRoleRequestSchema>;
export type UpdateProjectMemberStatusRequest = z.infer<typeof updateProjectMemberStatusRequestSchema>;
