import {
  getCurrentPresentationSessionResponseSchema,
  presentationSessionResponseSchema,
  presentationSessionWithAudienceUrlResponseSchema
} from "@orbit/shared";
import type {
  GetCurrentPresentationSessionResponse,
  PresentationAccessMode,
  PresentationSession,
  PresentationSessionWithAudienceUrlResponse
} from "@orbit/shared";

export async function fetchCurrentAudienceAccessSession(
  projectId: string,
  deckId: string
): Promise<GetCurrentPresentationSessionResponse> {
  const response = await fetch(
    `/api/v1/projects/${encodeURIComponent(projectId)}/presentation-sessions/current?deckId=${encodeURIComponent(deckId)}`,
    { credentials: "include" }
  );

  if (!response.ok) {
    throw await readResponseError(response, "Audience session fetch failed");
  }

  return getCurrentPresentationSessionResponseSchema.parse(await response.json());
}

export async function createAudienceAccessSession(args: {
  accessMode: PresentationAccessMode;
  deckId: string;
  durationDays: number;
  passcode?: string;
  projectId: string;
}): Promise<PresentationSessionWithAudienceUrlResponse> {
  const startsAt = new Date();
  const expiresAt = new Date(
    startsAt.getTime() + args.durationDays * 24 * 60 * 60 * 1000
  );
  const response = await fetch(
    `/api/v1/projects/${encodeURIComponent(args.projectId)}/presentation-sessions`,
    {
      body: JSON.stringify({
        accessMode: args.accessMode,
        deckId: args.deckId,
        startsAt: startsAt.toISOString(),
        expiresAt: expiresAt.toISOString(),
        ...(args.accessMode === "passcode" ? { passcode: args.passcode } : {})
      }),
      credentials: "include",
      headers: { "content-type": "application/json" },
      method: "POST"
    }
  );

  if (!response.ok) {
    throw await readResponseError(response, "Audience session create failed");
  }

  return presentationSessionWithAudienceUrlResponseSchema.parse(await response.json());
}

export async function closeAudienceAccessSession(args: {
  projectId: string;
  sessionId: string;
}): Promise<PresentationSession> {
  const response = await fetch(
    `/api/v1/projects/${encodeURIComponent(
      args.projectId
    )}/presentation-sessions/${encodeURIComponent(args.sessionId)}/close`,
    {
      body: JSON.stringify({}),
      credentials: "include",
      headers: { "content-type": "application/json" },
      method: "POST"
    }
  );

  if (!response.ok) {
    throw await readResponseError(response, "Audience session close failed");
  }

  return presentationSessionResponseSchema.parse(await response.json()).session;
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
