import {
  audienceReactionPayloadSchema,
  type AudienceReactionPayload,
  type WebsocketEvent,
} from "@orbit/shared";
import { io } from "socket.io-client";

import type { PresenterSlideshowState } from "../rehearsal/presenter/presenterStateStore";

export type AudiencePresenterRealtimeStatus =
  | "idle"
  | "connecting"
  | "connected"
  | "error";

export type AudiencePresenterRealtimeSocket = {
  connected?: boolean;
  disconnect: () => void;
  emit: (event: string, payload?: unknown) => void;
  off: (event: string, handler: (...args: any[]) => void) => void;
  on: (event: string, handler: (...args: any[]) => void) => void;
};

export type AudiencePresenterRealtimePublisher = {
  disconnect: () => void;
  publishState: (args: {
    state: PresenterSlideshowState;
    triggerAnimationIds: string[];
  }) => void;
};

export function createAudiencePresenterRealtimePublisher(args: {
  onError?: (message: string) => void;
  onReaction?: (payload: AudienceReactionPayload) => void;
  onStatus?: (status: AudiencePresenterRealtimeStatus) => void;
  sessionId: string;
  socketFactory?: () => AudiencePresenterRealtimeSocket;
}): AudiencePresenterRealtimePublisher {
  const socketFactory =
    args.socketFactory ?? (() => io({ withCredentials: true }));
  const socket = socketFactory();

  args.onStatus?.("connecting");

  function joinPresenterRoom() {
    args.onStatus?.("connected");
    socket.emit("audience:presenter-join", { sessionId: args.sessionId });
  }

  function handleError(error: { message?: string }) {
    args.onStatus?.("error");
    args.onError?.(error.message ?? "청중 실시간 전송에 실패했습니다.");
  }

  function handleConnectError(error: Error) {
    args.onStatus?.("error");
    args.onError?.(error.message);
  }

  function handleReaction(event: WebsocketEvent) {
    const payload = audienceReactionPayloadSchema.parse(event.payload);
    args.onReaction?.(payload);
  }

  socket.on("connect", joinPresenterRoom);
  socket.on("connect_error", handleConnectError);
  socket.on("audience:error", handleError);
  socket.on("audience:reaction", handleReaction);

  if (socket.connected) {
    joinPresenterRoom();
  }

  return {
    disconnect: () => {
      socket.off("connect", joinPresenterRoom);
      socket.off("connect_error", handleConnectError);
      socket.off("audience:error", handleError);
      socket.off("audience:reaction", handleReaction);
      socket.disconnect();
    },
    publishState: ({ state, triggerAnimationIds }) => {
      socket.emit("audience:slide-state:update", {
        sessionId: args.sessionId,
        slideId: state.slideId,
        slideIndex: state.slideIndex,
        effectState: {
          highlights: state.highlights,
          stepIndex: state.stepIndex,
          triggerAnimationIds,
        },
      });
    },
  };
}
