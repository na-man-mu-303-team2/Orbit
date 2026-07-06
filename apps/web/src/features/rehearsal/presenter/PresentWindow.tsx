import type { Deck } from "@orbit/shared";
import { Maximize2, X } from "lucide-react";
import type { ReactNode, Ref } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { SlideshowRenderer } from "./SlideshowRenderer";
import type { PresenterSlideshowState } from "./presenterStateStore";
import {
  createSlideWindowHeartbeatMessage,
  createSlideWindowReadyMessage,
  getPresentationChannelName,
  isPresentationChannelMessage,
  matchesPresentationChannelIdentity,
  type PresentationChannelIdentity,
  type PresentationChannelMessage
} from "./presentationChannel";

export type PresentWindowSnapshot = {
  deck: Deck;
  state: PresenterSlideshowState;
  triggerAnimationIds: string[];
};

type ViewportSize = {
  height: number;
  width: number;
};

type ChannelLike = Pick<BroadcastChannel, "close" | "postMessage"> & {
  onmessage: ((event: MessageEvent) => void) | null;
};

export type PresentWindowChannelFactory = (channelName: string) => ChannelLike;

export function PresentWindow(props: {
  channelFactory?: PresentWindowChannelFactory;
  deckId: string;
  sessionId?: string;
}) {
  const { channelFactory = createBroadcastChannel, deckId, sessionId } = props;
  const identity = useMemo(
    () => (sessionId ? { deckId, sessionId } : null),
    [deckId, sessionId]
  );

  if (!identity) {
    return (
      <PresentWindowShell>
        <PresentWindowStatus
          title="발표자 화면에서 슬라이드 창을 열어주세요"
          message="이 주소는 발표자 화면이 만든 세션 정보가 있어야 슬라이드를 표시합니다."
        />
      </PresentWindowShell>
    );
  }

  return (
    <PresentWindowReceiver channelFactory={channelFactory} identity={identity} />
  );
}

export function PresentWindowReceiver(props: {
  channelFactory?: PresentWindowChannelFactory;
  fullscreenMessage?: string;
  identity: PresentationChannelIdentity;
  initialSnapshot?: PresentWindowSnapshot | null;
  isFullscreen?: boolean;
  onExit?: () => void;
}) {
  const {
    channelFactory = createBroadcastChannel,
    fullscreenMessage,
    identity,
    initialSnapshot = null,
    isFullscreen,
    onExit
  } = props;
  const [snapshot, setSnapshot] = useState<PresentWindowSnapshot | null>(initialSnapshot);
  const [channelError, setChannelError] = useState("");

  useEffect(() => {
    setSnapshot(initialSnapshot);
  }, [identity.deckId, identity.sessionId, initialSnapshot]);

  useEffect(() => {
    let channel: ChannelLike;
    try {
      channel = channelFactory(getPresentationChannelName(identity));
    } catch {
      setChannelError("슬라이드 창 동기화 채널을 열 수 없습니다.");
      return;
    }

    channel.onmessage = (event) => {
      const message = event.data;
      if (!isPresentationChannelMessage(message)) {
        return;
      }
      if (!matchesPresentationChannelIdentity(message, identity)) {
        return;
      }

      setSnapshot((current) => applyPresentWindowMessage(current, message));
    };
    channel.postMessage(createSlideWindowReadyMessage(identity));
    const heartbeatTimer = window.setInterval(() => {
      channel.postMessage(createSlideWindowHeartbeatMessage(identity));
    }, 1000);

    return () => {
      window.clearInterval(heartbeatTimer);
      channel.close();
    };
  }, [channelFactory, identity]);

  if (channelError) {
    return (
      <PresentWindowShell>
        <PresentWindowStatus title="슬라이드 창을 연결하지 못했습니다" message={channelError} />
      </PresentWindowShell>
    );
  }

  if (!snapshot) {
    return (
      <PresentWindowShell>
        <PresentWindowStatus
          title="발표자 화면을 기다리는 중"
          message="발표자 화면에서 현재 슬라이드 상태를 보내면 이 창에 표시됩니다."
        />
      </PresentWindowShell>
    );
  }

  return (
    <PresentWindowContent
      fullscreenMessage={fullscreenMessage}
      identity={identity}
      isFullscreen={isFullscreen}
      onExit={onExit}
      snapshot={snapshot}
    />
  );
}

export function PresentWindowContent(props: {
  fullscreenMessage?: string;
  identity: PresentationChannelIdentity;
  isFullscreen?: boolean;
  onExit?: () => void;
  snapshot: PresentWindowSnapshot;
  viewport?: ViewportSize;
}) {
  const { fullscreenMessage, identity, onExit, snapshot } = props;
  const rootRef = useRef<HTMLDivElement>(null);
  const liveViewport = usePresentWindowViewport();
  const liveIsFullscreen = usePresentWindowFullscreenState();
  const isFullscreen = props.isFullscreen ?? liveIsFullscreen;
  const scale = getSlideWindowScale(snapshot.deck, props.viewport ?? liveViewport);

  return (
    <PresentWindowShell ref={rootRef}>
      <div
        aria-label="슬라이드 전용 창"
        className="present-window-stage"
        data-deck-id={identity.deckId}
        data-scale={scale}
        data-session-id={identity.sessionId}
      >
        <SlideshowRenderer
          deck={snapshot.deck}
          highlights={snapshot.state.highlights}
          renderMode="slide-window"
          scale={scale}
          slideId={snapshot.state.slideId}
          stepIndex={snapshot.state.stepIndex}
          triggerAnimationIds={snapshot.triggerAnimationIds}
        />
      </div>
      {!isFullscreen || fullscreenMessage || onExit ? (
        <div className="present-window-actions">
          {fullscreenMessage ? (
            <span className="present-window-action-message">{fullscreenMessage}</span>
          ) : null}
          {!isFullscreen ? (
            <button
              className="present-window-fullscreen"
              type="button"
              onClick={() => {
                void requestPresentWindowFullscreen(rootRef.current);
              }}
            >
              <Maximize2 size={17} />
              전체화면
            </button>
          ) : null}
          {onExit ? (
            <button
              className="present-window-exit"
              type="button"
              onClick={onExit}
            >
              <X size={17} />
              발표자 화면으로 돌아가기
            </button>
          ) : null}
        </div>
      ) : null}
    </PresentWindowShell>
  );
}

export function applyPresentWindowMessage(
  current: PresentWindowSnapshot | null,
  message: PresentationChannelMessage
): PresentWindowSnapshot | null {
  if (message.type === "presenter-snapshot") {
    return {
      deck: message.deck,
      state: message.state,
      triggerAnimationIds: message.triggerAnimationIds
    };
  }

  if (message.type === "presenter-state" && current) {
    return {
      ...current,
      state: message.state,
      triggerAnimationIds: message.triggerAnimationIds
    };
  }

  return current;
}

export function getSlideWindowScale(deck: Deck, viewport = readViewportSize()) {
  if (viewport.width <= 0 || viewport.height <= 0) {
    return 1;
  }

  return Math.min(viewport.width / deck.canvas.width, viewport.height / deck.canvas.height);
}

function PresentWindowStatus(props: { message: string; title: string }) {
  return (
    <section className="present-window-status" role="status">
      <h1>{props.title}</h1>
      <p>{props.message}</p>
    </section>
  );
}

const PresentWindowShell = (props: {
  children: ReactNode;
  ref?: Ref<HTMLDivElement>;
}) => (
  <main className="present-window-shell" ref={props.ref}>
    {props.children}
  </main>
);

function usePresentWindowViewport() {
  const [viewport, setViewport] = useState(readViewportSize);

  useEffect(() => {
    const updateViewport = () => setViewport(readViewportSize());

    window.addEventListener("resize", updateViewport);
    document.addEventListener("fullscreenchange", updateViewport);

    return () => {
      window.removeEventListener("resize", updateViewport);
      document.removeEventListener("fullscreenchange", updateViewport);
    };
  }, []);

  return viewport;
}

function usePresentWindowFullscreenState() {
  const [isFullscreen, setIsFullscreen] = useState(readPresentWindowFullscreenState);

  useEffect(() => {
    if (typeof document === "undefined") {
      return;
    }

    const updateFullscreenState = () => {
      setIsFullscreen(readPresentWindowFullscreenState());
    };

    document.addEventListener("fullscreenchange", updateFullscreenState);

    return () => {
      document.removeEventListener("fullscreenchange", updateFullscreenState);
    };
  }, []);

  return isFullscreen;
}

function readViewportSize(): ViewportSize {
  if (typeof window === "undefined") {
    return { height: 0, width: 0 };
  }

  return {
    height: window.innerHeight,
    width: window.innerWidth
  };
}

function readPresentWindowFullscreenState() {
  return typeof document !== "undefined" && Boolean(document.fullscreenElement);
}

export async function requestPresentWindowFullscreen(target: HTMLElement | null) {
  if (!target || typeof target.requestFullscreen !== "function") {
    return false;
  }

  try {
    await target.requestFullscreen();
    return true;
  } catch {
    return false;
  }
}

function createBroadcastChannel(channelName: string): ChannelLike {
  return new BroadcastChannel(channelName);
}
