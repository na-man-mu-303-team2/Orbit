import type { Deck } from "@orbit/shared";
import { Maximize2 } from "lucide-react";
import type { ReactNode, Ref } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { SlideshowRenderer } from "./SlideshowRenderer";
import type { PresenterSlideshowState } from "./presenterStateStore";
import {
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
  const [snapshot, setSnapshot] = useState<PresentWindowSnapshot | null>(null);
  const [channelError, setChannelError] = useState("");
  const identity = useMemo(
    () => (sessionId ? { deckId, sessionId } : null),
    [deckId, sessionId]
  );

  useEffect(() => {
    if (!identity) {
      return;
    }

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

    return () => {
      channel.close();
    };
  }, [channelFactory, identity]);

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

  return <PresentWindowContent identity={identity} snapshot={snapshot} />;
}

export function PresentWindowContent(props: {
  identity: PresentationChannelIdentity;
  snapshot: PresentWindowSnapshot;
}) {
  const { identity, snapshot } = props;
  const rootRef = useRef<HTMLDivElement>(null);
  const scale = getSlideWindowScale(snapshot.deck);

  return (
    <PresentWindowShell ref={rootRef}>
      <div
        aria-label="슬라이드 전용 창"
        className="present-window-stage"
        data-deck-id={identity.deckId}
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

function readViewportSize() {
  if (typeof window === "undefined") {
    return { height: 0, width: 0 };
  }

  return {
    height: window.innerHeight,
    width: window.innerWidth
  };
}

async function requestPresentWindowFullscreen(target: HTMLElement | null) {
  if (!target || typeof target.requestFullscreen !== "function") {
    return;
  }

  await target.requestFullscreen();
}

function createBroadcastChannel(channelName: string): ChannelLike {
  return new BroadcastChannel(channelName);
}
