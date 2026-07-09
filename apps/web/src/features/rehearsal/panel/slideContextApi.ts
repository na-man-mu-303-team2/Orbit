import type {
  ExtractSlideContextItemsResponse,
  ListSlideContextItemsResponse,
  SlideContextItem,
  UpdateSlideContextItemResponse
} from "@orbit/shared";
import {
  extractSlideContextItemsResponseSchema,
  listSlideContextItemsResponseSchema,
  updateSlideContextItemResponseSchema
} from "@orbit/shared";

const BASE = "/api/v1";

export async function fetchSlideContextItems(
  projectId: string,
  deckId: string
): Promise<SlideContextItem[]> {
  const response = await fetch(
    `${BASE}/projects/${encodeURIComponent(projectId)}/decks/${encodeURIComponent(deckId)}/slide-context`,
    { credentials: "include" }
  );
  if (!response.ok) {
    throw new Error(
      await readSlideContextError(
        response,
        "맥락 항목을 불러오지 못했습니다."
      )
    );
  }
  const data = (await response.json()) as ListSlideContextItemsResponse;
  return listSlideContextItemsResponseSchema.parse(data).items;
}

export async function updateSlideContextItem(
  projectId: string,
  itemId: string,
  body: { label?: string; sentence?: string }
): Promise<SlideContextItem> {
  const response = await fetch(
    `${BASE}/projects/${encodeURIComponent(projectId)}/slide-context/${encodeURIComponent(itemId)}`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify(body)
    }
  );
  if (!response.ok) {
    throw new Error(
      await readSlideContextError(
        response,
        "맥락 항목을 수정하지 못했습니다."
      )
    );
  }
  const data = (await response.json()) as UpdateSlideContextItemResponse;
  return updateSlideContextItemResponseSchema.parse(data).item;
}

export async function deleteSlideContextItem(
  projectId: string,
  itemId: string
): Promise<void> {
  const response = await fetch(
    `${BASE}/projects/${encodeURIComponent(projectId)}/slide-context/${encodeURIComponent(itemId)}`,
    {
      method: "DELETE",
      credentials: "include"
    }
  );
  if (!response.ok) {
    throw new Error(
      await readSlideContextError(
        response,
        "맥락 항목을 삭제하지 못했습니다."
      )
    );
  }
}

export type SlideInput = {
  slideId: string;
  slideText: string;
  speakerNotes: string;
};

export async function extractSlideContextItems(
  projectId: string,
  deckId: string,
  slides: SlideInput[]
): Promise<SlideContextItem[]> {
  const response = await fetch(
    `${BASE}/projects/${encodeURIComponent(projectId)}/decks/${encodeURIComponent(deckId)}/slide-context/extract`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ projectId, deckId, slides })
    }
  );
  if (!response.ok) {
    throw new Error(
      await readSlideContextError(
        response,
        "맥락 항목 추출에 실패했습니다."
      )
    );
  }
  const data = (await response.json()) as ExtractSlideContextItemsResponse;
  return extractSlideContextItemsResponseSchema.parse(data).items;
}

async function readSlideContextError(
  response: Response,
  fallbackMessage: string
): Promise<string> {
  const rawText = await response.text().catch(() => "");
  const bodyText = rawText.trim();
  if (!bodyText) {
    return `${fallbackMessage} (${response.status})`;
  }

  try {
    const parsed = JSON.parse(bodyText) as {
      detail?: string;
      message?: string | string[];
    };
    if (typeof parsed.detail === "string" && parsed.detail.trim()) {
      return parsed.detail.trim();
    }
    if (Array.isArray(parsed.message) && parsed.message.length > 0) {
      return parsed.message.join(" ");
    }
    if (typeof parsed.message === "string" && parsed.message.trim()) {
      return parsed.message.trim();
    }
  } catch {}

  return bodyText;
}
