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

export const projectListResponseSchema = z.array(projectSchema);

export type Project = z.infer<typeof projectSchema>;
export type CreateProjectRequest = z.infer<typeof createProjectRequestSchema>;
