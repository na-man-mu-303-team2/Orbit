import type {
  CreatePresentationSessionResponse,
  CreateAdHocSessionInteractionRequest,
  GetCurrentPresentationSessionResponse,
  ListInteractionLibraryItemsResponse,
  ListSessionInteractionsResponse,
  PresentationEntryStatus,
  PresentationSession,
  PresenterQuestionQueueResponse,
  SelectSessionInteractionsRequest,
  SessionInteractionResponse,
  SessionResultsResponse,
  SessionSurveyFormResponse,
  UpdateAiReferenceSelectionRequest,
  UpdateAiReferenceSelectionResponse,
  UpsertSessionSurveyFormRequest,
  UpdateAudienceFeatureSettingsRequest,
  UpdateAudienceFeatureSettingsResponse,
  UploadedFile,
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
    throw await readResponseError(
      response,
      "Audience session entry update failed",
    );
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

export async function fetchSessionResults(args: {
  projectId: string;
  sessionId: string;
}): Promise<SessionResultsResponse> {
  const response = await fetch(
    `/api/v1/projects/${encodeURIComponent(
      args.projectId,
    )}/presentation-sessions/${encodeURIComponent(args.sessionId)}/results`,
    {
      credentials: "include",
      method: "GET",
    },
  );

  if (!response.ok) {
    throw await readResponseError(response, "Audience results fetch failed");
  }

  return response.json() as Promise<SessionResultsResponse>;
}

export async function fetchSessionInteractions(args: {
  projectId: string;
  sessionId: string;
}): Promise<ListSessionInteractionsResponse> {
  const response = await fetch(sessionInteractionsUrl(args), {
    credentials: "include",
    method: "GET",
  });

  if (!response.ok) {
    throw await readResponseError(response, "Session interactions fetch failed");
  }

  return response.json() as Promise<ListSessionInteractionsResponse>;
}

export async function fetchInteractionLibrary(
  projectId: string,
): Promise<ListInteractionLibraryItemsResponse> {
  const response = await fetch(interactionLibraryUrl(projectId), {
    credentials: "include",
    method: "GET",
  });

  if (!response.ok) {
    throw await readResponseError(response, "Interaction library fetch failed");
  }

  return response.json() as Promise<ListInteractionLibraryItemsResponse>;
}

export async function fetchProjectAssets(
  projectId: string,
): Promise<UploadedFile[]> {
  const response = await fetch(projectAssetsUrl(projectId), {
    credentials: "include",
    method: "GET",
  });

  if (!response.ok) {
    throw await readResponseError(response, "Project assets fetch failed");
  }

  return response.json() as Promise<UploadedFile[]>;
}

export async function fetchAiReferenceSelection(args: {
  projectId: string;
  sessionId: string;
}): Promise<UpdateAiReferenceSelectionResponse> {
  const response = await fetch(aiReferencesUrl(args), {
    credentials: "include",
    method: "GET",
  });

  if (!response.ok) {
    throw await readResponseError(response, "AI reference selection fetch failed");
  }

  return response.json() as Promise<UpdateAiReferenceSelectionResponse>;
}

export async function updateAiReferenceSelection(args: {
  projectId: string;
  referenceIds: UpdateAiReferenceSelectionRequest["referenceIds"];
  sessionId: string;
}): Promise<UpdateAiReferenceSelectionResponse> {
  const response = await fetch(aiReferencesUrl(args), {
    body: JSON.stringify({ referenceIds: args.referenceIds }),
    credentials: "include",
    headers: {
      "content-type": "application/json",
    },
    method: "PATCH",
  });

  if (!response.ok) {
    throw await readResponseError(response, "AI reference selection update failed");
  }

  return response.json() as Promise<UpdateAiReferenceSelectionResponse>;
}

export async function selectSessionInteractions(args: {
  libraryInteractionIds: SelectSessionInteractionsRequest["libraryInteractionIds"];
  projectId: string;
  sessionId: string;
}): Promise<ListSessionInteractionsResponse> {
  const response = await fetch(`${sessionInteractionsUrl(args)}/select`, {
    body: JSON.stringify({
      libraryInteractionIds: args.libraryInteractionIds,
    }),
    credentials: "include",
    headers: {
      "content-type": "application/json",
    },
    method: "POST",
  });

  if (!response.ok) {
    throw await readResponseError(response, "Session interaction selection failed");
  }

  return response.json() as Promise<ListSessionInteractionsResponse>;
}

export async function createAdHocSessionInteraction(args: {
  interaction: CreateAdHocSessionInteractionRequest;
  projectId: string;
  sessionId: string;
}): Promise<SessionInteractionResponse> {
  const response = await fetch(sessionInteractionsUrl(args), {
    body: JSON.stringify(args.interaction),
    credentials: "include",
    headers: {
      "content-type": "application/json",
    },
    method: "POST",
  });

  if (!response.ok) {
    throw await readResponseError(response, "Session interaction create failed");
  }

  return response.json() as Promise<SessionInteractionResponse>;
}

export async function activateSessionInteraction(args: {
  interactionId: string;
  projectId: string;
  sessionId: string;
}): Promise<SessionInteractionResponse> {
  return postInteractionCommand(args, "activate");
}

export async function closeSessionInteraction(args: {
  interactionId: string;
  projectId: string;
  sessionId: string;
}): Promise<SessionInteractionResponse> {
  return postInteractionCommand(args, "close");
}

export async function exposeInteractionQuestionResults(args: {
  exposed: boolean;
  interactionId: string;
  projectId: string;
  questionId: string;
  sessionId: string;
}): Promise<SessionInteractionResponse> {
  const response = await fetch(
    `${sessionInteractionsUrl(args)}/${encodeURIComponent(
      args.interactionId,
    )}/results/exposure`,
    {
      body: JSON.stringify({
        questionId: args.questionId,
        exposed: args.exposed,
      }),
      credentials: "include",
      headers: {
        "content-type": "application/json",
      },
      method: "PATCH",
    },
  );

  if (!response.ok) {
    throw await readResponseError(response, "Result exposure update failed");
  }

  return response.json() as Promise<SessionInteractionResponse>;
}

export async function fetchPresenterQuestionQueue(args: {
  projectId: string;
  sessionId: string;
}): Promise<PresenterQuestionQueueResponse> {
  const response = await fetch(
    `/api/v1/projects/${encodeURIComponent(
      args.projectId,
    )}/presentation-sessions/${encodeURIComponent(args.sessionId)}/questions`,
    {
      credentials: "include",
      method: "GET",
    },
  );

  if (!response.ok) {
    throw await readResponseError(response, "Question queue fetch failed");
  }

  return response.json() as Promise<PresenterQuestionQueueResponse>;
}

async function postInteractionCommand(
  args: {
    interactionId: string;
    projectId: string;
    sessionId: string;
  },
  command: "activate" | "close",
): Promise<SessionInteractionResponse> {
  const response = await fetch(
    `${sessionInteractionsUrl(args)}/${encodeURIComponent(
      args.interactionId,
    )}/${command}`,
    {
      credentials: "include",
      method: "POST",
    },
  );

  if (!response.ok) {
    throw await readResponseError(response, `Session interaction ${command} failed`);
  }

  return response.json() as Promise<SessionInteractionResponse>;
}

function surveyFormUrl(projectId: string, sessionId: string) {
  return `/api/v1/projects/${encodeURIComponent(
    projectId,
  )}/presentation-sessions/${encodeURIComponent(sessionId)}/survey`;
}

function sessionInteractionsUrl(args: { projectId: string; sessionId: string }) {
  return `/api/v1/projects/${encodeURIComponent(
    args.projectId,
  )}/presentation-sessions/${encodeURIComponent(args.sessionId)}/interactions`;
}

function interactionLibraryUrl(projectId: string) {
  return `/api/v1/projects/${encodeURIComponent(
    projectId,
  )}/presentation-sessions/interactions/library`;
}

function projectAssetsUrl(projectId: string) {
  return `/api/v1/projects/${encodeURIComponent(projectId)}/assets`;
}

function aiReferencesUrl(args: { projectId: string; sessionId: string }) {
  return `/api/v1/projects/${encodeURIComponent(
    args.projectId,
  )}/presentation-sessions/${encodeURIComponent(args.sessionId)}/ai-references`;
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
