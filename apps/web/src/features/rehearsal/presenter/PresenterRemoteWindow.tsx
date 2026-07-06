import type { Deck } from "@orbit/shared";
import { ChevronLeft, ChevronRight, Monitor } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  createPresenterCommandMessage,
  createPresenterRemoteHeartbeatMessage,
  createPresenterRemoteReadyMessage,
  getPresentationChannelName,
  isPresentationChannelMessage,
  matchesPresentationChannelIdentity,
  type PresentationChannelIdentity,
  type PresentationChannelMessage,
  type PresenterRemoteCommand
} from "./presentationChannel";
import type { PresenterSlideshowState } from "./presenterStateStore";
import { usePresenterKeyboard } from "./usePresenterKeyboard";

type ChannelLike = Pick<BroadcastChannel, "close" | "postMessage"> & {
  onmessage: ((event: MessageEvent) => void) | null;
};

export type PresenterRemoteChannelFactory = (channelName: string) => ChannelLike;

export function PresenterRemoteWindow(props: {
  channelFactory?: PresenterRemoteChannelFactory;
  deck: Deck;
  identity: PresentationChannelIdentity;
  initialState: PresenterSlideshowState;
}) {
  const { channelFactory = createBroadcastChannel, deck, identity, initialState } = props;
  const [state, setState] = useState(initialState);
  const [channelError, setChannelError] = useState("");
  const channelRef = useRef<ChannelLike | null>(null);

  useEffect(() => {
    let channel: ChannelLike;
    try {
      channel = channelFactory(getPresentationChannelName(identity));
    } catch {
      setChannelError("발표자 제어 채널을 열 수 없습니다.");
      return;
    }

    channelRef.current = channel;
    channel.onmessage = (event) => {
      const message = event.data;
      if (!isPresentationChannelMessage(message)) {
        return;
      }
      if (!matchesPresentationChannelIdentity(message, identity)) {
        return;
      }

      setState((current) => applyPresenterRemoteMessage(current, message));
    };
    channel.postMessage(createPresenterRemoteReadyMessage(identity));
    const heartbeatTimer = window.setInterval(() => {
      channel.postMessage(createPresenterRemoteHeartbeatMessage(identity));
    }, 1000);

    return () => {
      window.clearInterval(heartbeatTimer);
      channel.close();
      if (channelRef.current === channel) {
        channelRef.current = null;
      }
    };
  }, [channelFactory, identity]);

  const sendCommand = (command: PresenterRemoteCommand) => {
    channelRef.current?.postMessage(createPresenterCommandMessage({ command, identity }));
  };

  usePresenterKeyboard({
    onNextStep: () => sendCommand({ action: "next-step" }),
    onPreviousSlide: () => sendCommand({ action: "prev" })
  });

  const slide = useMemo(
    () =>
      deck.slides[state.slideIndex] ??
      deck.slides.find((candidate) => candidate.slideId === state.slideId) ??
      deck.slides[0],
    [deck.slides, state.slideId, state.slideIndex]
  );
  const slideNumber = Math.min(state.slideIndex + 1, deck.slides.length);
  const notes = slide?.speakerNotes?.trim() || "발표자 노트가 없습니다.";

  return (
    <main className="presenter-remote-shell" aria-label="발표자 제어 창">
      <header className="presenter-remote-header">
        <span>
          <Monitor size={16} />
          발표자 제어
        </span>
        <strong>{deck.title}</strong>
      </header>
      {channelError ? (
        <section className="presenter-remote-status" role="status">
          {channelError}
        </section>
      ) : null}
      <section className="presenter-remote-current" aria-label="현재 슬라이드">
        <span>
          {slideNumber} / {deck.slides.length}
        </span>
        <h1>{slide?.title ?? deck.title}</h1>
        <small>Step {state.stepIndex}</small>
      </section>
      <section className="presenter-remote-notes" aria-label="발표자 노트">
        <h2>Speaker notes</h2>
        <p>{notes}</p>
      </section>
      <div className="presenter-remote-actions">
        <button type="button" onClick={() => sendCommand({ action: "prev" })}>
          <ChevronLeft size={17} />
          이전
        </button>
        <button type="button" onClick={() => sendCommand({ action: "next-step" })}>
          다음
          <ChevronRight size={17} />
        </button>
      </div>
      <nav className="presenter-remote-slide-list" aria-label="슬라이드 이동">
        {deck.slides.map((candidate, index) => (
          <button
            aria-current={index === state.slideIndex ? "true" : undefined}
            key={candidate.slideId}
            type="button"
            onClick={() => sendCommand({ action: "goto", slideIndex: index })}
          >
            <span>{index + 1}</span>
            {candidate.title}
          </button>
        ))}
      </nav>
    </main>
  );
}

export function applyPresenterRemoteMessage(
  current: PresenterSlideshowState,
  message: PresentationChannelMessage
): PresenterSlideshowState {
  if (message.type === "presenter-snapshot" || message.type === "presenter-state") {
    return message.state;
  }

  return current;
}

function createBroadcastChannel(channelName: string): ChannelLike {
  return new BroadcastChannel(channelName);
}
