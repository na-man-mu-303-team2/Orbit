import {
  presentationCompanionAuthorityChangedEventSchema,
  presentationCompanionErrorEventSchema,
  presentationCompanionJoinedEventSchema,
  presentationCompanionOutputStateEventSchema,
  presentationCompanionRevokedEventSchema,
  type PresentationCompanionOutputState,
  type PresentationCompanionSnapshotRequest,
} from "@orbit/shared";
import { useEffect, useRef, useState } from "react";
import { io, type Socket } from "socket.io-client";

type CompanionSocket = Pick<
  Socket,
  "connected" | "disconnect" | "emit" | "off" | "on"
>;

const createDefaultCompanionSocket = (): CompanionSocket =>
  io({ withCredentials: true });

export type CompanionConnectionStatus =
  | "connecting"
  | "connected"
  | "reconnecting"
  | "revoked"
  | "failed";

export type CompanionOutputCursor = {
  output: PresentationCompanionOutputState | null;
  snapshotPending: boolean;
};

export type CompanionOutputConsumption = {
  cursor: CompanionOutputCursor;
  requestSnapshot: boolean;
};

export function consumeCompanionOutputState(
  cursor: CompanionOutputCursor,
  incoming: PresentationCompanionOutputState,
): CompanionOutputConsumption {
  const current = cursor.output;
  if (
    !current ||
    current.authorityEpochId !== incoming.authorityEpochId ||
    cursor.snapshotPending
  ) {
    return {
      cursor: { output: incoming, snapshotPending: false },
      requestSnapshot: false,
    };
  }
  if (incoming.outputRevision <= current.outputRevision) {
    return { cursor, requestSnapshot: false };
  }
  if (incoming.outputRevision === current.outputRevision + 1) {
    return {
      cursor: { output: incoming, snapshotPending: false },
      requestSnapshot: false,
    };
  }
  return {
    cursor: { ...cursor, snapshotPending: true },
    requestSnapshot: true,
  };
}

export function useCompanionSocket(
  sessionId: string,
  createSocket: () => CompanionSocket = createDefaultCompanionSocket,
) {
  const [status, setStatus] =
    useState<CompanionConnectionStatus>("connecting");
  const [error, setError] = useState("");
  const [authorityEpochId, setAuthorityEpochId] = useState<string | null>(
    null,
  );
  const [output, setOutput] =
    useState<PresentationCompanionOutputState | null>(null);
  const cursorRef = useRef<CompanionOutputCursor>({
    output: null,
    snapshotPending: false,
  });
  const authorityEpochRef = useRef<string | null>(null);

  useEffect(() => {
    const socket = createSocket();
    let heartbeatStartedAt = 0;

    const requestSnapshot = (
      current: PresentationCompanionOutputState,
    ) => {
      const request: PresentationCompanionSnapshotRequest = {
        sessionId,
        authorityEpochId: current.authorityEpochId,
        surfaceId: current.surfaceId,
        lastOutputRevision: current.outputRevision,
        lastSurfaceRevision: current.surfaceRevision,
      };
      socket.emit("presentation:companion:snapshot-request", request);
    };
    const join = () => {
      setStatus("connecting");
      socket.emit("presentation:companion:join", { sessionId });
    };
    const handleDisconnect = () => {
      setStatus((current) =>
        current === "revoked" ? current : "reconnecting",
      );
    };
    const handleJoined = (value: unknown) => {
      const parsed =
        presentationCompanionJoinedEventSchema.safeParse(value);
      if (!parsed.success || parsed.data.sessionId !== sessionId) return;
      setStatus("connected");
      setError("");
    };
    const handleAuthorityChanged = (value: unknown) => {
      const parsed =
        presentationCompanionAuthorityChangedEventSchema.safeParse(value);
      if (!parsed.success || parsed.data.sessionId !== sessionId) return;
      const nextAuthority = parsed.data.payload.authorityEpochId;
      if (authorityEpochRef.current !== nextAuthority) {
        authorityEpochRef.current = nextAuthority;
        setAuthorityEpochId(nextAuthority);
        cursorRef.current = {
          output: null,
          snapshotPending: false,
        };
        setOutput(null);
        return;
      }
      const currentOutput = cursorRef.current.output;
      if (currentOutput) {
        cursorRef.current = {
          ...cursorRef.current,
          snapshotPending: true,
        };
        requestSnapshot(currentOutput);
      }
    };
    const handleOutput = (value: unknown) => {
      const parsed =
        presentationCompanionOutputStateEventSchema.safeParse(value);
      if (!parsed.success || parsed.data.sessionId !== sessionId) return;
      const incoming = parsed.data.payload;
      if (
        authorityEpochRef.current &&
        incoming.authorityEpochId !== authorityEpochRef.current
      ) {
        return;
      }
      if (!authorityEpochRef.current) {
        authorityEpochRef.current = incoming.authorityEpochId;
        setAuthorityEpochId(incoming.authorityEpochId);
      }
      const consumed = consumeCompanionOutputState(
        cursorRef.current,
        incoming,
      );
      const outputChanged =
        consumed.cursor.output !== cursorRef.current.output;
      cursorRef.current = consumed.cursor;
      if (outputChanged) {
        setOutput(consumed.cursor.output);
      }
      if (consumed.requestSnapshot) {
        requestSnapshot(incoming);
      }
    };
    const handleRevoked = (value: unknown) => {
      const parsed =
        presentationCompanionRevokedEventSchema.safeParse(value);
      if (!parsed.success || parsed.data.sessionId !== sessionId) return;
      setStatus("revoked");
      setError("발표자가 iPad 연결을 종료했습니다.");
    };
    const handleError = (value: unknown) => {
      const parsed =
        presentationCompanionErrorEventSchema.safeParse(value);
      if (!parsed.success || parsed.data.sessionId !== sessionId) return;
      if (
        parsed.data.payload.code === "AUTH_REQUIRED" ||
        parsed.data.payload.code === "STALE_GENERATION" ||
        parsed.data.payload.code === "SESSION_UNAVAILABLE"
      ) {
        setStatus("failed");
        setError("iPad 발표 도우미 연결을 다시 확인해주세요.");
      }
    };

    socket.on("connect", join);
    socket.on("disconnect", handleDisconnect);
    socket.on("presentation:companion:joined", handleJoined);
    socket.on(
      "presentation:companion:authority-changed",
      handleAuthorityChanged,
    );
    socket.on("presentation:companion:output-state", handleOutput);
    socket.on("presentation:companion:revoked", handleRevoked);
    socket.on("presentation:error", handleError);
    if (socket.connected) join();

    const heartbeatId = window.setInterval(() => {
      heartbeatStartedAt = performance.now();
      socket.emit(
        "presentation:companion:heartbeat",
        { sessionId },
        () => {
          const rttMs = Math.max(0, performance.now() - heartbeatStartedAt);
          socket.emit("presentation:companion:heartbeat", {
            sessionId,
            rttMs,
          });
        },
      );
    }, 5_000);

    return () => {
      window.clearInterval(heartbeatId);
      socket.off("connect", join);
      socket.off("disconnect", handleDisconnect);
      socket.off("presentation:companion:joined", handleJoined);
      socket.off(
        "presentation:companion:authority-changed",
        handleAuthorityChanged,
      );
      socket.off("presentation:companion:output-state", handleOutput);
      socket.off("presentation:companion:revoked", handleRevoked);
      socket.off("presentation:error", handleError);
      socket.disconnect();
    };
  }, [createSocket, sessionId]);

  return { authorityEpochId, error, output, status };
}
