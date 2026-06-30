import {
  aiSuggestionErrorSchema,
  applyAiSuggestionResponseSchema,
  listAiSuggestionsResponseSchema,
  rejectAiSuggestionResponseSchema
} from "@orbit/shared";
import type {
  AiSuggestionStatus,
  ApplyAiSuggestionResponse,
  ListAiSuggestionsResponse,
  RejectAiSuggestionResponse
} from "@orbit/shared";

export type AiSuggestionListParams = {
  deckId?: string;
  slideId?: string;
  status?: AiSuggestionStatus;
};

export const aiSuggestionsQueryKey = (
  projectId: string,
  params: AiSuggestionListParams
) =>
  [
    "ai-suggestions",
    projectId,
    params.deckId ?? "",
    params.slideId ?? "",
    params.status ?? ""
  ] as const;

export async function fetchAiSuggestions(
  projectId: string,
  params: AiSuggestionListParams
): Promise<ListAiSuggestionsResponse> {
  const query = new URLSearchParams();

  if (params.deckId) query.set("deckId", params.deckId);
  if (params.slideId) query.set("slideId", params.slideId);
  if (params.status) query.set("status", params.status);

  const response = await fetch(
    `/api/v1/projects/${projectId}/ai-suggestions?${query.toString()}`
  );

  if (!response.ok) {
    throw await toAiSuggestionError(response);
  }

  return listAiSuggestionsResponseSchema.parse(await response.json());
}

export async function applyAiSuggestion(
  projectId: string,
  suggestionId: string
): Promise<ApplyAiSuggestionResponse> {
  const response = await fetch(
    `/api/v1/projects/${projectId}/ai-suggestions/${suggestionId}/apply`,
    {
      method: "POST"
    }
  );

  if (!response.ok) {
    throw await toAiSuggestionError(response);
  }

  return applyAiSuggestionResponseSchema.parse(await response.json());
}

export async function rejectAiSuggestion(
  projectId: string,
  suggestionId: string
): Promise<RejectAiSuggestionResponse> {
  const response = await fetch(
    `/api/v1/projects/${projectId}/ai-suggestions/${suggestionId}/reject`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({})
    }
  );

  if (!response.ok) {
    throw await toAiSuggestionError(response);
  }

  return rejectAiSuggestionResponseSchema.parse(await response.json());
}

async function toAiSuggestionError(response: Response): Promise<Error> {
  const payload = await response.json().catch(() => undefined);
  const parsed = aiSuggestionErrorSchema.safeParse(payload);

  if (parsed.success) {
    return new Error(`${parsed.data.code}: ${parsed.data.message}`);
  }

  return new Error(`AI suggestion request failed: ${response.status}`);
}
