import { ChevronLeft, ChevronRight, FileText, Layers } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { Deck, RehearsalReport } from "@orbit/shared";
import { buildRehearsalSlideAnalysisCards } from "./rehearsalSlideAnalysisModel";
import { getSlideAnalysisAnchor } from "./rehearsalRunComparisonModel";

const PAGE_SIZE = 3;

type Props = {
  deck: Deck | null;
  formatDelta: (diff: number) => string;
  formatDuration: (totalSeconds: number) => string;
  prevReports: RehearsalReport[];
  report: RehearsalReport;
};

export function RehearsalSlideAnalysisOverview({
  deck,
  formatDelta,
  formatDuration,
  prevReports,
  report,
}: Props) {
  const [page, setPage] = useState(0);

  const problemCards = useMemo(
    () => buildRehearsalSlideAnalysisCards(deck, prevReports, report),
    [deck, prevReports, report],
  );
  const totalPages = Math.max(1, Math.ceil(problemCards.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages - 1);
  const visibleCards = problemCards.slice(
    currentPage * PAGE_SIZE,
    currentPage * PAGE_SIZE + PAGE_SIZE,
  );

  useEffect(() => {
    if (typeof window === "undefined" || !window.location.hash) return;
    const targetIndex = problemCards.findIndex(
      (card) => `#${getSlideAnalysisAnchor(card.slideId)}` === window.location.hash,
    );
    if (targetIndex < 0) return;

    setPage(Math.floor(targetIndex / PAGE_SIZE));
    const targetId = window.location.hash.slice(1);
    window.requestAnimationFrame(() => {
      document.getElementById(targetId)?.scrollIntoView({ block: "start" });
    });
  }, [problemCards]);

  return (
    <section className="rrd-card">
      <header className="rrd-card-head">
        <Layers size={20} className="rrd-card-icon" />
        <h2>장표별 분석</h2>
        {problemCards.length > 0 && (
          <span className="rrd-card-count">{problemCards.length}장</span>
        )}
      </header>

      {problemCards.length === 0 ? (
        <p className="rrd-empty-hint">
          현재 리허설에서 별도 개선이 필요한 장표가 없습니다.
        </p>
      ) : (
        <>
          <div className="rrd-slide-analysis-list">
            {visibleCards.map((card) => (
              <div
                key={card.slideId}
                className="rrd-slide-analysis-item"
                id={getSlideAnalysisAnchor(card.slideId)}
              >
                <div className="rrd-slide-analysis-thumb">
                  {card.thumbnailUrl ? (
                    <img
                      src={card.thumbnailUrl}
                      alt=""
                      className="rrd-slide-thumb-img"
                    />
                  ) : (
                    <div className="rrd-slide-thumb-placeholder">
                      <FileText size={18} />
                    </div>
                  )}
                </div>

                <div className="rrd-slide-analysis-body">
                  <strong className="rrd-slide-analysis-title">
                    {card.slideLabel}
                  </strong>

                  <div className="rrd-slide-row rrd-slide-row-priority">
                    <span className="rrd-slide-row-label">개선 피드백</span>
                    <ul className="rrd-slide-feedback-list">
                      {card.feedbackItems.map((item) => (
                        <li key={item} className="rrd-slide-feedback-item">
                          {item}
                        </li>
                      ))}
                    </ul>
                  </div>

                  <div className="rrd-slide-row">
                    <span className="rrd-slide-row-label">놓친 핵심 메시지</span>
                    {card.missedKeywords.length > 0 ? (
                      <div className="rrd-keyword-chips">
                        {card.missedKeywords.map((keyword) => (
                          <span key={keyword} className="rrd-keyword-chip">
                            {keyword}
                          </span>
                        ))}
                      </div>
                    ) : (
                      <span className="rrd-muted">직접 누락된 핵심 메시지는 없습니다.</span>
                    )}
                  </div>

                  <div className="rrd-slide-row">
                    <span className="rrd-slide-row-label">문제 신호</span>
                    {card.signalTags.length > 0 ? (
                      <div className="rrd-recurring-tags">
                        {card.signalTags.map((tag) => (
                          <span key={tag} className="rrd-recurring-tag">
                            {tag}
                          </span>
                        ))}
                      </div>
                    ) : (
                      <span className="rrd-muted">반복 신호는 크지 않습니다.</span>
                    )}
                  </div>

                  <div className="rrd-slide-row rrd-slide-row-secondary">
                    <span className="rrd-slide-row-label">참고 시간</span>
                    <div className="rrd-slide-metric-summary">
                      <span>이번 {formatDuration(card.actualSeconds)}</span>
                      <span>
                        평균{" "}
                        {card.averageSeconds != null
                          ? formatDuration(card.averageSeconds)
                          : "집계 중"}
                      </span>
                      <span>
                        대비{" "}
                        {card.diffSeconds != null
                          ? formatDelta(card.diffSeconds)
                          : "집계 중"}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {problemCards.length > PAGE_SIZE && (
            <div className="rrd-slide-pagination">
              <button
                type="button"
                className="rrd-slide-page-button"
                onClick={() => setPage((current) => Math.max(0, current - 1))}
                disabled={currentPage === 0}
              >
                <ChevronLeft size={14} />
                이전
              </button>
              <span className="rrd-slide-page-status">
                {currentPage + 1} / {totalPages}
              </span>
              <button
                type="button"
                className="rrd-slide-page-button"
                onClick={() =>
                  setPage((current) => Math.min(totalPages - 1, current + 1))
                }
                disabled={currentPage >= totalPages - 1}
              >
                다음
                <ChevronRight size={14} />
              </button>
            </div>
          )}
        </>
      )}
    </section>
  );
}
