import type {
  AudienceActiveInteractionResponse,
  AudienceJoinResponse,
  AudienceQuestionResponse,
  AudienceQuestionAnswerResponse,
  AudienceSessionLookupResponse,
  AudienceStateResponse,
  InteractionAnswer,
  ReactionType,
  SubmitReactionResponse,
  SubmitInteractionResponseResponse,
} from "@orbit/shared";

export async function lookupAudienceSession(
  joinCode: string,
): Promise<AudienceSessionLookupResponse> {
  const response = await fetch(
    `/api/v1/presentation-sessions/join/${encodeURIComponent(joinCode)}`,
    {
      credentials: "include",
      method: "GET",
    },
  );

  if (!response.ok) {
    throw await readAudienceError(response);
  }

  return response.json() as Promise<AudienceSessionLookupResponse>;
}

export async function joinAudienceSession(args: {
  joinCode: string;
  nickname: string;
}): Promise<AudienceJoinResponse> {
  const response = await fetch(
    `/api/v1/presentation-sessions/join/${encodeURIComponent(args.joinCode)}`,
    {
      body: JSON.stringify({ nickname: args.nickname }),
      credentials: "include",
      headers: {
        "content-type": "application/json",
      },
      method: "POST",
    },
  );

  if (!response.ok) {
    throw await readAudienceError(response);
  }

  return response.json() as Promise<AudienceJoinResponse>;
}

export async function fetchAudienceMe(args: {
  sessionId: string;
}): Promise<AudienceJoinResponse> {
  const response = await fetch(
    `/api/v1/presentation-sessions/${encodeURIComponent(
      args.sessionId,
    )}/audience/me`,
    {
      credentials: "include",
      method: "GET",
    },
  );

  if (!response.ok) {
    throw await readAudienceError(response);
  }

  return response.json() as Promise<AudienceJoinResponse>;
}

export async function fetchAudienceState(args: {
  sessionId: string;
}): Promise<AudienceStateResponse> {
  const response = await fetch(
    `/api/v1/presentation-sessions/${encodeURIComponent(
      args.sessionId,
    )}/audience/state`,
    {
      credentials: "include",
      method: "GET",
    },
  );

  if (!response.ok) {
    throw await readAudienceError(response);
  }

  return response.json() as Promise<AudienceStateResponse>;
}

export async function fetchAudienceActiveInteraction(args: {
  sessionId: string;
}): Promise<AudienceActiveInteractionResponse> {
  const response = await fetch(
    `/api/v1/presentation-sessions/${encodeURIComponent(
      args.sessionId,
    )}/audience/interactions/active`,
    {
      credentials: "include",
      method: "GET",
    },
  );

  if (!response.ok) {
    throw await readAudienceError(response);
  }

  return response.json() as Promise<AudienceActiveInteractionResponse>;
}

export async function submitAudienceInteractionResponse(args: {
  sessionId: string;
  interactionId: string;
  questionId: string;
  answer: InteractionAnswer;
}): Promise<SubmitInteractionResponseResponse> {
  const response = await fetch(
    `/api/v1/presentation-sessions/${encodeURIComponent(
      args.sessionId,
    )}/audience/interactions/${encodeURIComponent(args.interactionId)}/respond`,
    {
      body: JSON.stringify({
        questionId: args.questionId,
        answer: args.answer,
      }),
      credentials: "include",
      headers: {
        "content-type": "application/json",
      },
      method: "POST",
    },
  );

  if (!response.ok) {
    throw await readAudienceError(response);
  }

  return response.json() as Promise<SubmitInteractionResponseResponse>;
}

export async function submitAudienceQuestion(args: {
  sessionId: string;
  text: string;
}): Promise<AudienceQuestionResponse> {
  const response = await fetch(
    `/api/v1/presentation-sessions/${encodeURIComponent(
      args.sessionId,
    )}/audience/questions`,
    {
      body: JSON.stringify({ text: args.text }),
      credentials: "include",
      headers: {
        "content-type": "application/json",
      },
      method: "POST",
    },
  );

  if (!response.ok) {
    throw await readAudienceError(response);
  }

  return response.json() as Promise<AudienceQuestionResponse>;
}

export async function fetchAudienceQuestionStatus(args: {
  sessionId: string;
  questionId: string;
}): Promise<AudienceQuestionResponse> {
  const response = await fetch(
    `/api/v1/presentation-sessions/${encodeURIComponent(
      args.sessionId,
    )}/audience/questions/${encodeURIComponent(args.questionId)}`,
    {
      credentials: "include",
      method: "GET",
    },
  );

  if (!response.ok) {
    throw await readAudienceError(response);
  }

  return response.json() as Promise<AudienceQuestionResponse>;
}

export async function fetchAudienceQuestionAnswer(args: {
  sessionId: string;
  questionId: string;
}): Promise<AudienceQuestionAnswerResponse> {
  const response = await fetch(
    `/api/v1/presentation-sessions/${encodeURIComponent(
      args.sessionId,
    )}/audience/questions/${encodeURIComponent(args.questionId)}/answer`,
    {
      credentials: "include",
      method: "GET",
    },
  );

  if (!response.ok) {
    throw await readAudienceError(response);
  }

  return response.json() as Promise<AudienceQuestionAnswerResponse>;
}

export async function updateAiAnswerFeedback(args: {
  sessionId: string;
  questionId: string;
  feedback: "resolved" | "unresolved";
}): Promise<AudienceQuestionAnswerResponse> {
  const response = await fetch(
    `/api/v1/presentation-sessions/${encodeURIComponent(
      args.sessionId,
    )}/audience/questions/${encodeURIComponent(args.questionId)}/feedback`,
    {
      body: JSON.stringify({ feedback: args.feedback }),
      credentials: "include",
      headers: {
        "content-type": "application/json",
      },
      method: "POST",
    },
  );

  if (!response.ok) {
    throw await readAudienceError(response);
  }

  return response.json() as Promise<AudienceQuestionAnswerResponse>;
}

export async function submitAudienceReaction(args: {
  sessionId: string;
  reaction: ReactionType;
}): Promise<SubmitReactionResponse> {
  const response = await fetch(
    `/api/v1/presentation-sessions/${encodeURIComponent(
      args.sessionId,
    )}/audience/reactions`,
    {
      body: JSON.stringify({ reaction: args.reaction }),
      credentials: "include",
      headers: {
        "content-type": "application/json",
      },
      method: "POST",
    },
  );

  if (!response.ok) {
    throw await readAudienceError(response);
  }

  return response.json() as Promise<SubmitReactionResponse>;
}

async function readAudienceError(response: Response) {
  const fallback = mapStatusToMessage(response.status);
  try {
    const payload = (await response.json()) as { message?: unknown };
    if (typeof payload.message === "string" && payload.message.length > 0) {
      return new Error(payload.message);
    }
  } catch {
    // Use fallback below when the response body is not JSON.
  }

  return new Error(fallback);
}

function mapStatusToMessage(status: number) {
  if (status === 403) return "현재 새 입장이 닫혀 있습니다.";
  if (status === 409) return "이미 사용 중인 닉네임입니다.";
  if (status === 429) {
    return "입장 시도가 많습니다. 잠시 후 다시 시도해 주세요.";
  }

  return "입장 코드를 확인해 주세요.";
}
