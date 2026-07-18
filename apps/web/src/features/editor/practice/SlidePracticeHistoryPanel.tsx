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

  useEffect(() => {
    let active = true;
    setState("loading");
    void listSlidePracticeReports({
      projectId: props.projectId,
      deckId: props.deck.deckId,
      slideId: props.slide?.slideId,
      limit: 1,
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
  return <PracticeHistoryContent reports={reports} />;
}

export function PracticeHistoryContent(props: {
  reports: readonly SlidePracticeReportRecord[];
}) {
  const latestReport = props.reports[0] ?? null;
  if (!latestReport) return null;

  return (
    <div className="editor-practice-history">
      <section aria-label="최근 연습 결과" className="editor-practice-history-detail latest">
        <header>
          <strong>최근 저장 기록</strong>
          <span>{new Date(latestReport.createdAt).toLocaleString("ko-KR")}</span>
        </header>
        <PracticeResult report={latestReport} />
      </section>
    </div>
  );
}
