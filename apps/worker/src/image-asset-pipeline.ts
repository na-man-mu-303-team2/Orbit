import type {
  GeneratedImageProvider,
  ImageAssetCandidate,
  PublicImageSearchProvider
} from "@orbit/ai";
import {
  deckSchema,
  type BrandKitSnapshot,
  type Deck,
  type Slide
} from "@orbit/shared";
import type { StoragePort } from "@orbit/storage";
import { randomUUID } from "node:crypto";
import type { DataSource } from "typeorm";

export type ImageAssetRuntime = {
  generated?: GeneratedImageProvider;
  publicSearch?: PublicImageSearchProvider;
  maxPerDeck: number;
  maxPerUserPerDay: number;
  maxPerOrganizationPerDay: number;
};

export type ImageAssetScope = {
  userId: string;
  organizationId?: string;
};

type StoredAssetRow = {
  file_id: string;
  project_id: string;
  storage_key: string;
  original_name: string;
  mime_type: string;
  size: number;
};

export async function applyBrandKitLogoAsset(
  dataSource: DataSource,
  storage: Pick<StoragePort, "getSignedReadUrl" | "putObject">,
  deck: Deck,
  brandKit: BrandKitSnapshot
): Promise<{ deck: Deck; warnings: string[] }> {
  const sourceFileId = brandKit.values.logoAssetId;
  if (!sourceFileId) return { deck, warnings: [] };

  try {
    const rows = (await dataSource.query(
      `
        SELECT file_id, project_id, storage_key, original_name, mime_type, size
        FROM project_assets
        WHERE file_id = $1 AND status = 'uploaded'
        LIMIT 1
      `,
      [sourceFileId]
    )) as StoredAssetRow[];
    const source = rows[0];
    if (!source) throw new Error("Brand Kit logo asset is unavailable");
    if (!["image/png", "image/jpeg", "image/webp"].includes(source.mime_type)) {
      throw new Error(`Unsupported Brand Kit logo MIME type: ${source.mime_type}`);
    }

    let fileId = source.file_id;
    if (source.project_id !== deck.projectId) {
      const readUrl = await storage.getSignedReadUrl(source.storage_key);
      const response = await fetch(readUrl, {
        signal: AbortSignal.timeout(30_000)
      });
      if (!response.ok) throw new Error("Brand Kit logo asset content is unavailable");
      const body = new Uint8Array(await response.arrayBuffer());
      assertCandidate(
        {
          body,
          mimeType: source.mime_type as ImageAssetCandidate["mimeType"],
          fileName: source.original_name,
          provider: "brand-kit"
        },
        "brand-kit"
      );
      fileId = await copyBrandKitAsset(
        dataSource,
        storage,
        deck.projectId,
        source,
        body
      );
    }

    return {
      deck: deckSchema.parse(addBrandKitLogoElements(deck, fileId, brandKit)),
      warnings: []
    };
  } catch (error) {
    return {
      deck,
      warnings: [`Brand Kit logo fallback: ${safeErrorMessage(error)}`]
    };
  }
}

export async function resolveDeckImageAssets(
  dataSource: DataSource,
  storage: Pick<StoragePort, "putObject">,
  deck: Deck,
  runtime: ImageAssetRuntime,
  scope: ImageAssetScope
): Promise<{ deck: Deck; warnings: string[] }> {
  const warnings: string[] = [];
  const candidates = deck.slides.filter(isResolvableImageSlide);
  const selected = candidates.slice(0, Math.max(0, runtime.maxPerDeck));
  if (candidates.length > selected.length) {
    warnings.push(
      `Image asset limit retained placeholders on ${candidates.length - selected.length} slide(s).`
    );
  }

  const remaining = await remainingDailyBudget(dataSource, runtime, scope);
  const budgeted = selected.slice(0, remaining);
  if (selected.length > budgeted.length) {
    warnings.push("Daily image asset budget retained remaining placeholders.");
  }

  let resolvedDeck = deck;
  for (const slide of budgeted) {
    const policy = slide.aiNotes?.visualPlan?.imageSourcePolicy;
    if (policy !== "ai-generated" && policy !== "public-assets") continue;
    const provider =
      policy === "ai-generated" ? runtime.generated : runtime.publicSearch;
    if (!provider) {
      warnings.push(`Image provider is disabled for ${policy}.`);
      continue;
    }

    try {
      const prompt = imagePrompt(deck, slide);
      const asset = await retryImageRequest(
        async () => {
          const candidate =
            policy === "ai-generated"
              ? await (provider as GeneratedImageProvider).generate({
                  prompt,
                  abortSignal: AbortSignal.timeout(60_000)
                })
              : await searchPublicImage(
                  provider as PublicImageSearchProvider,
                  publicImageQueries(deck, slide)
                );
          assertCandidate(candidate, policy);
          return candidate;
        },
        1
      );
      const stored = await storeImageAsset(
        dataSource,
        storage,
        deck.projectId,
        asset,
        scope
      );
      resolvedDeck = replaceSlideImagePlaceholder(
        resolvedDeck,
        slide.slideId,
        stored.url,
        stored.fileId,
        asset
      );
    } catch (error) {
      warnings.push(
        `Image asset fallback retained for slide ${slide.order}: ${safeErrorMessage(error)}`
      );
    }
  }

  return { deck: deckSchema.parse(resolvedDeck), warnings };
}

function isResolvableImageSlide(slide: Slide) {
  const plan = slide.aiNotes?.visualPlan;
  return (
    plan?.imageNeeded === true &&
    ["ai-generated", "public-assets"].includes(plan.imageSourcePolicy) &&
    slide.elements.some(
      (element) =>
        element.role === "media" &&
        element.elementId.endsWith("_media_placeholder")
    )
  );
}

async function remainingDailyBudget(
  dataSource: DataSource,
  runtime: ImageAssetRuntime,
  scope: ImageAssetScope
) {
  const rows = (await dataSource.query(
    `
      SELECT
        count(*) FILTER (WHERE generated_for_user_id = $1) AS user_count,
        count(*) FILTER (WHERE generated_for_organization_id = $2) AS organization_count
      FROM project_assets
      WHERE created_at >= date_trunc('day', now())
        AND asset_provider IS NOT NULL
        AND asset_provider <> 'brand-kit'
    `,
    [scope.userId, scope.organizationId ?? null]
  )) as Array<{ user_count: string | number; organization_count: string | number }>;
  const userRemaining = Math.max(
    0,
    runtime.maxPerUserPerDay - Number(rows[0]?.user_count ?? 0)
  );
  const organizationRemaining = scope.organizationId
    ? Math.max(
        0,
        runtime.maxPerOrganizationPerDay - Number(rows[0]?.organization_count ?? 0)
      )
    : Number.POSITIVE_INFINITY;
  return Math.min(userRemaining, organizationRemaining);
}

async function copyBrandKitAsset(
  dataSource: DataSource,
  storage: Pick<StoragePort, "putObject">,
  projectId: string,
  source: StoredAssetRow,
  body: Uint8Array
) {
  const fileId = `file_${randomUUID()}`;
  const originalName = safeStorageName(source.original_name);
  const storageKey = `projects/${projectId}/assets/${fileId}-${originalName}`;
  const url = createAssetContentUrl(projectId, fileId);
  await storage.putObject({
    key: storageKey,
    body,
    contentType: source.mime_type,
    purpose: "design-asset"
  });
  await dataSource.query(
    `
      INSERT INTO project_assets (
        file_id, project_id, storage_key, original_name, mime_type, size, url,
        purpose, status, created_at, uploaded_at, deleted_at, asset_provider
      )
      VALUES (
        $1, $2, $3, $4, $5, $6, $7,
        'design-asset', 'uploaded', now(), now(), null, 'brand-kit'
      )
    `,
    [
      fileId,
      projectId,
      storageKey,
      originalName,
      source.mime_type,
      body.byteLength,
      url
    ]
  );
  return fileId;
}

function addBrandKitLogoElements(
  deck: Deck,
  fileId: string,
  brandKit: BrandKitSnapshot
): Deck {
  const src = createAssetContentUrl(deck.projectId, fileId);
  const locked = brandKit.values.lockedFields.includes("logo");
  return {
    ...deck,
    slides: deck.slides.map((slide) => {
      const elementId = `el_${slide.slideId}_brand_kit_logo`;
      const existing = slide.elements.find((element) => element.elementId === elementId);
      if (existing) return slide;
      return {
        ...slide,
        elements: [
          ...slide.elements,
          {
            elementId,
            type: "image" as const,
            role: "footer" as const,
            x: 1600,
            y: 88,
            width: 200,
            height: 64,
            rotation: 0,
            opacity: 1,
            zIndex: Math.max(0, ...slide.elements.map((element) => element.zIndex)) + 1,
            locked,
            visible: true,
            props: {
              src,
              alt: `${brandKit.name} logo`,
              fit: "contain" as const,
              focusX: 0.5,
              focusY: 0.5
            }
          }
        ]
      };
    })
  };
}

async function retryImageRequest<T>(operation: () => Promise<T>, retries: number) {
  let lastError: unknown;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError;
}

function assertCandidate(asset: ImageAssetCandidate, policy: string) {
  if (asset.body.byteLength === 0 || asset.body.byteLength > 12 * 1024 * 1024) {
    throw new Error("Image asset size is outside the allowed range");
  }
  if (!["image/png", "image/jpeg", "image/webp"].includes(asset.mimeType)) {
    throw new Error(`Unsupported image MIME type: ${asset.mimeType}`);
  }
  if (policy === "public-assets" && (!asset.sourceUrl || !asset.license)) {
    throw new Error("Public image source and license are required");
  }
  const dimensions = imageDimensions(asset.body, asset.mimeType);
  if (!dimensions || dimensions.width < 640 || dimensions.height < 360) {
    throw new Error("Image resolution must be at least 640x360");
  }
}

function imageDimensions(
  body: Uint8Array,
  mimeType: ImageAssetCandidate["mimeType"]
) {
  const view = new DataView(body.buffer, body.byteOffset, body.byteLength);
  if (mimeType === "image/png" && body.byteLength >= 24) {
    return { width: view.getUint32(16), height: view.getUint32(20) };
  }
  if (mimeType === "image/jpeg") {
    let offset = 2;
    while (offset + 8 < body.byteLength) {
      if (body[offset] !== 0xff) break;
      const marker = body[offset + 1];
      const length = view.getUint16(offset + 2);
      if ([0xc0, 0xc1, 0xc2, 0xc3].includes(marker)) {
        return {
          height: view.getUint16(offset + 5),
          width: view.getUint16(offset + 7)
        };
      }
      if (length < 2) break;
      offset += length + 2;
    }
  }
  if (
    mimeType === "image/webp" &&
    body.byteLength >= 30 &&
    String.fromCharCode(...body.slice(12, 16)) === "VP8X"
  ) {
    return {
      width: 1 + body[24] + (body[25] << 8) + (body[26] << 16),
      height: 1 + body[27] + (body[28] << 8) + (body[29] << 16)
    };
  }
  return null;
}

async function storeImageAsset(
  dataSource: DataSource,
  storage: Pick<StoragePort, "putObject">,
  projectId: string,
  asset: ImageAssetCandidate,
  scope: ImageAssetScope
) {
  const fileId = `file_${randomUUID()}`;
  const originalName = safeStorageName(asset.fileName);
  const storageKey = `projects/${projectId}/assets/${fileId}-${originalName}`;
  const url = createAssetContentUrl(projectId, fileId);
  await storage.putObject({
    key: storageKey,
    body: asset.body,
    contentType: asset.mimeType,
    purpose: "design-asset"
  });
  await dataSource.query(
    `
      INSERT INTO project_assets (
        file_id, project_id, storage_key, original_name, mime_type, size, url,
        purpose, status, created_at, uploaded_at, deleted_at,
        source_url, author, license, license_checked_at, asset_provider,
        generation_prompt, generated_for_user_id, generated_for_organization_id
      )
      VALUES (
        $1, $2, $3, $4, $5, $6, $7,
        'design-asset', 'uploaded', now(), now(), null,
        $8, $9, $10, $11, $12, $13, $14, $15
      )
    `,
    [
      fileId,
      projectId,
      storageKey,
      originalName,
      asset.mimeType,
      asset.body.byteLength,
      url,
      asset.sourceUrl ?? null,
      asset.author ?? null,
      asset.license ?? null,
      asset.checkedAt ? new Date(asset.checkedAt) : null,
      asset.provider,
      asset.generationPrompt ?? null,
      scope.userId,
      scope.organizationId ?? null
    ]
  );
  return { fileId, url };
}

function replaceSlideImagePlaceholder(
  deck: Deck,
  slideId: string,
  url: string,
  fileId: string,
  asset: ImageAssetCandidate
): Deck {
  return {
    ...deck,
    slides: deck.slides.map((slide) => {
      if (slide.slideId !== slideId) return slide;
      const placeholder = slide.elements.find(
        (element) =>
          element.role === "media" &&
          element.elementId.endsWith("_media_placeholder")
      );
      if (!placeholder) return slide;
      const plan = slide.aiNotes?.visualPlan;
      return {
        ...slide,
        elements: [
          ...slide.elements.filter(
            (element) =>
              element.elementId !== placeholder.elementId &&
              !element.elementId.endsWith("_media_caption")
          ),
          {
            ...placeholder,
            elementId: placeholder.elementId.replace(
              /_media_placeholder$/,
              "_media_asset"
            ),
            type: "image" as const,
            props: {
              src: url,
              alt: plan?.imageAlt ?? plan?.reason ?? slide.title,
              fit: "cover" as const,
              focusX: 0.5,
              focusY: 0.5
            }
          }
        ],
        aiNotes: slide.aiNotes
          ? {
              ...slide.aiNotes,
              visualPlan: plan
                ? {
                    ...plan,
                    asset: {
                      fileId,
                      provider: asset.provider,
                      ...(asset.sourceUrl ? { sourceUrl: asset.sourceUrl } : {}),
                      ...(asset.author ? { author: asset.author } : {}),
                      ...(asset.license ? { license: asset.license } : {}),
                      ...(asset.checkedAt ? { checkedAt: asset.checkedAt } : {})
                    }
                  }
                : undefined
            }
          : undefined
      };
    })
  };
}

function imagePrompt(deck: Deck, slide: Slide) {
  const plan = slide.aiNotes?.visualPlan;
  if (plan?.imagePrompt?.trim()) {
    return `${plan.imagePrompt.trim()}. Presentation visual, no text, clear focal subject.`;
  }
  const reason = plan?.reason ?? "support the key message";
  return `${deck.title}. ${slide.title}. ${reason}. Presentation visual, no text, clear focal subject.`;
}

async function searchPublicImage(
  provider: PublicImageSearchProvider,
  queries: string[]
) {
  let lastError: unknown;
  for (const query of queries) {
    try {
      const candidate = await provider.search({
        query,
        abortSignal: AbortSignal.timeout(30_000)
      });
      assertCandidate(candidate, "public-assets");
      return candidate;
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError ?? new Error("Public image search produced no query");
}

function publicImageQueries(deck: Deck, slide: Slide) {
  return [
    slide.aiNotes?.visualPlan?.imagePrompt ?? "",
    slide.aiNotes?.visualPlan?.imageAlt ?? "",
    slide.title,
    `${deck.title} ${slide.title}`
  ]
    .map((query) => query.replace(/\s+/g, " ").trim().slice(0, 120))
    .filter((query, index, values) => query && values.indexOf(query) === index);
}

function safeStorageName(value: string) {
  return (value || "image-asset.png").replace(/[^a-zA-Z0-9._-]/g, "_");
}

function createAssetContentUrl(projectId: string, fileId: string) {
  return `/api/v1/projects/${encodeURIComponent(projectId)}/assets/${encodeURIComponent(fileId)}/content`;
}

function safeErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Image provider failed";
}
