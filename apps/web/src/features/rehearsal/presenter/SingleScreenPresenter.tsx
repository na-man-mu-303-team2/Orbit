import type { Deck } from "@orbit/shared";
import { Maximize2, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { SlideRuntimeHighlight } from "../../slides/rendering";
import type { SlideshowRuntimeSnapshot } from "./slideshowRuntime";
import { SlideshowRenderer } from "./SlideshowRenderer";

export function SingleScreenPresenter(props: {
  deck: Deck;
  highlights?: SlideRuntimeHighlight[];
  isFullscreen?: boolean;
  onExit: () => void;
  runtime: SlideshowRuntimeSnapshot;
  slideElapsedLabel: string;
  slideId: string;
  slideTargetLabel: string;
  totalTimeLabel: string;
}) {
  const {
    deck,
    highlights = [],
    onExit,
    runtime,
    slideElapsedLabel,
    slideId,
    slideTargetLabel,
    totalTimeLabel
  } = props;
  const rootRef = useRef<HTMLDivElement>(null);
  const [fullscreenRequested, setFullscreenRequested] = useState(false);
  const liveIsFullscreen = useSingleScreenFullscreenState();
  const isFullscreen = props.isFullscreen ?? liveIsFullscreen;

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onExit();
      }
    };
    const handleFullscreenChange = () => {
      if (fullscreenRequested && !document.fullscreenElement) {
        onExit();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    document.addEventListener("fullscreenchange", handleFullscreenChange);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      document.removeEventListener("fullscreenchange", handleFullscreenChange);
    };
  }, [fullscreenRequested, onExit]);

  return (
    <main className="single-screen-presenter" ref={rootRef}>
      <div className="single-screen-stage" aria-label="단일 화면 슬라이드">
        <SlideshowRenderer
          deck={deck}
          highlights={highlights}
          renderMode="single-screen"
          runtime={runtime}
          scale={getSingleScreenScale(deck)}
          slideId={slideId}
        />
      </div>
      <div className="single-screen-timer-overlay" aria-label="발표 타이머">
        <span>
          전체 <strong>{totalTimeLabel}</strong>
        </span>
        <span>
          현재 슬라이드 <strong>{slideElapsedLabel}</strong> / {slideTargetLabel}
        </span>
      </div>
      {!isFullscreen ? (
        <div className="single-screen-actions">
          <button
            type="button"
            onClick={() => {
              void requestSingleScreenFullscreen(rootRef.current).then((ok) => {
                setFullscreenRequested(ok);
              });
            }}
          >
            <Maximize2 size={17} />
            전체화면 시작
          </button>
          <button type="button" onClick={onExit} aria-label="단일 화면 종료">
            <X size={18} />
          </button>
        </div>
      ) : null}
    </main>
  );
}

export function getSingleScreenScale(deck: Deck, viewport = readViewportSize()) {
  if (viewport.width <= 0 || viewport.height <= 0) {
    return 1;
  }

  return Math.min(viewport.width / deck.canvas.width, viewport.height / deck.canvas.height);
}

async function requestSingleScreenFullscreen(target: HTMLElement | null) {
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

function readViewportSize() {
  if (typeof window === "undefined") {
    return { height: 0, width: 0 };
  }

  return {
    height: window.innerHeight,
    width: window.innerWidth
  };
}

function useSingleScreenFullscreenState() {
  const [isFullscreen, setIsFullscreen] = useState(readSingleScreenFullscreenState);

  useEffect(() => {
    const updateFullscreenState = () => {
      setIsFullscreen(readSingleScreenFullscreenState());
    };

    document.addEventListener("fullscreenchange", updateFullscreenState);
    return () => {
      document.removeEventListener("fullscreenchange", updateFullscreenState);
    };
  }, []);

  return isFullscreen;
}

function readSingleScreenFullscreenState() {
  return typeof document !== "undefined" && Boolean(document.fullscreenElement);
}
