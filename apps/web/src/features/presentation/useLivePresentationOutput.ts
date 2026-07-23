import type {
  Deck,
  PresentationCompanionAnnotationSnapshot,
} from "@orbit/shared";
import { useEffect, useMemo, useRef } from "react";
import type { AudienceStreamBridgeWindow } from "../rehearsal/presenter/audienceStreamBridge";
import {
  createLivePresentationHostIdentity,
  type PresenterRemoteCommand,
  type ScreenShareEndedReason,
} from "../rehearsal/presenter/presentationChannel";
import type {
  AudienceOutputMode,
  PresenterSlideshowState,
} from "../rehearsal/presenter/presenterStateStore";
import { useAudienceScreenShare } from "../rehearsal/presenter/useAudienceScreenShare";
import { usePresentationChannelPublisher } from "../rehearsal/presenter/usePresentationChannelPublisher";
import { usePresenterCompanionAuthority } from "../presenter-companion/usePresenterCompanionAuthority";

export type LivePresentationDisplayRole =
  | "presenter"
  | "slide-receiver"
  | "slide-surface";

export function useLivePresentationOutput(input: {
  audienceWindowConnected: boolean;
  companionEnabled?: boolean;
  deck: Deck | null;
  displayRole: LivePresentationDisplayRole;
  enabled?: boolean;
  getAudienceWindow: () => AudienceStreamBridgeWindow | null;
  localWindowSessionId?: string;
  onCommand?: (command: PresenterRemoteCommand) => void;
  onOutputModeChange: (mode: AudienceOutputMode) => void;
  onPeerReady?: (peer: "presenter-remote" | "slide-window") => void;
  onScreenShareEnded?: (reason: ScreenShareEndedReason) => void;
  outputMode: AudienceOutputMode;
  persistedSessionId?: string | null;
  state: PresenterSlideshowState | null;
  triggerAnimationIds: string[];
}) {
  const annotationSnapshotRef =
    useRef<PresentationCompanionAnnotationSnapshot | null>(null);
  const localChannel = usePresentationChannelPublisher({
    deck: input.deck,
    enabled: input.enabled ?? true,
    getAnnotationSnapshot: () => annotationSnapshotRef.current,
    onCommand: input.onCommand,
    onPeerReady: input.onPeerReady,
    onScreenShareEnded: input.onScreenShareEnded,
    sessionId: input.localWindowSessionId,
    state: input.state,
    triggerAnimationIds: input.triggerAnimationIds,
  });
  const hostIdentity = useMemo(
    () =>
      createLivePresentationHostIdentity({
        deckId: input.deck?.deckId ?? "pending-deck",
        localWindowSessionId: localChannel.sessionId,
        persistedSessionId: input.persistedSessionId,
      }),
    [
      input.deck?.deckId,
      input.persistedSessionId,
      localChannel.sessionId,
    ],
  );
  const companionAuthority = usePresenterCompanionAuthority({
    enabled:
      Boolean(input.companionEnabled) &&
      (input.enabled ?? true) &&
      input.displayRole === "presenter",
    sessionId: input.persistedSessionId,
    state: input.state,
    onAnnotationDelta: (delta, snapshot) => {
      annotationSnapshotRef.current = snapshot;
      localChannel.publishAnnotationDelta(delta);
    },
    onAnnotationSnapshot: (snapshot) => {
      annotationSnapshotRef.current = snapshot;
      localChannel.publishAnnotationSnapshot(snapshot);
    },
  });
  useEffect(() => {
    if (!input.companionEnabled || !input.persistedSessionId) {
      annotationSnapshotRef.current = null;
    }
  }, [input.companionEnabled, input.persistedSessionId]);
  const screenShare = useAudienceScreenShare({
    connected:
      input.displayRole === "presenter" &&
      input.audienceWindowConnected &&
      localChannel.status === "connected",
    getTargetWindow: input.getAudienceWindow,
    identity: hostIdentity.localChannel,
    onOutputModeChange: input.onOutputModeChange,
    outputMode: input.outputMode,
  });

  useEffect(() => {
    if (
      localChannel.status === "stale" ||
      localChannel.status === "closed" ||
      localChannel.status === "failed"
    ) {
      screenShare.handlePeerUnavailable();
    }
  }, [localChannel.status]);

  useEffect(() => {
    if (input.displayRole !== "presenter") {
      screenShare.handlePeerUnavailable();
    }
  }, [input.displayRole]);

  return {
    companionAuthority,
    hostIdentity,
    localChannel,
    screenShare,
  };
}
