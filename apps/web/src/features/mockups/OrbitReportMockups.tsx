import {
  IconArrowLeft,
  IconArrowRight,
  IconCalendar,
  IconChartBar,
  IconCheck,
  IconChevronRight,
  IconClock,
  IconDownload,
  IconFileText,
  IconFilter,
  IconMicrophone,
  IconPlayerPlay,
  IconPresentation,
  IconSearch,
  IconSparkles,
  IconTarget,
  IconVolume
} from "@tabler/icons-react";
import { useMemo, useState, type ReactNode } from "react";
import orbitLogo from "./assets/orbit-logo-selected.png";
import { OrbitButton, OrbitStatus } from "../../design-system";
import "./orbit-report-mockups.css";

type ReportMockupProps = {
  onNavigate: (path: string) => void;
};

type ReportRow = {
  date: string;
  duration: string;
  focus: string;
  id: number;
  project: string;
  score: number;
  status: "improved" | "steady";
};

const reportRows: ReportRow[] = [
  { date: "2026.07.10 10:42", duration: "04:32", focus: "결론 CTA 명확히 말하기", id: 4, project: "2026 하반기 제품 전략", score: 86, status: "improved" },
  { date: "2026.07.09 16:18", duration: "04:51", focus: "수치 설명 전 호흡 정리", id: 3, project: "2026 하반기 제품 전략", score: 81, status: "improved" },
  { date: "2026.07.08 14:05", duration: "05:09", focus: "도입부 핵심 메시지 압축", id: 2, project: "2026 하반기 제품 전략", score: 77, status: "steady" },
  { date: "2026.07.07 11:32", duration: "05:24", focus: "말버릇과 긴 멈춤 줄이기", id: 1, project: "2026 하반기 제품 전략", score: 72, status: "steady" }
];

export function OrbitRehearsalCompleteMockup(props: ReportMockupProps) {
  return (
    <div className="orbit-report-mockup report-transition-page">
      <ReportHeader onNavigate={props.onNavigate} />
      <main className="report-transition-main">
        <section className="report-transition-hero">
          <span className="report-complete-mark"><IconCheck size={34} /></span>
          <p className="orbit-ds-eyebrow">REHEARSAL COMPLETE</p>
          <h1>리허설을 잘 마쳤어요.</h1>
          <p>방금 연습한 내용을 분석해 다음 발표가 더 좋아질 포인트를 정리했습니다.</p>
          <div className="report-transition-status"><IconSparkles size={17} /><strong>AI 리포트 준비 완료</strong><span>방금</span></div>
        </section>

        <section className="report-transition-summary" aria-label="리허설 결과 요약">
          <article className="report-transition-score">
            <span>이번 리허설 점수</span>
            <strong>86</strong>
            <small>직전보다 5점 올랐어요</small>
            <progress aria-label="리허설 점수" max="100" value="86" />
          </article>
          <div className="report-transition-metrics">
            <ReportMetric icon={<IconClock size={19} />} label="발표 시간" note="목표 05:00" value="04:32" />
            <ReportMetric icon={<IconMicrophone size={19} />} label="말하기 속도" note="권장 범위" value="132 WPM" />
            <ReportMetric icon={<IconTarget size={19} />} label="키워드" note="2개 전달" value="2 / 3" />
          </div>
          <article className="report-transition-insight">
            <span><IconSparkles size={17} /> AI 한 줄 피드백</span>
            <strong>핵심 메시지는 또렷했어요. 마지막 CTA에서 한 박자 쉬면 더 설득력 있어집니다.</strong>
          </article>
        </section>

        <div className="report-transition-actions">
          <button onClick={() => props.onNavigate("/mockup/rehearsal")} type="button">다시 연습</button>
          <button onClick={() => props.onNavigate("/mockup/reports")} type="button">리포트 목록</button>
          <OrbitButton icon={<IconArrowRight size={18} />} onClick={() => props.onNavigate("/mockup/report")}>리포트 확인하기</OrbitButton>
        </div>
      </main>
    </div>
  );
}

export function OrbitReportListMockup(props: ReportMockupProps) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<"all" | "improved">("all");
  const visibleReports = useMemo(() => reportRows.filter((report) => {
    const matchesQuery = `${report.project} ${report.focus}`.toLocaleLowerCase("ko").includes(query.toLocaleLowerCase("ko"));
    return matchesQuery && (filter === "all" || report.status === "improved");
  }), [filter, query]);

  return (
    <div className="orbit-report-mockup report-list-mockup">
      <ReportHeader onNavigate={props.onNavigate} />
      <main className="report-list-main">
        <section className="report-list-heading">
          <div><p className="orbit-ds-eyebrow">REHEARSAL REPORTS</p><h1>리허설 리포트</h1><p>연습할수록 달라지는 발표 흐름을 한눈에 확인하세요.</p></div>
          <OrbitButton icon={<IconMicrophone size={18} />} onClick={() => props.onNavigate("/mockup/rehearsal")} variant="secondary">새 리허설</OrbitButton>
        </section>

        <button className="report-latest-card" onClick={() => props.onNavigate("/mockup/report-project")} type="button">
          <span className="report-latest-copy">
            <span><IconSparkles size={17} /> 프로젝트 종합 리포트</span>
            <strong>발표의 핵심 메시지가 더 또렷해졌어요.</strong>
            <small>최근 4회 분석 · 말버릇 2회 감소 · 목표 시간 안에 완료</small>
          </span>
          <span className="report-latest-score"><span>종합 점수</span><strong>86</strong><small>+5</small></span>
          <span className="report-latest-action"><span>종합 리포트 보기</span><IconArrowRight size={20} /></span>
        </button>

        <section className="report-list-surface">
          <header>
            <div><h2>2026 하반기 제품 전략</h2><span>총 4회 · 최근 2026.07.10</span></div>
            <div className="report-list-tools">
              <label><IconSearch size={17} /><input aria-label="리포트 검색" onChange={(event) => setQuery(event.currentTarget.value)} placeholder="리포트 검색" value={query} /></label>
              <button aria-pressed={filter === "improved"} onClick={() => setFilter((value) => value === "all" ? "improved" : "all")} type="button"><IconFilter size={17} />점수 향상</button>
            </div>
          </header>

          <div className="report-list-columns" aria-hidden="true"><span>회차</span><span>일시</span><span>점수</span><span>발표 시간</span><span>다음 연습 포인트</span><span /></div>
          <div className="report-list-rows">
            {visibleReports.map((report) => (
              <button key={report.id} onClick={() => props.onNavigate("/mockup/report")} type="button">
                <span className="report-run-number">{report.id}<small>회차</small></span>
                <span className="report-run-date"><IconCalendar size={16} />{report.date}</span>
                <span className="report-run-score"><strong>{report.score}</strong>{report.status === "improved" ? <small>향상</small> : null}</span>
                <span className="report-run-duration">{report.duration}</span>
                <span className="report-run-focus">{report.focus}</span>
                <IconChevronRight className="report-run-arrow" size={19} />
              </button>
            ))}
            {visibleReports.length === 0 ? <div className="report-list-empty-state"><IconFileText size={28} /><strong>검색 결과가 없습니다.</strong><span>다른 키워드나 필터를 사용해 보세요.</span></div> : null}
          </div>
        </section>
      </main>
    </div>
  );
}

export function OrbitReportDetailMockup(props: ReportMockupProps) {
  const [tab, setTab] = useState<"summary" | "slides" | "timeline">("summary");

  return (
    <div className="orbit-report-mockup report-detail-mockup">
      <ReportHeader onNavigate={props.onNavigate} />
      <main className="report-detail-main">
        <div className="report-detail-breadcrumb"><button onClick={() => props.onNavigate("/mockup/reports")} type="button"><IconArrowLeft size={18} />리포트 목록</button><span>/</span><strong>4회차</strong></div>

        <section className="report-detail-hero">
          <div><p className="orbit-ds-eyebrow">2026 하반기 제품 전략</p><h1>4회차 리허설 리포트</h1><p><IconCalendar size={16} /> 2026.07.10 10:42 · 발표 시간 04:32</p></div>
          <div className="report-detail-hero-actions"><button type="button"><IconDownload size={17} />PDF 저장</button><OrbitButton icon={<IconPlayerPlay size={18} />} onClick={() => props.onNavigate("/mockup/rehearsal")}>다시 리허설</OrbitButton></div>
        </section>

        <section className="report-detail-overview">
          <article className="report-overall-score"><span>종합 점수</span><strong>86</strong><small><IconChartBar size={15} /> 직전 리허설보다 5점 향상</small><progress aria-label="종합 점수" max="100" value="86" /></article>
          <article className="report-ai-summary"><span><IconSparkles size={18} /> AI 총평</span><h2>핵심 메시지는 안정적으로 전달됐고, 발표 속도도 목표 시간에 잘 맞았습니다.</h2><p>마지막 행동 요청을 조금 더 짧고 명확하게 말하면 청중의 다음 행동을 끌어내기 좋아집니다.</p></article>
        </section>

        <section className="report-detail-metrics" aria-label="발표 핵심 지표">
          <ReportMetric icon={<IconClock size={19} />} label="발표 시간" note="목표보다 28초 빠름" value="04:32" />
          <ReportMetric icon={<IconMicrophone size={19} />} label="말하기 속도" note="권장 120–150" value="132 WPM" />
          <ReportMetric icon={<IconTarget size={19} />} label="키워드 커버리지" note="고객 가치 · 시장 확장" value="67%" />
          <ReportMetric icon={<IconVolume size={19} />} label="말버릇" note="직전보다 2회 감소" value="3회" />
        </section>

        <nav aria-label="리포트 내용" className="report-detail-tabs">
          <button aria-current={tab === "summary" ? "page" : undefined} onClick={() => setTab("summary")} type="button">핵심 피드백</button>
          <button aria-current={tab === "slides" ? "page" : undefined} onClick={() => setTab("slides")} type="button">슬라이드 분석</button>
          <button aria-current={tab === "timeline" ? "page" : undefined} onClick={() => setTab("timeline")} type="button">발표 기록</button>
        </nav>

        {tab === "summary" ? <ReportSummaryPanel /> : tab === "slides" ? <ReportSlidePanel /> : <ReportTimelinePanel />}
      </main>
    </div>
  );
}

function ReportSummaryPanel() {
  return (
    <section className="report-tab-panel report-summary-grid">
      <article className="report-feedback-card positive"><header><IconCheck size={19} /><h2>잘한 점</h2><OrbitStatus tone="success">3개</OrbitStatus></header><ul><li><strong>첫 30초 안에 발표 목적을 분명히 제시했어요.</strong><span>도입부에서 청중이 발표 방향을 바로 이해할 수 있었습니다.</span></li><li><strong>중요 키워드를 자연스럽게 반복했어요.</strong><span>고객 가치와 시장 확장이 전체 발표를 관통했습니다.</span></li><li><strong>말하기 속도가 안정적이었어요.</strong><span>132 WPM으로 권장 범위를 꾸준히 유지했습니다.</span></li></ul></article>
      <article className="report-feedback-card improve"><header><IconTarget size={19} /><h2>다음에 개선할 점</h2><OrbitStatus tone="warning">2개</OrbitStatus></header><ul><li><strong>마지막 CTA 전에 한 박자 쉬어보세요.</strong><span>청중이 핵심 결론을 받아들일 시간을 만들 수 있습니다.</span></li><li><strong>“실행 체계” 키워드를 한 번 더 언급하세요.</strong><span>세 번째 전략이 다른 두 전략보다 약하게 전달됐습니다.</span></li></ul><button type="button"><IconPlayerPlay size={17} />이 포인트로 다시 연습</button></article>
      <article className="report-next-practice"><span><IconSparkles size={18} /> 다음 연습 목표</span><strong>결론 슬라이드의 CTA 문장을 15초 안에 말하고, 마지막에 2초 멈추기</strong><p>예상 연습 시간 5분 · 결론 슬라이드부터 시작</p></article>
    </section>
  );
}

function ReportSlidePanel() {
  const slides = [
    ["01", "다음 성장을 만드는 세 가지 선택", "42초", "도입이 명확하고 안정적이었어요.", "good"],
    ["03", "2026 핵심 우선순위", "58초", "‘실행 체계’ 키워드가 누락됐어요.", "warn"],
    ["05", "우리가 만들 변화", "51초", "수치 설명 앞에서 긴 멈춤이 1회 있었어요.", "warn"]
  ];
  return <section className="report-tab-panel report-slide-analysis"><header><div><h2>슬라이드별 분석</h2><p>피드백이 필요한 주요 장표 3개를 먼저 보여드려요.</p></div><span>전체 6장</span></header>{slides.map(([number, title, time, feedback, tone]) => <article key={number}><span className={`report-slide-index ${tone}`}>{number}</span><div><strong>{title}</strong><p>{feedback}</p></div><time>{time}</time><IconChevronRight size={19} /></article>)}</section>;
}

function ReportTimelinePanel() {
  return <section className="report-tab-panel report-timeline"><header><h2>발표 기록</h2><p>발표 중 감지된 주요 순간을 시간순으로 확인하세요.</p></header><ol><li><time>00:18</time><span><strong>핵심 메시지 감지</strong><small>“다음 성장을 만드는 세 가지 선택”</small></span><OrbitStatus tone="success">좋음</OrbitStatus></li><li><time>02:41</time><span><strong>긴 멈춤 1.8초</strong><small>ARR 성장 수치 설명 직전</small></span><OrbitStatus tone="warning">확인</OrbitStatus></li><li><time>03:26</time><span><strong>키워드 누락</strong><small>“실행 체계”가 언급되지 않았습니다.</small></span><OrbitStatus tone="warning">확인</OrbitStatus></li><li><time>04:24</time><span><strong>결론 CTA</strong><small>행동 요청까지 연결했지만 속도가 조금 빨랐어요.</small></span><OrbitStatus tone="info">보통</OrbitStatus></li></ol></section>;
}

function ReportMetric(props: { icon: ReactNode; label: string; note: string; value: string }) {
  return <article className="report-metric-card"><span>{props.icon}{props.label}</span><strong>{props.value}</strong><small>{props.note}</small></article>;
}

function ReportHeader(props: ReportMockupProps) {
  return (
    <header className="report-mockup-header">
      <button aria-label="ORBIT 홈" onClick={() => props.onNavigate("/mockup/home")} type="button"><img alt="ORBIT" src={orbitLogo} /></button>
      <nav aria-label="주요 메뉴"><button onClick={() => props.onNavigate("/mockup/home")} type="button">홈</button><button onClick={() => props.onNavigate("/mockup/home")} type="button">프로젝트</button><button onClick={() => props.onNavigate("/mockup/rehearsal")} type="button">리허설</button><button aria-current="page" onClick={() => props.onNavigate("/mockup/reports")} type="button">리포트</button></nav>
      <div><span className="report-project-label"><IconPresentation size={17} />2026 하반기 제품 전략</span><span className="orbit-ds-avatar">김</span></div>
    </header>
  );
}
