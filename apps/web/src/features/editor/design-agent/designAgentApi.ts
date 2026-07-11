import {
  createDesignAgentMessageResponseSchema,
  type CreateDesignAgentMessageRequest,
  type CreateDesignAgentMessageResponse
} from "@orbit/shared";

export async function createDesignAgentMessage(
  projectId: string,
  input: CreateDesignAgentMessageRequest
): Promise<CreateDesignAgentMessageResponse> {
  const response = await fetch(
    `/api/v1/projects/${encodeURIComponent(projectId)}/design-agent/messages`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input)
    }
  );

  if (!response.ok) {
    const payload = await response.json().catch(() => undefined);
    const message =
      payload && typeof payload === "object" && "message" in payload
        ? String(payload.message)
        : `Design agent request failed: ${response.status}`;
    throw new Error(message);
  }

  return createDesignAgentMessageResponseSchema.parse(await response.json());
}
