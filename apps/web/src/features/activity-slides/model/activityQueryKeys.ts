export const activityQueryKeys = {
  sessionCurrent: (projectId: string, deckId: string) =>
    ["activity-slides", "session-current", projectId, deckId] as const,
  sessionList: (projectId: string, deckId: string) =>
    ["activity-slides", "session-list", projectId, deckId] as const,
  presenterResult: (projectId: string, sessionId: string, runId: string) =>
    ["activity-slides", "presenter-result", projectId, sessionId, runId] as const,
  audienceAccess: (sessionId: string) =>
    ["activity-slides", "audience-access", sessionId] as const,
  audienceActivity: (sessionId: string, activityId: string) =>
    ["activity-slides", "audience-activity", sessionId, activityId] as const
};
