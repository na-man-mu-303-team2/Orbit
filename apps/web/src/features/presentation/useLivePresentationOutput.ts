import type { Deck } from "@orbit/shared";
import { useEffect, useMemo } from "react";
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

export type LivePresentationDisplayRole =
  | "presenter"
  | "slide-receiver"
  | "slide-surface";

export function useLivePresentationOutput(input: {
  audienceWindowConnected: boolean;
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
  const localChannel = usePresentationChannelPublisher({
    deck: input.deck,
    enabled: input.enabled ?? true,
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
    hostIdentity,
    localChannel,
    screenShare,
  };
}
