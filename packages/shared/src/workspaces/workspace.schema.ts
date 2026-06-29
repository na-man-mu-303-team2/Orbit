import { z } from "zod";

import { isoDateTimeSchema } from "../common/time.schema";

export const workspaceRoleSchema = z.enum(["owner", "editor"]);

export const workspaceSchema = z.object({
  workspaceId: z.string().min(1),
  name: z.string().min(1),
  createdBy: z.string().min(1),
  createdAt: isoDateTimeSchema,
});

export const workspaceMemberSchema = z.object({
  workspaceId: z.string().min(1),
  userId: z.string().min(1),
  role: workspaceRoleSchema,
  joinedAt: isoDateTimeSchema,
});

export const workspaceWithMembershipSchema = workspaceSchema.extend({
  role: workspaceRoleSchema,
  joinedAt: isoDateTimeSchema,
});

export const createWorkspaceRequestSchema = z.object({
  name: z.string().trim().min(1).max(120),
});

export const createWorkspaceInviteRequestSchema = z.object({
  expiresInHours: z.number().int().min(1).max(24 * 30).optional(),
});

export const workspaceInviteSchema = z.object({
  inviteId: z.string().min(1),
  workspaceId: z.string().min(1),
  createdBy: z.string().min(1),
  role: z.literal("editor"),
  expiresAt: isoDateTimeSchema,
  createdAt: isoDateTimeSchema,
});

export const workspaceInviteResponseSchema = workspaceInviteSchema.extend({
  token: z.string().min(1),
  inviteLink: z.string().min(1),
});

export const acceptWorkspaceInviteResponseSchema = z.object({
  workspace: workspaceSchema,
  membership: workspaceMemberSchema,
});

export const workspaceListResponseSchema = z.array(workspaceWithMembershipSchema);

export type WorkspaceRole = z.infer<typeof workspaceRoleSchema>;
export type Workspace = z.infer<typeof workspaceSchema>;
export type WorkspaceMember = z.infer<typeof workspaceMemberSchema>;
export type WorkspaceWithMembership = z.infer<typeof workspaceWithMembershipSchema>;
export type CreateWorkspaceRequest = z.infer<typeof createWorkspaceRequestSchema>;
export type CreateWorkspaceInviteRequest = z.infer<
  typeof createWorkspaceInviteRequestSchema
>;
export type WorkspaceInvite = z.infer<typeof workspaceInviteSchema>;
export type WorkspaceInviteResponse = z.infer<typeof workspaceInviteResponseSchema>;
export type AcceptWorkspaceInviteResponse = z.infer<
  typeof acceptWorkspaceInviteResponseSchema
>;
