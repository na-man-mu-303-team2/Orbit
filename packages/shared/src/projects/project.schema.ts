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

export const projectMemberRoleSchema = z.enum(["owner", "editor", "viewer"]);
export const projectMemberStatusSchema = z.enum([
  "pending",
  "accepted",
  "rejected",
]);

export const projectAccessRequestSchema = z.object({
  role: z.enum(["editor", "viewer"]),
});

export const projectMemberInviteSchema = z.object({
  email: z.string().trim().email(),
  role: projectMemberRoleSchema,
});

export const projectMemberUpdateSchema = z.object({
  role: projectMemberRoleSchema.optional(),
  status: projectMemberStatusSchema.optional(),
});

export const projectMemberSchema = z.object({
  projectId: z.string().min(1),
  userId: z.string().min(1),
  role: projectMemberRoleSchema,
  status: projectMemberStatusSchema,
  createdAt: isoDateTimeSchema,
});

export const projectShareMemberSchema = projectMemberSchema.extend({
  email: z.string().email().nullable(),
});

export const projectShareStateSchema = z.object({
  currentMember: projectShareMemberSchema.nullable(),
  members: z.array(projectShareMemberSchema),
  requests: z.array(projectShareMemberSchema),
});

export const projectListResponseSchema = z.array(projectSchema);

export type Project = z.infer<typeof projectSchema>;
export type CreateProjectRequest = z.infer<typeof createProjectRequestSchema>;
export type ProjectAccessRequest = z.infer<typeof projectAccessRequestSchema>;
export type ProjectMemberInvite = z.infer<typeof projectMemberInviteSchema>;
export type ProjectMemberUpdate = z.infer<typeof projectMemberUpdateSchema>;
export type ProjectMember = z.infer<typeof projectMemberSchema>;
export type ProjectShareMember = z.infer<typeof projectShareMemberSchema>;
export type ProjectShareState = z.infer<typeof projectShareStateSchema>;
export type ProjectMemberRole = z.infer<typeof projectMemberRoleSchema>;
export type ProjectMemberStatus = z.infer<typeof projectMemberStatusSchema>;
