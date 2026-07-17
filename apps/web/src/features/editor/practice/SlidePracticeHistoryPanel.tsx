import type { Deck, Slide, SlidePracticeReportRecord } from "@orbit/shared";
import { useEffect, useState } from "react";

import { PracticeResult } from "./SlidePracticePanel";
import { listSlidePracticeReports } from "./slidePracticeApi";

export function SlidePracticeHistoryPanel(props: {
  projectId: string;
  deck: Deck;
  slide: Slide | null;
  refreshToken: number;
}) {
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [reports, setReports] = useState<Awaited<ReturnType<typeof listSlidePracticeReports>>["reports"]>([]);
  const [selectedReportId, setSelectedReportId] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setState("loading");
    setSelectedReportId(null);
    void listSlidePracticeReports({
      projectId: props.projectId,
      deckId: props.deck.deckId,
      slideId: props.slide?.slideId,
      limit: 5,
    }).then((response) => {
      if (!active) return;
      setReports(response.reports);
      setState("ready");
    }).catch(() => {
      if (active) setState("error");
    });
    return () => { active = false; };
  }, [props.deck.deckId, props.projectId, props.refreshToken, props.slide?.slideId]);

  if (state === "loading") return <p className="editor-dock-empty">연습 기록을 불러오는 중…</p>;
  if (state === "error") return <p className="editor-dock-empty">연습 기록을 불러오지 못했습니다.</p>;
  if (reports.length === 0) return <p className="editor-dock-empty">이 슬라이드의 저장된 연습 기록이 없습니다.</p>;
  return (
    <PracticeHistoryContent
      reports={reports}
      selectedReportId={selectedReportId}
      onSelect={setSelectedReportId}
    />
  );
}

export function PracticeHistoryContent(props: {
  reports: readonly SlidePracticeReportRecord[];
  selectedReportId: string | null;
  onSelect: (reportId: string) => void;
}) {
  const reports = props.reports.slice(0, 5);
  const selectedReport = reports.find((report) => report.reportId === props.selectedReportId) ?? null;

  return (
    <div className="editor-practice-history">
      <div aria-label="최근 연습 기록 5개" className="editor-practice-history-list">
        {reports.map((report) => {
          const selected = report.reportId === props.selectedReportId;
          return (
            <button
              aria-pressed={selected}
              className={`editor-practice-history-item${selected ? " selected" : ""}`}
              key={report.reportId}
              onClick={() => props.onSelect(report.reportId)}
              type="button"
            >
              <span className="editor-practice-history-summary">
                <strong>{new Date(report.createdAt).toLocaleString("ko-KR")}</strong>
                <span>{report.style.message}</span>
              </span>
              <span className="editor-practice-history-metrics">
                <span><small>습관어</small><strong>{report.fillers.totalCount}회</strong></span>
                <span><small>쉼</small><strong>{Math.round(report.voice.pauseRatio * 100)}%</strong></span>
                <span><small>속도</small><strong>{report.voice.syllablesPerSecond?.toFixed(1) ?? "-"}</strong></span>
              </span>
            </button>
          );
        })}
      </div>
      {selectedReport ? (
        <section aria-label="선택한 연습 결과" className="editor-practice-history-detail">
          <header>
            <strong>선택한 저장 기록</strong>
            <span>{new Date(selectedReport.createdAt).toLocaleString("ko-KR")}</span>
          </header>
          <PracticeResult report={selectedReport} />
        </section>
      ) : (
        <p className="editor-practice-history-hint">기록을 선택하면 연습 종료 직후와 같은 상세 결과를 확인할 수 있습니다.</p>
      )}
    </div>
  );
}
