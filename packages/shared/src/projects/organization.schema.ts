import { z } from "zod";

import { isoDateTimeSchema } from "../common/time.schema";

export const organizationRoleSchema = z.enum(["admin", "member"]);

export const organizationSchema = z.object({
  id: z.string().trim().min(1),
  name: z.string().trim().min(1).max(120),
  createdBy: z.string().trim().min(1),
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema
});

export const organizationMembershipSchema = z.object({
  organizationId: z.string().trim().min(1),
  userId: z.string().trim().min(1),
  role: organizationRoleSchema,
  createdAt: isoDateTimeSchema
});

export const createOrganizationRequestSchema = z.object({
  name: z.string().trim().min(1).max(120)
});

export const addOrganizationMemberRequestSchema = z.object({
  email: z.string().trim().email().transform((value) => value.toLowerCase()),
  role: organizationRoleSchema.default("member")
});

export const organizationListResponseSchema = z.object({
  organizations: z.array(
    organizationSchema.extend({ role: organizationRoleSchema })
  )
});

export type Organization = z.infer<typeof organizationSchema>;
export type OrganizationRole = z.infer<typeof organizationRoleSchema>;
export type OrganizationMembership = z.infer<
  typeof organizationMembershipSchema
>;
