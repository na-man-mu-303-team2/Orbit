import type {
  CreatePresentationSessionResponse,
  GetCurrentPresentationSessionResponse,
  PresentationSession,
} from "@orbit/shared";

export async function fetchCurrentAudienceAccessSession(
  projectId: string,
): Promise<GetCurrentPresentationSessionResponse> {
  const response = await fetch(
    `/api/v1/projects/${encodeURIComponent(projectId)}/presentation-sessions/current`,
    {
      credentials: "include",
    },
  );

  if (!response.ok) {
    throw await readResponseError(response, "Audience session fetch failed");
  }

  return response.json() as Promise<GetCurrentPresentationSessionResponse>;
}

export async function createAudienceAccessSession(args: {
  deckId: string;
  projectId: string;
}): Promise<CreatePresentationSessionResponse> {
  const response = await fetch(
    `/api/v1/projects/${encodeURIComponent(args.projectId)}/presentation-sessions`,
    {
      body: JSON.stringify({
        deckId: args.deckId,
      }),
      credentials: "include",
      headers: {
        "content-type": "application/json",
      },
      method: "POST",
    },
  );

  if (!response.ok) {
    throw await readResponseError(response, "Audience session create failed");
  }

  return response.json() as Promise<CreatePresentationSessionResponse>;
}

export async function closeAudienceAccessSession(args: {
  projectId: string;
  sessionId: string;
}): Promise<PresentationSession> {
  const response = await fetch(
    `/api/v1/projects/${encodeURIComponent(
      args.projectId,
    )}/presentation-sessions/${encodeURIComponent(args.sessionId)}/entry`,
    {
      body: JSON.stringify({ entryStatus: "closed" }),
      credentials: "include",
      headers: {
        "content-type": "application/json",
      },
      method: "PATCH",
    },
  );

  if (!response.ok) {
    throw await readResponseError(response, "Audience session close failed");
  }

  const payload = (await response.json()) as { session: PresentationSession };
  return payload.session;
}

async function readResponseError(response: Response, fallbackMessage: string) {
  try {
    const payload = (await response.json()) as { message?: unknown };
    if (typeof payload.message === "string" && payload.message.length > 0) {
      return new Error(payload.message);
    }
  } catch {
    // Use fallback below when the response body is not JSON.
  }

  return new Error(fallbackMessage);
}
