import type { Deck } from "@orbit/shared";
import {
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Circle,
  EyeOff,
  ListChecks,
  Maximize2,
  Monitor,
  Power,
  Timer,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { splitSpeakerNotesIntoSentences } from "../speech/phraseExtractor";
import {
  createPresenterCommandMessage,
  createPresenterRemoteHeartbeatMessage,
  createPresenterRemoteReadyMessage,
  getPresentationChannelName,
  isPresentationChannelMessage,
  matchesPresentationChannelIdentity,
  type PresentationChannelIdentity,
  type PresentationChannelMessage,
  type PresenterRemoteCommand,
} from "./presentationChannel";
import type { PresenterSlideshowState } from "./presenterStateStore";
import { SlideshowRenderer } from "./SlideshowRenderer";
import { usePresenterKeyboard } from "./usePresenterKeyboard";

type ChannelLike = Pick<BroadcastChannel, "close" | "postMessage"> & {
  onmessage: ((event: MessageEvent) => void) | null;
};

export type PresenterRemoteChannelFactory = (
  channelName: string,
) => ChannelLike;

export function PresenterRemoteWindow(props: {
  channelFactory?: PresenterRemoteChannelFactory;
  deck: Deck;
  identity: PresentationChannelIdentity;
  initialState: PresenterSlideshowState;
}) {
  const {
    channelFactory = createBroadcastChannel,
    deck,
    identity,
    initialState,
  } = props;
  const [state, setState] = useState(initialState);
  const [channelError, setChannelError] = useState("");
  const [isBlanked, setBlanked] = useState(false);
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
    channelRef.current?.postMessage(
      createPresenterCommandMessage({ command, identity }),
    );
  };

  const requestRemoteFullscreen = () => {
    const request = document.documentElement.requestFullscreen?.();
    if (request) {
      void request.catch(() => undefined);
    }
  };

  usePresenterKeyboard({
    onNextStep: () => sendCommand({ action: "next-step" }),
    onPreviousSlide: () => sendCommand({ action: "prev" }),
  });

  const slideContext = useMemo(
    () => getPresenterRemoteSlideContext(deck, state),
    [deck, state],
  );
  const { nextSlide, slide, slideNumber } = slideContext;
  const notes = slide?.speakerNotes?.trim() || "발표자 노트가 없습니다.";
  const noteSentences = useMemo(
    () => splitPresenterRemoteNotes(notes),
    [notes],
  );
  const currentSentenceIndex =
    noteSentences.length > 0
      ? Math.min(Math.max(state.stepIndex, 0), noteSentences.length - 1)
      : -1;
  const currentCueText =
    currentSentenceIndex >= 0
      ? noteSentences[currentSentenceIndex]
      : "현재 큐가 없습니다.";
  const keywordRows = useMemo(
    () => getPresenterRemoteKeywordRows(slide, state.stepIndex),
    [slide, state.stepIndex],
  );
  const remainingTime = formatPresenterRemoteDuration(
    getEstimatedRemainingSeconds(slide, noteSentences.length, state.stepIndex),
  );
  const previewScale = getPresenterRemotePreviewScale(deck);
  const visibleSlides = getPresenterRemoteVisibleSlides(deck, state.slideIndex);
  const cueProgressCurrent =
    noteSentences.length > 0
      ? Math.min(currentSentenceIndex + 1, noteSentences.length)
      : 0;
  const cueProgressTotal = Math.max(noteSentences.length, 1);

  return (
    <main className="presenter-remote-shell" aria-label="발표자 제어 창">
      <header className="presenter-remote-header">
        <span>
          <Monitor size={16} />
          발표자 제어
        </span>
        <strong>{deck.title}</strong>
        <span className="presenter-remote-connection">
          {channelError ? "채널 오류" : "팝업 연결됨"}
        </span>
      </header>
      {channelError ? (
        <section className="presenter-remote-status" role="status">
          {channelError}
        </section>
      ) : null}

      <section
        className="presenter-remote-stage"
        aria-label="발표자 모드 큐 보드"
      >
        <aside
          className="presenter-remote-preview-rail"
          aria-label="슬라이드 미리보기"
        >
          <PresenterSlidePreview
            deck={deck}
            label="현재 슬라이드"
            previewScale={previewScale}
            slide={slide}
            slideNumber={slideNumber}
            stepIndex={state.stepIndex}
          />
          <PresenterSlidePreview
            deck={deck}
            label="다음 슬라이드"
            previewScale={previewScale}
            slide={nextSlide}
            slideNumber={nextSlide ? slideNumber + 1 : null}
            stepIndex={0}
          />
          <nav
            className="presenter-remote-slide-list"
            aria-label="슬라이드 이동"
          >
            {visibleSlides.map(({ slide: candidate, index }) => (
              <button
                aria-current={index === state.slideIndex ? "true" : undefined}
                key={candidate.slideId}
                type="button"
                onClick={() =>
                  sendCommand({ action: "goto", slideIndex: index })
                }
              >
                <span>{index + 1}</span>
                {candidate.title || `Slide ${index + 1}`}
              </button>
            ))}
          </nav>
        </aside>

        <section className="presenter-remote-script" aria-label="발표자 대본">
          <div className="presenter-remote-section-heading">
            <span>대본</span>
            <strong>
              현재 문장 {cueProgressCurrent} / {cueProgressTotal}
            </strong>
          </div>
          <ol className="presenter-remote-script-list">
            {noteSentences.map((sentence, index) => (
              <li
                aria-current={
                  index === currentSentenceIndex ? "true" : undefined
                }
                className={
                  index === currentSentenceIndex
                    ? "presenter-remote-script-row presenter-remote-script-row--current"
                    : "presenter-remote-script-row"
                }
                key={`${sentence}-${index}`}
              >
                <span>{index + 1}</span>
                <p>{sentence}</p>
              </li>
            ))}
          </ol>
        </section>

        <aside
          className="presenter-remote-cue-sidebar"
          aria-label="키워드 및 큐 상태"
        >
          <section
            className="presenter-remote-cue-panel"
            aria-label="핵심 키워드"
          >
            <div className="presenter-remote-section-heading">
              <span>핵심 키워드</span>
              <strong>
                <ListChecks size={15} />
                {
                  keywordRows.filter((keyword) => keyword.status === "done")
                    .length
                }
                /{keywordRows.length}
              </strong>
            </div>
            <ul className="presenter-remote-keyword-list">
              {keywordRows.map((keyword) => (
                <li
                  className={`presenter-remote-keyword-row presenter-remote-keyword-row--${keyword.status}`}
                  key={keyword.keywordId}
                >
                  {keyword.status === "done" ? (
                    <CheckCircle2 aria-hidden="true" size={17} />
                  ) : (
                    <Circle aria-hidden="true" size={17} />
                  )}
                  <span>{keyword.text}</span>
                </li>
              ))}
            </ul>
          </section>

          <section className="presenter-remote-cue-panel" aria-label="현재 큐">
            <div className="presenter-remote-section-heading">
              <span>현재 큐</span>
              <strong>
                Step {Math.max(0, state.stepIndex) + 1} / {cueProgressTotal}
              </strong>
            </div>
            <div className="presenter-remote-current-cue">
              <ChevronRight size={20} />
              <p>{currentCueText}</p>
            </div>
          </section>

          <section
            className="presenter-remote-timing"
            aria-label="발표 시간 상태"
          >
            <div>
              <Timer size={16} />
              <span>남은 시간</span>
              <strong>{remainingTime}</strong>
            </div>
            <div>
              <Monitor size={16} />
              <span>현재 슬라이드</span>
              <strong>
                {slideNumber} / {deck.slides.length}
              </strong>
            </div>
          </section>
        </aside>
      </section>

      {isBlanked ? (
        <section className="presenter-remote-blank-status" role="status">
          팝업 가림 모드가 켜져 있습니다.
        </section>
      ) : null}

      <div className="presenter-remote-command-dock" aria-label="발표 제어">
        <button
          className="presenter-remote-command"
          type="button"
          onClick={() => sendCommand({ action: "prev" })}
        >
          <ChevronLeft size={17} />
          이전
        </button>
        <button
          className="presenter-remote-command presenter-remote-command--primary"
          type="button"
          onClick={() => sendCommand({ action: "next-step" })}
        >
          다음
          <ChevronRight size={17} />
        </button>
        <button
          aria-pressed={isBlanked}
          className="presenter-remote-command"
          type="button"
          onClick={() => setBlanked((current) => !current)}
        >
          <EyeOff size={17} />
          팝업 가림
        </button>
        <button
          className="presenter-remote-command"
          type="button"
          onClick={requestRemoteFullscreen}
        >
          <Maximize2 size={17} />
          전체 화면
        </button>
        <button
          className="presenter-remote-command presenter-remote-command--danger"
          type="button"
          onClick={() => window.close()}
        >
          <Power size={17} />
          발표 종료
        </button>
      </div>
    </main>
  );
}

export function applyPresenterRemoteMessage(
  current: PresenterSlideshowState,
  message: PresentationChannelMessage,
): PresenterSlideshowState {
  if (
    message.type === "presenter-snapshot" ||
    message.type === "presenter-state"
  ) {
    return message.state;
  }

  return current;
}

function createBroadcastChannel(channelName: string): ChannelLike {
  return new BroadcastChannel(channelName);
}

type PresenterRemoteSlide = Deck["slides"][number];

type PresenterRemoteKeywordRow = {
  keywordId: string;
  status: "active" | "done" | "pending";
  text: string;
};

function PresenterSlidePreview(props: {
  deck: Deck;
  label: string;
  previewScale: number;
  slide: PresenterRemoteSlide | undefined;
  slideNumber: number | null;
  stepIndex: number;
}) {
  const { deck, label, previewScale, slide, slideNumber, stepIndex } = props;

  return (
    <section className="presenter-remote-preview" aria-label={label}>
      <div className="presenter-remote-preview-title">
        <span>{label}</span>
        <strong>
          {slideNumber ? `${slideNumber}`.padStart(2, "0") : "--"}
        </strong>
      </div>
      <div className="presenter-remote-preview-frame">
        {slide ? (
          <SlideshowRenderer
            deck={deck}
            playInitialEntryAnimations={false}
            renderMode="presenter"
            scale={previewScale}
            slideId={slide.slideId}
            stepIndex={stepIndex}
          />
        ) : (
          <div className="presenter-remote-preview-empty">마지막 슬라이드</div>
        )}
      </div>
      <p>{slide?.title || (slide ? slide.slideId : "다음 슬라이드 없음")}</p>
    </section>
  );
}

export function getPresenterRemoteSlideContext(
  deck: Deck,
  state: PresenterSlideshowState,
) {
  const slide =
    deck.slides[state.slideIndex] ??
    deck.slides.find((candidate) => candidate.slideId === state.slideId) ??
    deck.slides[0];
  const slideIndex = slide
    ? deck.slides.findIndex((candidate) => candidate.slideId === slide.slideId)
    : 0;
  const normalizedSlideIndex = slideIndex >= 0 ? slideIndex : 0;

  return {
    nextSlide: deck.slides[normalizedSlideIndex + 1],
    slide,
    slideNumber: deck.slides.length > 0 ? normalizedSlideIndex + 1 : 0,
  };
}

export function splitPresenterRemoteNotes(notes: string) {
  const sentences = splitSpeakerNotesIntoSentences(notes);
  return sentences.length > 0 ? sentences : [notes.trim()].filter(Boolean);
}

export function getPresenterRemoteKeywordRows(
  slide: PresenterRemoteSlide | undefined,
  stepIndex: number,
): PresenterRemoteKeywordRow[] {
  const keywords = slide?.keywords ?? [];

  if (keywords.length === 0) {
    return [
      {
        keywordId: "no-keywords",
        status: "pending",
        text: "등록된 키워드 없음",
      },
    ];
  }

  const activeIndex = Math.min(Math.max(stepIndex, 0), keywords.length - 1);

  return keywords.slice(0, 5).map((keyword, index) => ({
    keywordId: keyword.keywordId,
    status:
      index < activeIndex
        ? "done"
        : index === activeIndex
          ? "active"
          : "pending",
    text: keyword.text,
  }));
}

function getPresenterRemoteVisibleSlides(
  deck: Deck,
  currentSlideIndex: number,
) {
  const start = Math.max(
    0,
    Math.min(currentSlideIndex - 2, deck.slides.length - 5),
  );
  return deck.slides.slice(start, start + 5).map((slide, offset) => ({
    index: start + offset,
    slide,
  }));
}

function getPresenterRemotePreviewScale(deck: Deck) {
  const maxPreviewWidth = 220;
  return Math.min(0.22, maxPreviewWidth / deck.canvas.width);
}

function getEstimatedRemainingSeconds(
  slide: PresenterRemoteSlide | undefined,
  sentenceCount: number,
  stepIndex: number,
) {
  const estimatedSeconds = slide?.estimatedSeconds ?? 60;
  const totalSteps = Math.max(sentenceCount, 1);
  const completedRatio =
    Math.min(Math.max(stepIndex, 0), totalSteps) / totalSteps;
  return Math.max(0, Math.round(estimatedSeconds * (1 - completedRatio)));
}

function formatPresenterRemoteDuration(seconds: number) {
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return `${minutes}:${remainingSeconds.toString().padStart(2, "0")}`;
}
