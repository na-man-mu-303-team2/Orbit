import { z } from "zod";

import { isoDateTimeSchema } from "../common/time.schema";

export const filePurposeSchema = z.enum([
  "pptx-import",
  "reference-material",
  "rehearsal-audio",
  "export-result",
  "report-result",
  "thumbnail"
]);

export const uploadedFileSchema = z.object({
  fileId: z.string().min(1),
  projectId: z.string().min(1),
  originalName: z.string().min(1),
  mimeType: z.string().min(1),
  size: z.number().int().nonnegative(),
  url: z.string().min(1),
  purpose: filePurposeSchema,
  createdAt: isoDateTimeSchema
});

export type FilePurpose = z.infer<typeof filePurposeSchema>;
export type UploadedFile = z.infer<typeof uploadedFileSchema>;
