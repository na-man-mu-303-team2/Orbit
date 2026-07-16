import type { Deck, RehearsalReport } from "@orbit/shared";
import { ChevronLeft, ChevronRight, FileText, StickyNote } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { resolveEditorAssetUrl } from "../editor/shared/editorAssetUrl";
import { buildRehearsalSlideAnalysisCards } from "./rehearsalSlideAnalysisModel";
import "./rehearsal-slide-coaching-viewer.css";

type Props = {
  deck: Deck | null;
  prevReports: RehearsalReport[];
  report: RehearsalReport;
};

export function RehearsalSlideCoachingViewer({ deck, prevReports, report }: Props) {
  const [activeIndex, setActiveIndex] = useState(0);
  const slides = useMemo(
    () => [...(deck?.slides ?? [])].sort((a, b) => a.order - b.order),
    [deck],
  );
  const feedbackBySlideId = useMemo(
    () => new Map(
      buildRehearsalSlideAnalysisCards(deck, prevReports, report).map((card) => [
        card.slideId,
        card,
      ]),
    ),
    [deck, prevReports, report],
  );

  useEffect(() => {
    setActiveIndex(0);
  }, [deck?.deckId, report.runId]);

  if (!deck || slides.length === 0) return null;

  const boundedIndex = Math.min(activeIndex, slides.length - 1);
  const slide = slides[boundedIndex]!;
  const previousSlide = slides[boundedIndex - 1] ?? null;
  const nextSlide = slides[boundedIndex + 1] ?? null;
  const feedback = feedbackBySlideId.get(slide.slideId);
  const feedbackItems = feedback?.feedbackItems ?? [];

  return (
    <section className="rrd-slide-coaching" aria-labelledby="rrd-slide-coaching-title">
      <div className="rrd-slide-coaching-stage">
        <header>
          <div>
            <span>SLIDE REVIEW</span>
            <h2 id="rrd-slide-coaching-title">슬라이드별 코칭</h2>
          </div>
          <strong>{boundedIndex + 1} / {slides.length}</strong>
        </header>

        <div className="rrd-slide-coaching-preview-row">
          <button
            type="button"
            className="rrd-slide-coaching-nav"
            aria-label="이전 슬라이드"
            disabled={boundedIndex === 0}
            onClick={() => setActiveIndex((current) => Math.max(0, current - 1))}
          >
            <ChevronLeft aria-hidden="true" size={28} />
          </button>

          <div className="rrd-slide-coaching-carousel">
            <div className="rrd-slide-coaching-peek is-previous" aria-hidden="true">
              {previousSlide ? <SlidePreview slide={previousSlide} variant="peek" /> : null}
            </div>
            <SlidePreview slide={slide} variant="main" />
            <div className="rrd-slide-coaching-peek is-next" aria-hidden="true">
              {nextSlide ? <SlidePreview slide={nextSlide} variant="peek" /> : null}
            </div>
          </div>

          <button
            type="button"
            className="rrd-slide-coaching-nav"
            aria-label="다음 슬라이드"
            disabled={boundedIndex === slides.length - 1}
            onClick={() =>
              setActiveIndex((current) => Math.min(slides.length - 1, current + 1))
            }
          >
            <ChevronRight aria-hidden="true" size={28} />
          </button>
        </div>

        <footer>
          <span>슬라이드 {slide.order}</span>
          <strong>{slide.title || "제목 없는 슬라이드"}</strong>
        </footer>
      </div>

      <aside className="rrd-slide-coaching-note" aria-live="polite">
        <header>
          <span className="rrd-slide-coaching-note-icon" aria-hidden="true">
            <StickyNote size={20} />
          </span>
          <div>
            <span>COACHING NOTE</span>
            <h3>이 슬라이드의 개선점</h3>
          </div>
        </header>

        {feedbackItems.length > 0 ? (
          <ol>
            {feedbackItems.map((item) => <li key={item}>{item}</li>)}
          </ol>
        ) : (
          <div className="rrd-slide-coaching-note-empty">
            <strong>좋은 흐름을 유지했어요</strong>
            <p>이번 회차에서 이 슬라이드의 별도 개선점은 발견되지 않았습니다.</p>
          </div>
        )}

        {(feedback?.signalTags.length ?? 0) > 0 && (
          <div className="rrd-slide-coaching-note-tags">
            {feedback!.signalTags.map((tag) => <span key={tag}>{tag}</span>)}
          </div>
        )}
      </aside>
    </section>
  );
}

function SlidePreview({
  slide,
  variant,
}: {
  slide: Deck["slides"][number];
  variant: "main" | "peek";
}) {
  const thumbnailUrl = slide.thumbnailUrl
    ? resolveEditorAssetUrl(slide.thumbnailUrl)
    : "";

  return (
    <div className={`rrd-slide-coaching-preview is-${variant}`}>
      {thumbnailUrl ? (
        <img src={thumbnailUrl} alt={`${slide.title || `슬라이드 ${slide.order}`} 미리보기`} />
      ) : (
        <div className="rrd-slide-coaching-placeholder">
          <FileText aria-hidden="true" size={28} />
          <strong>{slide.title || `슬라이드 ${slide.order}`}</strong>
          <span>저장된 장표 미리보기가 없습니다.</span>
        </div>
      )}
    </div>
  );
}
