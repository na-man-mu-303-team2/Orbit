import type {
  CreatePresentationSessionResponse,
  GetCurrentPresentationSessionResponse,
  PresentationEntryStatus,
  PresentationSession,
  SessionSurveyFormResponse,
  UpsertSessionSurveyFormRequest,
  UpdateAudienceFeatureSettingsRequest,
  UpdateAudienceFeatureSettingsResponse,
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
  return updateAudienceAccessEntryStatus({
    ...args,
    entryStatus: "closed",
  });
}

export async function updateAudienceAccessEntryStatus(args: {
  entryStatus: PresentationEntryStatus;
  projectId: string;
  sessionId: string;
}): Promise<PresentationSession> {
  const response = await fetch(
    `/api/v1/projects/${encodeURIComponent(
      args.projectId,
    )}/presentation-sessions/${encodeURIComponent(args.sessionId)}/entry`,
    {
      body: JSON.stringify({ entryStatus: args.entryStatus }),
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

export async function fetchAudienceFeatureSettings(args: {
  projectId: string;
  sessionId: string;
}): Promise<UpdateAudienceFeatureSettingsResponse> {
  const response = await fetch(
    `/api/v1/projects/${encodeURIComponent(
      args.projectId,
    )}/presentation-sessions/${encodeURIComponent(args.sessionId)}/features`,
    {
      credentials: "include",
      method: "GET",
    },
  );

  if (!response.ok) {
    throw await readResponseError(
      response,
      "Audience feature settings fetch failed",
    );
  }

  return response.json() as Promise<UpdateAudienceFeatureSettingsResponse>;
}

export async function updateAudienceFeatureSettings(args: {
  projectId: string;
  sessionId: string;
  settings: UpdateAudienceFeatureSettingsRequest;
}): Promise<UpdateAudienceFeatureSettingsResponse> {
  const response = await fetch(
    `/api/v1/projects/${encodeURIComponent(
      args.projectId,
    )}/presentation-sessions/${encodeURIComponent(args.sessionId)}/features`,
    {
      body: JSON.stringify(args.settings),
      credentials: "include",
      headers: {
        "content-type": "application/json",
      },
      method: "PATCH",
    },
  );

  if (!response.ok) {
    throw await readResponseError(
      response,
      "Audience feature settings update failed",
    );
  }

  return response.json() as Promise<UpdateAudienceFeatureSettingsResponse>;
}

export async function fetchSessionSurveyForm(args: {
  projectId: string;
  sessionId: string;
}): Promise<SessionSurveyFormResponse> {
  const response = await fetch(
    surveyFormUrl(args.projectId, args.sessionId),
    {
      credentials: "include",
      method: "GET",
    },
  );

  if (!response.ok) {
    throw await readResponseError(response, "Survey form fetch failed");
  }

  return response.json() as Promise<SessionSurveyFormResponse>;
}

export async function upsertSessionSurveyForm(args: {
  form: UpsertSessionSurveyFormRequest;
  projectId: string;
  sessionId: string;
}): Promise<SessionSurveyFormResponse> {
  const response = await fetch(
    surveyFormUrl(args.projectId, args.sessionId),
    {
      body: JSON.stringify(args.form),
      credentials: "include",
      headers: {
        "content-type": "application/json",
      },
      method: "PUT",
    },
  );

  if (!response.ok) {
    throw await readResponseError(response, "Survey form save failed");
  }

  return response.json() as Promise<SessionSurveyFormResponse>;
}

export function sessionSurveyCsvUrl(args: {
  projectId: string;
  sessionId: string;
}) {
  return `${surveyFormUrl(args.projectId, args.sessionId)}.csv`;
}

function surveyFormUrl(projectId: string, sessionId: string) {
  return `/api/v1/projects/${encodeURIComponent(
    projectId,
  )}/presentation-sessions/${encodeURIComponent(sessionId)}/survey`;
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
