import {
  presentationCompanionAuthorityChangedEventSchema,
  presentationCompanionPresenceEventSchema,
  presentationCompanionSnapshotRequestEventSchema,
  presentationCompanionOutputStateSchema,
  type PresentationCompanionOutputState,
} from "@orbit/shared";
import { useCallback, useEffect, useRef, useState } from "react";
import { io, type Socket } from "socket.io-client";
import type { PresenterSlideshowState } from "../rehearsal/presenter/presenterStateStore";

type PresenterCompanionSocket = Pick<
  Socket,
  "connected" | "disconnect" | "emit" | "off" | "on"
>;

type AuthorityStatus = "disabled" | "claiming" | "active" | "standby";

export function usePresenterCompanionAuthority(input: {
  enabled: boolean;
  sessionId: string | null | undefined;
  state: PresenterSlideshowState | null;
  createSocket?: () => PresenterCompanionSocket;
}) {
  const [status, setStatus] = useState<AuthorityStatus>("disabled");
  const authorityEpochIdRef = useRef("");
  const outputRevisionRef = useRef(-1);
  const socketRef = useRef<PresenterCompanionSocket | null>(null);
  const stateRef = useRef(input.state);
  const latestOutputRef =
    useRef<PresentationCompanionOutputState | null>(null);
  stateRef.current = input.state;

  const publishCurrentOutput = useCallback(() => {
    const socket = socketRef.current;
    const state = stateRef.current;
    const sessionId = input.sessionId;
    if (
      !socket ||
      !state ||
      !sessionId ||
      !authorityEpochIdRef.current
    ) {
      return;
    }
    const output = presentationCompanionOutputStateSchema.parse({
      sessionId,
      authorityEpochId: authorityEpochIdRef.current,
      outputRevision: Math.max(0, outputRevisionRef.current),
      surfaceRevision: 0,
      surfaceId: createCompanionSurfaceId(state.slideId),
      outputMode: state.audienceOutputMode,
      slideId: state.slideId,
      slideIndex: state.slideIndex,
      animationStep: state.stepIndex,
    });
    latestOutputRef.current = output;
    socket.emit("presentation:companion:output-state", output);
  }, [input.sessionId]);

  useEffect(() => {
    if (!input.enabled || !input.sessionId || !input.state) {
      setStatus("disabled");
      return;
    }
    const sessionId = input.sessionId;
    const socket =
      input.createSocket?.() ?? io({ withCredentials: true });
    socketRef.current = socket;
    authorityEpochIdRef.current = createAuthorityEpochId();
    outputRevisionRef.current = -1;
    latestOutputRef.current = null;

    const claim = () => {
      setStatus("claiming");
      socket.emit(
        "presentation:companion:authority-claim",
        {
          sessionId,
          authorityEpochId: authorityEpochIdRef.current,
        },
        (response: unknown) => {
          if (
            typeof response === "object" &&
            response !== null &&
            "claimed" in response &&
            response.claimed === true
          ) {
            setStatus("active");
          }
        },
      );
    };
    const handleDisconnect = () => setStatus("standby");
    const handleAuthorityChanged = (value: unknown) => {
      const parsed =
        presentationCompanionAuthorityChangedEventSchema.safeParse(value);
      if (!parsed.success || parsed.data.sessionId !== sessionId) return;
      setStatus(
        parsed.data.payload.authorityEpochId ===
          authorityEpochIdRef.current
          ? "active"
          : "standby",
      );
    };
    const handlePresence = (value: unknown) => {
      const parsed =
        presentationCompanionPresenceEventSchema.safeParse(value);
      if (
        parsed.success &&
        parsed.data.sessionId === sessionId &&
        parsed.data.payload.connected
      ) {
        publishCurrentOutput();
      }
    };
    const handleSnapshotRequest = (value: unknown) => {
      const parsed =
        presentationCompanionSnapshotRequestEventSchema.safeParse(value);
      if (
        parsed.success &&
        parsed.data.sessionId === sessionId &&
        parsed.data.payload.authorityEpochId ===
          authorityEpochIdRef.current
      ) {
        publishCurrentOutput();
      }
    };

    socket.on("connect", claim);
    socket.on("disconnect", handleDisconnect);
    socket.on(
      "presentation:companion:authority-changed",
      handleAuthorityChanged,
    );
    socket.on("presentation:companion:presence", handlePresence);
    socket.on(
      "presentation:companion:snapshot-request",
      handleSnapshotRequest,
    );
    if (socket.connected) claim();
    const heartbeatId = window.setInterval(() => {
      socket.emit("presentation:companion:authority-heartbeat", {
        sessionId,
        authorityEpochId: authorityEpochIdRef.current,
      });
    }, 5_000);

    return () => {
      window.clearInterval(heartbeatId);
      socket.off("connect", claim);
      socket.off("disconnect", handleDisconnect);
      socket.off(
        "presentation:companion:authority-changed",
        handleAuthorityChanged,
      );
      socket.off("presentation:companion:presence", handlePresence);
      socket.off(
        "presentation:companion:snapshot-request",
        handleSnapshotRequest,
      );
      socket.disconnect();
      socketRef.current = null;
      latestOutputRef.current = null;
    };
  }, [
    input.createSocket,
    input.enabled,
    input.sessionId,
    Boolean(input.state),
    publishCurrentOutput,
  ]);

  useEffect(() => {
    if (!input.enabled || !input.state || status !== "active") return;
    outputRevisionRef.current += 1;
    publishCurrentOutput();
  }, [
    input.enabled,
    input.state?.audienceOutputMode,
    input.state?.slideId,
    input.state?.slideIndex,
    input.state?.stepIndex,
    publishCurrentOutput,
    status,
  ]);

  return {
    authorityEpochId: authorityEpochIdRef.current || null,
    publishCurrentOutput,
    status,
  };
}

export function createCompanionSurfaceId(slideId: string): string {
  const safePrefix = slideId.replace(/[^A-Za-z0-9_-]/g, "_").slice(0, 32);
  return `surface_${safePrefix}_${fnv1a(slideId)}`;
}

function createAuthorityEpochId(): string {
  return `epoch_${crypto.randomUUID().replace(/-/g, "")}`;
}

function fnv1a(value: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(36);
}
