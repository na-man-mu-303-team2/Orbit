import type {
  GeneratedImageProvider,
  ImageAssetCandidate,
  PublicImageSearchProvider
} from "./index";

const maxImageBytes = 12 * 1024 * 1024;

export class OpenAiGeneratedImageProvider implements GeneratedImageProvider {
  constructor(
    private readonly apiKey: string,
    private readonly model = "gpt-image-1"
  ) {}

  async generate(input: {
    prompt: string;
    abortSignal?: AbortSignal;
  }): Promise<ImageAssetCandidate> {
    const response = await fetch("https://api.openai.com/v1/images/generations", {
      method: "POST",
      headers: {
        authorization: `Bearer ${this.apiKey}`,
        "content-type": "application/json"
      },
      body: JSON.stringify({
        model: this.model,
        prompt: input.prompt,
        size: "1536x1024",
        quality: "medium",
        output_format: "png"
      }),
      signal: input.abortSignal
    });
    if (!response.ok) {
      throw new Error(`OpenAI image generation failed with status ${response.status}`);
    }
    const payload = (await response.json()) as {
      data?: Array<{ b64_json?: string }>;
    };
    const encoded = payload.data?.[0]?.b64_json;
    if (!encoded) throw new Error("OpenAI image generation returned no image data");
    const body = Uint8Array.from(Buffer.from(encoded, "base64"));
    assertImageSize(body);
    return {
      body,
      mimeType: "image/png",
      fileName: "ai-generated.png",
      provider: "openai",
      checkedAt: new Date().toISOString(),
      generationPrompt: input.prompt
    };
  }
}

type OpenverseImage = {
  url?: string;
  thumbnail?: string;
  width?: number;
  height?: number;
  creator?: string;
  license?: string;
  license_url?: string;
  foreign_landing_url?: string;
  title?: string;
  tags?: Array<string | { name?: string }>;
};

export class OpenversePublicImageSearchProvider
  implements PublicImageSearchProvider
{
  async search(input: {
    query: string;
    abortSignal?: AbortSignal;
  }): Promise<ImageAssetCandidate> {
    const searchUrl = new URL("https://api.openverse.org/v1/images/");
    searchUrl.searchParams.set("q", input.query);
    searchUrl.searchParams.set("page_size", "20");
    searchUrl.searchParams.set("size", "large,medium");
    searchUrl.searchParams.set("aspect_ratio", "wide");
    const response = await fetch(searchUrl, { signal: input.abortSignal });
    if (!response.ok) {
      throw new Error(`Openverse image search failed with status ${response.status}`);
    }
    const payload = (await response.json()) as { results?: OpenverseImage[] };
    const candidates = (payload.results ?? []).filter(
      (item) =>
        (item.url || item.thumbnail) &&
        item.license &&
        item.foreign_landing_url &&
        (!item.width || !item.height || (item.width >= 640 && item.height >= 360)) &&
        isRelevantOpenverseCandidate(input.query, item)
    );
    if (candidates.length === 0) {
      throw new Error("Openverse returned no licensed image candidate");
    }

    let lastError: unknown;
    for (const candidate of candidates.slice(0, 5)) {
      for (const imageUrl of uniqueUrls(candidate.url, candidate.thumbnail)) {
        try {
          const imageResponse = await fetch(imageUrl, {
            signal: input.abortSignal,
            headers: { accept: "image/*" }
          });
          if (!imageResponse.ok) {
            throw new Error(
              `Public image download failed with status ${imageResponse.status}`
            );
          }
          const mimeType = supportedImageMimeType(
            imageResponse.headers.get("content-type")
          );
          const body = new Uint8Array(await imageResponse.arrayBuffer());
          assertImageSize(body);
          return {
            body,
            mimeType,
            fileName: fileNameForMime(candidate.title || "public-image", mimeType),
            provider: "openverse",
            sourceUrl: candidate.foreign_landing_url,
            author: candidate.creator?.trim() || "Unknown creator",
            license: candidate.license_url || candidate.license,
            checkedAt: new Date().toISOString()
          };
        } catch (error) {
          lastError = error;
        }
      }
    }
    throw lastError ?? new Error("Openverse image candidates were unavailable");
  }
}

const relevanceStopWords = new Set([
  "and",
  "clear",
  "diagram",
  "image",
  "media",
  "presentation",
  "showing",
  "the",
  "visual",
  "with"
]);

function isRelevantOpenverseCandidate(query: string, candidate: OpenverseImage) {
  const queryTokens = relevantTokens(query);
  const candidateTokens = relevantTokens(
    [
      candidate.title,
      ...(candidate.tags ?? []).map((tag) =>
        typeof tag === "string" ? tag : tag.name
      )
    ]
      .filter(Boolean)
      .join(" ")
  );
  return queryTokens.some((queryToken) =>
    candidateTokens.some(
      (candidateToken) =>
        queryToken === candidateToken ||
        (queryToken.length >= 4 &&
          candidateToken.length >= 4 &&
          (queryToken.startsWith(candidateToken) ||
            candidateToken.startsWith(queryToken)))
    )
  );
}

function relevantTokens(value: string) {
  return value
    .normalize("NFKC")
    .toLocaleLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter((token) => token.length >= 3 && !relevanceStopWords.has(token));
}

function uniqueUrls(...values: Array<string | undefined>) {
  return [...new Set(values.filter((value): value is string => Boolean(value)))];
}

function supportedImageMimeType(
  raw: string | null
): ImageAssetCandidate["mimeType"] {
  const mime = raw?.split(";", 1)[0]?.trim().toLowerCase();
  if (mime === "image/png" || mime === "image/jpeg" || mime === "image/webp") {
    return mime;
  }
  throw new Error(`Unsupported public image MIME type: ${mime || "unknown"}`);
}

function assertImageSize(body: Uint8Array) {
  if (body.byteLength === 0 || body.byteLength > maxImageBytes) {
    throw new Error(`Image byte size must be between 1 and ${maxImageBytes}`);
  }
}

function fileNameForMime(
  title: string,
  mimeType: ImageAssetCandidate["mimeType"]
) {
  const extension = mimeType === "image/jpeg" ? "jpg" : mimeType.split("/")[1];
  const stem = title.replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-|-$/g, "") || "public-image";
  return `${stem}.${extension}`;
}
