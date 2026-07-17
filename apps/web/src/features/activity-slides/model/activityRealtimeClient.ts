import { io, type Socket } from "socket.io-client";

import {
  createActivityRevisionConsumer,
  type ActivityRevisionCursor
} from "./activityRevision";

type ActivitySocket = Pick<
  Socket,
  "connected" | "disconnect" | "emit" | "off" | "on"
>;

const activityEventNames = [
  "active-activity-changed",
  "activity-state-changed",
  "activity-results-updated"
] as const;

export function connectAudienceActivityRealtime(
  input: {
    current: ActivityRevisionCursor | null;
    onRefresh: () => void | Promise<void>;
    projectId: string;
    sessionId: string;
  },
  createSocket: () => ActivitySocket = () => io({ withCredentials: true })
) {
  const socket = createSocket();
  const consumer = createActivityRevisionConsumer({
    current: input.current,
    onRefetch: () => void input.onRefresh(),
    sessionId: input.sessionId
  });
  const handleActivityEvent = (event: unknown) => {
    consumer.consume(event);
  };
  const handleConnect = () => {
    socket.emit("presentation:audience:join", {
      projectId: input.projectId,
      sessionId: input.sessionId
    });
    void input.onRefresh();
  };

  socket.on("connect", handleConnect);
  for (const eventName of activityEventNames) {
    socket.on(eventName, handleActivityEvent);
  }
  if (socket.connected) handleConnect();

  return {
    disconnect(): void {
      socket.off("connect", handleConnect);
      for (const eventName of activityEventNames) {
        socket.off(eventName, handleActivityEvent);
      }
      socket.disconnect();
    },
    sync(current: ActivityRevisionCursor | null): void {
      consumer.sync(current);
    }
  };
}
