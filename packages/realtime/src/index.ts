import {
  AudienceRoomId,
  WebsocketEvent,
  WebsocketEventType,
  demoIds,
  nowIso,
  audienceRoomIdSchema,
  websocketEventSchema,
} from "@orbit/shared";

export function projectRoomId(projectId = demoIds.projectId): string {
  return projectId;
}

export function audienceSessionRoomId(sessionId: string): AudienceRoomId {
  return audienceRoomIdSchema.parse(`presentation:${sessionId}:audience`);
}

export function audiencePresenterRoomId(sessionId: string): AudienceRoomId {
  return audienceRoomIdSchema.parse(`presentation:${sessionId}:presenter`);
}

export function audiencePrivateRoomId(input: {
  sessionId: string;
  audienceId: string;
}): AudienceRoomId {
  return audienceRoomIdSchema.parse(
    `presentation:${input.sessionId}:audience:${input.audienceId}`,
  );
}

export function createRealtimeEvent(input: {
  type: WebsocketEventType;
  roomId?: string;
  sessionId?: string;
  userId?: string;
  payload?: Record<string, unknown>;
}): WebsocketEvent {
  return websocketEventSchema.parse({
    type: input.type,
    roomId: input.roomId ?? projectRoomId(),
    sessionId: input.sessionId,
    userId: input.userId ?? demoIds.userId,
    payload: input.payload ?? {},
    sentAt: nowIso(),
  });
}
