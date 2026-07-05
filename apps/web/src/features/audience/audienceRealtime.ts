import {
  audienceFeatureSettingsPayloadSchema,
  audienceQuestionAnswerResponseSchema,
  audienceReactionPayloadSchema,
  audienceSessionEndedPayloadSchema,
  audienceSlideStatePayloadSchema,
  audienceStatePayloadSchema,
  type AudienceFeatureSettings,
  type AudienceQuestionAnswerResponse,
  type AudienceReactionPayload,
  type AudienceSessionEndedPayload,
  type AudienceRealtimeState,
  type AudienceStateResponse,
  type WebsocketEvent,
} from "@orbit/shared";
import { io } from "socket.io-client";

export type AudienceRealtimeStatus =
  | "idle"
  | "connecting"
  | "connected"
  | "reconnecting"
  | "error";

export type AudienceRealtimeSocket = {
  connected?: boolean;
  disconnect: () => void;
  emit: (event: string, payload?: unknown) => void;
  off: (event: string, handler: (...args: any[]) => void) => void;
  on: (event: string, handler: (...args: any[]) => void) => void;
};

export type AudienceRealtimeSocketFactory = () => AudienceRealtimeSocket;

export type AudienceRealtimeConnection = {
  disconnect: () => void;
};

export function connectAudienceRealtime(args: {
  onError: (message: string) => void;
  onFeatureSettings: (features: AudienceFeatureSettings) => void;
  onPrivateAnswer?: (payload: AudienceQuestionAnswerResponse) => void;
  onReaction?: (payload: AudienceReactionPayload) => void;
  onSessionEnded?: (payload: AudienceSessionEndedPayload) => void;
  onSlideState: (state: AudienceRealtimeState) => void;
  onState: (state: AudienceStateResponse) => void;
  onStatus: (status: AudienceRealtimeStatus) => void;
  sessionId: string;
  socketFactory?: AudienceRealtimeSocketFactory;
}): AudienceRealtimeConnection {
  const socketFactory =
    args.socketFactory ?? (() => io({ withCredentials: true }));
  const socket = socketFactory();

  args.onStatus("connecting");

  function joinAudienceRoom() {
    args.onStatus("connected");
    socket.emit("audience:join", { sessionId: args.sessionId });
  }

  function handleState(event: WebsocketEvent) {
    const payload = audienceStatePayloadSchema.parse(event.payload);
    args.onState(payload);
  }

  function handleSlideState(event: WebsocketEvent) {
    const payload = audienceSlideStatePayloadSchema.parse(event.payload);
    args.onSlideState(payload.state);
  }

  function handleFeatureSettings(event: WebsocketEvent) {
    const payload = audienceFeatureSettingsPayloadSchema.parse(event.payload);
    args.onFeatureSettings(payload.features);
  }

  function handleReaction(event: WebsocketEvent) {
    const payload = audienceReactionPayloadSchema.parse(event.payload);
    args.onReaction?.(payload);
  }

  function handlePrivateAnswer(event: WebsocketEvent) {
    const payload = audienceQuestionAnswerResponseSchema.parse(event.payload);
    args.onPrivateAnswer?.(payload);
  }

  function handleSessionEnded(event: WebsocketEvent) {
    const payload = audienceSessionEndedPayloadSchema.parse(event.payload);
    args.onSessionEnded?.(payload);
  }

  function handleAudienceError(error: { message?: string }) {
    args.onStatus("error");
    args.onError(error.message ?? "청중 실시간 연결에 실패했습니다.");
  }

  function handleConnectError(error: Error) {
    args.onStatus("error");
    args.onError(error.message);
  }

  function handleDisconnect() {
    args.onStatus("reconnecting");
  }

  socket.on("connect", joinAudienceRoom);
  socket.on("connect_error", handleConnectError);
  socket.on("audience:error", handleAudienceError);
  socket.on("audience:state", handleState);
  socket.on("audience:slide-state", handleSlideState);
  socket.on("audience:feature-settings", handleFeatureSettings);
  socket.on("audience:private-answer", handlePrivateAnswer);
  socket.on("audience:reaction", handleReaction);
  socket.on("audience:session-ended", handleSessionEnded);
  socket.on("disconnect", handleDisconnect);

  if (socket.connected) {
    joinAudienceRoom();
  }

  return {
    disconnect: () => {
      socket.off("connect", joinAudienceRoom);
      socket.off("connect_error", handleConnectError);
      socket.off("audience:error", handleAudienceError);
      socket.off("audience:state", handleState);
      socket.off("audience:slide-state", handleSlideState);
      socket.off("audience:feature-settings", handleFeatureSettings);
      socket.off("audience:private-answer", handlePrivateAnswer);
      socket.off("audience:reaction", handleReaction);
      socket.off("audience:session-ended", handleSessionEnded);
      socket.off("disconnect", handleDisconnect);
      socket.disconnect();
    },
  };
}
