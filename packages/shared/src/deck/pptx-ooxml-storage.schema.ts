import { z } from "zod";

export const PPTX_OOXML_ASSET_TRANSPORT_VERSION =
  "storage-manifest-v1" as const;

export const pptxOoxmlAssetTransportVersionSchema = z.literal(
  PPTX_OOXML_ASSET_TRANSPORT_VERSION,
);

const pptxOoxmlStorageKeySchema = z
  .string()
  .min(1)
  .max(1_024)
  .refine(
    (key) =>
      !key.startsWith("/") &&
      !/[\u0000-\u001f\u007f]/u.test(key) &&
      key
        .split("/")
        .every(
          (segment) =>
            segment !== "" && segment !== "." && segment !== "..",
        ),
    "storageKey must be a normalized relative object key",
  );

export const pptxOoxmlStoredAssetSchema = z
  .object({
    assetId: z.string().min(1).max(512),
    fileName: z.string().min(1).max(512),
    mimeType: z.string().min(1).max(255),
    storageKey: pptxOoxmlStorageKeySchema,
    size: z.number().int().positive().max(1_073_741_824),
    sha256: z.string().regex(/^[a-f0-9]{64}$/u),
  })
  .strict();

export type PptxOoxmlStoredAsset = z.infer<
  typeof pptxOoxmlStoredAssetSchema
>;
