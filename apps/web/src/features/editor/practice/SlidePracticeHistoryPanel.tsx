import type { Deck, Slide } from "@orbit/shared";
import { useEffect, useState } from "react";

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
    <div className="editor-practice-history">
      {reports.map((report) => (
        <article key={report.reportId}>
          <div><strong>{new Date(report.createdAt).toLocaleString("ko-KR")}</strong><span>{report.style.message}</span></div>
          <dl>
            <div><dt>습관어</dt><dd>{report.fillers.totalCount}회</dd></div>
            <div><dt>쉼</dt><dd>{Math.round(report.voice.pauseRatio * 100)}%</dd></div>
            <div><dt>속도</dt><dd>{report.voice.syllablesPerSecond?.toFixed(1) ?? "-"}</dd></div>
          </dl>
        </article>
      ))}
    </div>
  );
}
