import type { Deck } from "@orbit/shared";
import { useEffect, useMemo, useRef, useState } from "react";
import type { PresenterSlideshowState } from "./presenterStateStore";
import type { SlideshowRuntimeSnapshot } from "./slideshowRuntime";
import {
  createPresentationSessionId,
  createPresenterHeartbeatMessage,
  createPresenterSnapshotMessage,
  createPresenterStateMessage,
  getPresentationChannelName,
  isPresentationChannelMessage,
  matchesPresentationChannelIdentity,
  type PresentationChannelIdentity,
  type PresentationChannelMessage,
  type PresenterSnapshotMessage,
  type PresenterStateMessage
} from "./presentationChannel";

export type PresentationChannelStatus =
  | "idle"
  | "opening"
  | "connected"
  | "stale"
  | "closed"
  | "unsupported"
  | "failed";

export type PresentationChannelLike = Pick<BroadcastChannel, "close" | "postMessage"> & {
  onmessage: ((event: MessageEvent) => void) | null;
};

export type PresentationChannelFactory = (channelName: string) => PresentationChannelLike;

export type PresentationPublisherController = {
  close: () => void;
  handleIncoming: (data: unknown) => void;
  publishSnapshot: () => void;
  publishState: () => void;
};

export function usePresentationChannelPublisher(args: {
  channelFactory?: PresentationChannelFactory;
  deck: Deck | null;
  runtime: SlideshowRuntimeSnapshot | null;
  state: PresenterSlideshowState | null;
}) {
  const {
    channelFactory = createBroadcastChannel,
    deck,
    runtime,
    state,
  } = args;
  const [sessionId] = useState(() => createPresentationSessionId());
  const [status, setStatus] = useState<PresentationChannelStatus>("idle");
  const channelRef = useRef<PresentationChannelLike | null>(null);
  const controllerRef = useRef<PresentationPublisherController | null>(null);
  const lastPeerSeenAtRef = useRef<number | null>(null);
  const peerWaitStartedAtRef = useRef<number | null>(null);
  const latestRef = useRef({ deck, runtime, state });
  latestRef.current = { deck, runtime, state };

  const identity = useMemo<PresentationChannelIdentity | null>(
    () => (deck ? { deckId: deck.deckId, sessionId } : null),
    [deck?.deckId, sessionId]
  );

  useEffect(() => {
    if (!identity || !deck || !state) {
      return;
    }

    let channel: PresentationChannelLike;
    try {
      channel = channelFactory(getPresentationChannelName(identity));
    } catch {
      setStatus("unsupported");
      return;
    }

    const controller = createPresentationPublisherController({
      channel,
      getSnapshot: () => {
        const latest = latestRef.current;
        if (!latest.deck || !latest.state) {
          return null;
        }

        return createPresenterSnapshotMessage({
          deck: latest.deck,
          identity,
          runtime: latest.runtime ?? {
            executedAnimationIds: [],
            isComplete: true,
            stepIndex: 0,
            triggerAnimationIds: []
          },
          state: latest.state,
        });
      },
      getState: () => {
        const latest = latestRef.current;
        if (!latest.state) {
          return null;
        }

        return createPresenterStateMessage({
          identity,
          runtime: latest.runtime ?? {
            executedAnimationIds: [],
            isComplete: true,
            stepIndex: 0,
            triggerAnimationIds: []
          },
          state: latest.state,
        });
      },
      identity,
      onPeerSeen: () => {
        lastPeerSeenAtRef.current = Date.now();
        peerWaitStartedAtRef.current = null;
      },
      onStatusChange: setStatus
    });
    channel.onmessage = (event) => controller.handleIncoming(event.data);
    channelRef.current = channel;
    controllerRef.current = controller;

    return () => {
      controller.close();
      if (controllerRef.current === controller) {
        controllerRef.current = null;
      }
      if (channelRef.current === channel) {
        channelRef.current = null;
      }
    };
  }, [channelFactory, identity]);

  useEffect(() => {
    if (!identity || !channelRef.current) {
      return;
    }

    const heartbeatTimer = window.setInterval(() => {
      channelRef.current?.postMessage(createPresenterHeartbeatMessage(identity));
    }, 1000);
    const staleTimer = window.setInterval(() => {
      const lastPeerSeenAt = lastPeerSeenAtRef.current;
      if (
        isPresentationPeerStale(
          lastPeerSeenAt,
          Date.now(),
          5000,
          peerWaitStartedAtRef.current
        )
      ) {
        setStatus("stale");
      }
    }, 1000);

    return () => {
      window.clearInterval(heartbeatTimer);
      window.clearInterval(staleTimer);
    };
  }, [identity]);

  useEffect(() => {
    if (!deck || !state) {
      return;
    }

    controllerRef.current?.publishState();
  }, [deck, runtime, state]);

  return {
    publishSnapshot: () => {
      if (!controllerRef.current) {
        return;
      }

      peerWaitStartedAtRef.current = Date.now();
      setStatus((current) => (current === "connected" ? current : "opening"));
      controllerRef.current.publishSnapshot();
    },
    sessionId,
    status
  };
}

export function createPresentationPublisherController(args: {
  channel: Pick<PresentationChannelLike, "close" | "postMessage">;
  getSnapshot: () => PresenterSnapshotMessage | null;
  getState: () => PresenterStateMessage | null;
  identity: PresentationChannelIdentity;
  onPeerSeen?: () => void;
  onStatusChange?: (status: PresentationChannelStatus) => void;
}): PresentationPublisherController {
  const { channel, getSnapshot, getState, identity, onPeerSeen, onStatusChange } = args;

  return {
    close: () => {
      channel.close();
      onStatusChange?.("closed");
    },
    handleIncoming: (data: unknown) => {
      if (!isPresentationChannelMessage(data)) {
        return;
      }
      if (!matchesPresentationChannelIdentity(data, identity)) {
        return;
      }

      onPeerSeen?.();
      handlePublisherMessage(data, {
        publishSnapshot: () => {
          const snapshot = getSnapshot();
          if (snapshot) {
            channel.postMessage(snapshot);
          }
        },
        setConnected: () => onStatusChange?.("connected")
      });
    },
    publishSnapshot: () => {
      const snapshot = getSnapshot();
      if (snapshot) {
        channel.postMessage(snapshot);
      }
    },
    publishState: () => {
      const state = getState();
      if (state) {
        channel.postMessage(state);
      }
    }
  };
}

export function isPresentationPeerStale(
  lastPeerSeenAt: number | null,
  now: number,
  staleAfterMs = 5000,
  peerWaitStartedAt: number | null = lastPeerSeenAt
) {
  const staleAnchor = lastPeerSeenAt ?? peerWaitStartedAt;
  return staleAnchor !== null && now - staleAnchor > staleAfterMs;
}

function handlePublisherMessage(
  message: PresentationChannelMessage,
  handlers: {
    publishSnapshot: () => void;
    setConnected: () => void;
  }
) {
  if (message.type === "slide-window-ready") {
    handlers.publishSnapshot();
    handlers.setConnected();
    return;
  }

  if (message.type === "slide-window-heartbeat") {
    handlers.setConnected();
  }
}

function createBroadcastChannel(channelName: string): PresentationChannelLike {
  return new BroadcastChannel(channelName);
}
