import {
  WebsocketEvent,
  WebsocketEventType,
  demoIds,
  nowIso,
  websocketEventSchema
} from "@orbit/shared";

export function projectRoomId(projectId = demoIds.projectId): string {
  return projectId;
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
    sentAt: nowIso()
  });
}

