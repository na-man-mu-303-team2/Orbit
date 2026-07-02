import type { Deck } from "@orbit/shared";
import { useEffect, useMemo, useRef, useState } from "react";
import type { PresenterSlideshowState } from "./presenterStateStore";
import {
  createPresentationSessionId,
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
  state: PresenterSlideshowState | null;
  triggerAnimationIds: string[];
}) {
  const { channelFactory = createBroadcastChannel, deck, state, triggerAnimationIds } = args;
  const [sessionId] = useState(() => createPresentationSessionId());
  const [status, setStatus] = useState<PresentationChannelStatus>("idle");
  const channelRef = useRef<PresentationChannelLike | null>(null);
  const controllerRef = useRef<PresentationPublisherController | null>(null);
  const latestRef = useRef({ deck, state, triggerAnimationIds });
  latestRef.current = { deck, state, triggerAnimationIds };

  const identity = useMemo<PresentationChannelIdentity | null>(
    () => (deck ? { deckId: deck.deckId, sessionId } : null),
    [deck?.deckId, sessionId]
  );

  useEffect(() => {
    if (!identity || !deck || !state) {
      return;
    }

    setStatus("opening");
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
          state: latest.state,
          triggerAnimationIds: latest.triggerAnimationIds
        });
      },
      getState: () => {
        const latest = latestRef.current;
        if (!latest.state) {
          return null;
        }

        return createPresenterStateMessage({
          identity,
          state: latest.state,
          triggerAnimationIds: latest.triggerAnimationIds
        });
      },
      identity,
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
    if (!deck || !state) {
      return;
    }

    controllerRef.current?.publishState();
  }, [deck, state, triggerAnimationIds]);

  return {
    sessionId,
    status
  };
}

export function createPresentationPublisherController(args: {
  channel: Pick<PresentationChannelLike, "close" | "postMessage">;
  getSnapshot: () => PresenterSnapshotMessage | null;
  getState: () => PresenterStateMessage | null;
  identity: PresentationChannelIdentity;
  onStatusChange?: (status: PresentationChannelStatus) => void;
}): PresentationPublisherController {
  const { channel, getSnapshot, getState, identity, onStatusChange } = args;

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
