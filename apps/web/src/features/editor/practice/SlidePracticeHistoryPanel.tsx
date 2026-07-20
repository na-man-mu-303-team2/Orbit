import {
  slideQuestionGuideTextHashInput,
  type Deck,
  type Slide,
  type SlidePracticeReportRecord,
} from "@orbit/shared";
import { useEffect, useState } from "react";

import { PracticeResult } from "./SlidePracticePanel";
import { PracticeTrendDashboard } from "./PracticeTrendDashboard";
import { listSlidePracticeReports } from "./slidePracticeApi";
import { sha256Canonical } from "./slideQuestionGuideApi";

export function SlidePracticeHistoryPanel(props: {
  projectId: string;
  deck: Deck;
  slide: Slide | null;
  refreshToken: number;
}) {
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [retryToken, setRetryToken] = useState(0);
  const [slideContentHash, setSlideContentHash] = useState<string | null>(null);
  const [comparableReports, setComparableReports] = useState<SlidePracticeReportRecord[]>([]);
  const [latestReport, setLatestReport] = useState<SlidePracticeReportRecord | null>(null);

  useEffect(() => {
    let active = true;
    setState("loading");
    if (!props.slide) {
      setSlideContentHash(null);
      setComparableReports([]);
      setLatestReport(null);
      setState("ready");
      return () => { active = false; };
    }
    void sha256Canonical(slideQuestionGuideTextHashInput(props.slide)).then(async (hash) => {
      const [comparable, latest] = await Promise.all([
        listSlidePracticeReports({
          projectId: props.projectId,
          deckId: props.deck.deckId,
          slideId: props.slide?.slideId,
          slideContentHash: hash,
          limit: 5,
        }),
        listSlidePracticeReports({
          projectId: props.projectId,
          deckId: props.deck.deckId,
          slideId: props.slide?.slideId,
          limit: 1,
        }),
      ]);
      if (!active) return;
      setSlideContentHash(hash);
      setComparableReports(comparable.reports);
      setLatestReport(latest.reports[0] ?? null);
      setState("ready");
    }).catch(() => {
      if (active) setState("error");
    });
    return () => { active = false; };
  }, [props.deck.deckId, props.projectId, props.refreshToken, props.slide, retryToken]);

  if (state === "loading") return <p className="editor-dock-empty">연습 기록을 불러오는 중…</p>;
  if (state === "error") return (
    <div className="editor-dock-empty editor-practice-history-error" role="alert">
      <p>연습 기록을 불러오지 못했습니다.</p>
      <button type="button" onClick={() => setRetryToken((current) => current + 1)}>다시 시도</button>
    </div>
  );
  if (!props.slide) return <p className="editor-dock-empty">연습할 슬라이드를 선택해 주세요.</p>;
  if (!slideContentHash) return <p className="editor-dock-empty">슬라이드 비교 기준을 만들지 못했습니다.</p>;
  return (
    <PracticeHistoryContent
      comparableReports={comparableReports}
      latestReport={latestReport}
      slideContentHash={slideContentHash}
    />
  );
}

export function PracticeHistoryContent(props: {
  comparableReports: readonly SlidePracticeReportRecord[];
  latestReport: SlidePracticeReportRecord | null;
  slideContentHash: string;
}) {
  const latestReport = props.latestReport;
  const latestIsComparable = latestReport?.reportVersion === 3
    && latestReport.metricDefinitionVersion === 3
    && latestReport.slideContentHash === props.slideContentHash;

  return (
    <div className="editor-practice-history">
      <PracticeTrendDashboard reports={props.comparableReports} slideContentHash={props.slideContentHash} />
      {latestReport ? (
        <details className="editor-practice-current-detail">
          <summary>
            <span>이번 회차 상세</span>
            <time dateTime={latestReport.createdAt}>{new Date(latestReport.createdAt).toLocaleString("ko-KR")}</time>
          </summary>
          {!latestIsComparable ? (
            <p className="editor-practice-legacy-notice">이전 슬라이드 내용으로 연습한 기록</p>
          ) : null}
          <section aria-label="최근 연습 결과" className="editor-practice-history-detail latest">
            <PracticeResult report={latestReport} />
          </section>
        </details>
      ) : null}
    </div>
  );
}
