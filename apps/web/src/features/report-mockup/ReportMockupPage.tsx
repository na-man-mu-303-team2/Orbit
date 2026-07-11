import { useState } from "react";

import "./reportMockup.css";
import { MockupTopbar, type MockupTabId } from "./mockupShared";
import {
  DashboardView,
  DocsView,
  HistoryView,
  ScheduleView
} from "./mockupViews";

/* ── 데이터 (전부 정적 목업) ─────────────────────────── */

const headerStats = [
  { icon: "♥", value: "128", badge: "+12%", unit: "WPM", label: "평균 발화 속도" },
  { icon: "◷", value: "4:46", unit: "min", label: "발화 시간" },
  { icon: "◎", value: "86.2", unit: "%", label: "필수 발화 커버율" }
] as const;

const sessionSummary = [
  { tone: "ink", note: "+0:38 초과", label: "시간 일관성", value: "4:46 / 5:00", pct: 96 },
  { tone: "purple", note: "Excellent", label: "핵심 메시지", value: "88% 일치", pct: 88 },
  { tone: "blue", note: "Strong", label: "전달 강도", value: "A 등급", pct: 82 },
  { tone: "red", note: "-2회 개선", label: "습관어", value: "4회", pct: 30 }
] as const;

const miniMetrics = [
  { icon: "⏸", label: "일시정지", value: "2", unit: "회" },
  { icon: "…", label: "습관어", value: "4", unit: "회" },
  { icon: "✦", label: "애드립", value: "14", unit: "%", dark: true }
] as const;

const diagnosis = [
  {
    no: 1,
    tone: "red",
    title: "문제 정의: 배경 설명 부족",
    why: "청중이 문제의 심각성을 인지하기 전에 솔루션으로 넘어가는 경향이 있어 공감대가 떨어집니다.",
    action: "도입부에 실제 유저 데이터를 2~3개 추가해 설득력을 높이세요."
  },
  {
    no: 2,
    tone: "amber",
    title: "해결책 제시: 문장 다이어트 필요",
    why: "핵심 기능 설명 시 '음…', '사실은…' 등 불필요한 수식어가 많아 신뢰감이 저하됩니다.",
    action: "두괄식 문장 구조(핵심→이유)로 연습해 전달력을 확보하세요."
  },
  {
    no: 3,
    tone: "blue",
    title: "기대 효과: 문장 선명도 개선",
    why: "마지막 클로징 멘트가 모호해 청중이 리허설 후 무엇을 해야 할지 명확히 인지하지 못합니다.",
    action: "명확한 Call-to-Action 문구로 마무리 연습을 수행하세요."
  }
] as const;

const strengths = [
  { title: "도입부 전달력", detail: "첫 30초 발화 속도·톤이 안정적" },
  { title: "솔루션 설명", detail: "슬라이드 5 핵심 메시지 전부 전달" },
  { title: "습관어 감소", detail: "'음' 7회 → 4회" }
] as const;

const slideTimes = [
  { no: 1, title: "인트로", target: 30, actual: 24 },
  { no: 2, title: "문제 정의", target: 45, actual: 52 },
  { no: 3, title: "시장 규모", target: 40, actual: 38 },
  { no: 4, title: "문제 및 원인", target: 45, actual: 68 },
  { no: 5, title: "솔루션", target: 60, actual: 47 },
  { no: 6, title: "비즈니스 모델", target: 40, actual: 57 }
] as const;

const transcriptChips = [
  { time: "0:42", text: "음… 그러니까 이게", kind: "filler" },
  { time: "1:56", text: "(2.4초 침묵)", kind: "pause" },
  { time: "2:31", text: "아까 말했듯이 다시 설명하면", kind: "repeat" },
  { time: "3:05", text: "빨리 넘어가겠습니다", kind: "rush" }
] as const;

const flowSteps = [
  { label: "인트로", status: "good" },
  { label: "문제 정의", status: "good" },
  { label: "시장 규모", status: "good" },
  { label: "문제·원인", status: "issue", count: 3 },
  { label: "솔루션", status: "warn", count: 1 },
  { label: "BM", status: "issue", count: 2 }
] as const;

const fillerTop3 = [
  { word: "“음…”", count: 12, delta: "▲ 3회", up: true },
  { word: "“어…”", count: 8, delta: "▲ 2회", up: true },
  { word: "“그리고”", count: 7, delta: "▼ 1회", up: false }
] as const;

const nextPlan = [
  { step: 1, label: "슬라이드 4만 3회 반복 연습", time: "10분" },
  { step: 2, label: "누락 핵심 메시지 소리 내어 암기", time: "5분" },
  { step: 3, label: "호흡 훈련: 마침표마다 1초 멈춤", time: "5분" }
] as const;

const coachingSummary = [
  {
    icon: "🫁",
    title: "호흡 교정",
    status: "주의",
    tone: "amber",
    detail: "문장 사이 호흡이 짧아요. 마침표마다 1초 쉬는 연습을 추천해요.",
    metric: "평균 호흡 간격 4.2초 → 권장 6초"
  },
  {
    icon: "🎯",
    title: "핵심 메시지 전달",
    status: "양호",
    tone: "teal",
    detail: "25개 중 21개를 전달했어요. 슬라이드 4·6 메시지가 반복 누락돼요.",
    metric: "커버율 86% (+8%p)"
  },
  {
    icon: "✍️",
    title: "대본 수정 제안",
    status: "제안 2건",
    tone: "purple",
    detail: "실제 발화가 대본보다 자연스러운 구간 2곳 — 대본을 발화에 맞춰 고쳐보세요.",
    metric: "슬라이드 2, 5"
  }
] as const;

const growthBars = [42, 55, 50, 63, 71, 84, 92] as const;

const recurringIssues = [
  { label: "습관어 '음'", runs: [7, 5, 4, 3], note: "개선 중 ↓" },
  { label: "슬라이드 4 시간 초과", runs: [1, 2, 2, 2], note: "반복 발생" },
  { label: "핵심 메시지 누락", runs: [6, 5, 4, 4], note: "정체" },
  { label: "긴 침묵 (2초+)", runs: [4, 3, 1, 2], note: "개선 중 ↓" }
] as const;

const recentRuns = [
  { no: 4, title: "4차 리허설", date: "7월 10일 14:20", duration: "4분 46초", coverage: "92%", score: 86 },
  { no: 3, title: "3차 리허설", date: "7월 9일 21:05", duration: "5분 12초", coverage: "84%", score: 78 },
  { no: 2, title: "2차 리허설", date: "7월 9일 10:41", duration: "6분 03초", coverage: "71%", score: 66 },
  { no: 1, title: "1차 리허설", date: "7월 8일 18:30", duration: "6분 40초", coverage: "58%", score: 54 }
] as const;

const shareActions = [
  { icon: "⬇", label: "PDF 리포트" },
  { icon: "🔗", label: "결과 링크 복사" },
  { icon: "🖼", label: "이미지로 저장" },
  { icon: "👥", label: "팀 리포트 보내기" }
] as const;

/* 코칭 상세용 */
type ScriptLineKind = "match" | "missed" | "adlib" | "problem";

const coachScript: { kind: ScriptLineKind; time: string; text: string }[] = [
  { kind: "match", time: "2:12", text: "저희 서비스의 이탈률이 최근 석 달 동안 두 배로 늘었습니다." },
  { kind: "missed", time: "—", text: "특히 첫 주 이탈이 전체의 60%를 차지합니다." },
  { kind: "problem", time: "2:31", text: "음… 아까 말했듯이 다시 설명하면, 그러니까 온보딩이…" },
  { kind: "match", time: "2:44", text: "원인을 분석해 보니 온보딩 과정이 너무 복잡했습니다." },
  { kind: "adlib", time: "2:58", text: "(애드립) 사실 저도 처음 가입할 때 헤맸는데요…" },
  { kind: "match", time: "3:11", text: "그래서 온보딩을 7단계에서 3단계로 줄이는 개선안을 준비했습니다." }
];

const coachWpmTrail = [118, 124, 131, 146, 152, 137] as const;

/* 슬라이드별 이슈 피드 (절충안): 데이터는 카테고리 태그로 분류, UI는 감지된 이슈만 노출 */
type SlideIssue = {
  severity: "issue" | "warn";
  category: "커버율" | "호흡·페이스" | "시간" | "습관어" | "대본";
  title: string;
  evidence: { time?: string; quote: string }[];
  action: string;
  showWpmTrail?: boolean;
};

const slideIssuesByIndex: Record<number, SlideIssue[]> = {
  1: [
    {
      severity: "warn",
      category: "시간",
      title: "목표보다 7초 초과 — 배경 설명이 길어요",
      evidence: [{ time: "0:58", quote: "…그러니까 배경을 조금 더 말씀드리면…" }],
      action: "배경 설명은 두 문장으로 요약하고 수치로 바로 진입하세요."
    },
    {
      severity: "warn",
      category: "습관어",
      title: "'음…'이 이 슬라이드에 3회 집중",
      evidence: [{ time: "1:12", quote: "음… 그게 사실은…" }],
      action: "문장 시작 전 반 박자 쉬는 연습으로 대체해보세요."
    }
  ],
  3: [
    {
      severity: "issue",
      category: "커버율",
      title: "핵심 메시지 누락 — 3회 연속",
      evidence: [
        { quote: "누락: “특히 첫 주 이탈이 전체의 60%를 차지합니다.”" }
      ],
      action: "이 문장을 소리 내어 3회 암기 후 슬라이드 4만 재연습하세요."
    },
    {
      severity: "issue",
      category: "호흡·페이스",
      title: "중반부터 152 WPM까지 급상승",
      evidence: [{ time: "2:31", quote: "음… 아까 말했듯이 다시 설명하면…" }],
      action: "문장이 끝날 때 숨을 한 번 크게 쉬고 다음 문장을 시작하세요.",
      showWpmTrail: true
    },
    {
      severity: "warn",
      category: "시간",
      title: "목표 45초 대비 23초 초과",
      evidence: [{ quote: "원인 설명 구간이 전체의 60%를 차지" }],
      action: "원인은 한 가지(온보딩 복잡성)로 좁혀 말하세요."
    }
  ],
  4: [
    {
      severity: "warn",
      category: "대본",
      title: "실제 발화가 대본보다 자연스러워요",
      evidence: [{ time: "3:42", quote: "“한 번 써보면 바로 체감되실 거예요.”" }],
      action: "아래 '대본 수정 제안'을 확인하고 대본에 반영해보세요."
    }
  ],
  5: [
    {
      severity: "issue",
      category: "시간",
      title: "목표보다 17초 초과",
      evidence: [{ quote: "수익 모델 3가지를 모두 설명 — 발표에선 1개면 충분" }],
      action: "주력 모델 하나만 말하고 나머지는 Q&A로 넘기세요."
    },
    {
      severity: "warn",
      category: "습관어",
      title: "'그리고'로 문장을 계속 연결",
      evidence: [{ time: "4:05", quote: "…그리고… 그리고 또 하나는…" }],
      action: "문장을 짧게 끊고 마침표에서 멈추는 연습을 하세요."
    }
  ]
};

/* ── 루트: 탭 전환 + (분석 탭) 오버뷰 ↔ 슬라이드 코칭 ── */

export function ReportMockupPage() {
  const [tab, setTab] = useState<MockupTabId>("analysis");
  const [coachingIndex, setCoachingIndex] = useState<number | null>(null);

  const changeTab = (next: MockupTabId) => {
    setCoachingIndex(null);
    setTab(next);
  };

  return (
    <div className="rm-shell">
      <div className="rm-shell-inner">
        <MockupTopbar active={tab} onChange={changeTab} />
        {tab === "analysis" &&
          (coachingIndex === null ? (
            <ReportOverview onOpenCoaching={setCoachingIndex} />
          ) : (
            <SlideCoachingView
              index={coachingIndex}
              onBack={() => setCoachingIndex(null)}
              onNavigate={setCoachingIndex}
            />
          ))}
        {tab === "dashboard" && (
          <DashboardView onOpenAnalysis={() => changeTab("analysis")} />
        )}
        {tab === "docs" && <DocsView />}
        {tab === "history" && (
          <HistoryView onOpenAnalysis={() => changeTab("analysis")} />
        )}
        {tab === "schedule" && <ScheduleView />}
      </div>
    </div>
  );
}

/* ── 오버뷰 (6층 결과 구조) ─────────────────────────── */

function ReportOverview({
  onOpenCoaching
}: {
  onOpenCoaching: (index: number) => void;
}) {
  return (
    <>
        <section className="rm-hero">
          <div>
            <h1>리허설 리포트</h1>
            <div className="rm-hero-chips">
              <button type="button" className="rm-chip">
                신규 서비스 피치덱
              </button>
              <button type="button" className="rm-chip active">
                4차 리허설 · 오늘 14:20
              </button>
            </div>
          </div>
          <div className="rm-hero-stats">
            {headerStats.map((stat) => (
              <div key={stat.label} className="rm-hero-stat">
                <span className="rm-hero-stat-icon">{stat.icon}</span>
                <span className="rm-hero-stat-body">
                  <span className="rm-hero-stat-value">
                    {stat.value}
                    {"badge" in stat && stat.badge && (
                      <em className="rm-badge">{stat.badge}</em>
                    )}
                    <small>{stat.unit}</small>
                  </span>
                  <small>{stat.label}</small>
                </span>
              </div>
            ))}
          </div>
        </section>

        {/* ① 즉시 판단 */}
        <SectionLabel
          no="①"
          title="즉시 판단"
          sub="전체 평가 · 핵심 수치 · 한 문장 총평"
          action="⬇ 리포트 PDF 다운로드"
        />
        <div className="rm-grid">
          <article className="rm-card rm-grade-card">
            <small className="rm-overline">OVERALL GRADE</small>
            <strong className="rm-grade">A-</strong>
            <div className="rm-grade-pills">
              <span className="rm-pill pass">PASS</span>
              <span className="rm-pill fit">피치 FIT</span>
            </div>
            <div className="rm-grade-minis">
              <div>
                <small>전달 신뢰도</small>
                <strong>92.4%</strong>
              </div>
              <div>
                <small>메시지 공명</small>
                <strong>94%</strong>
              </div>
            </div>
          </article>

          <article className="rm-card rm-verdict-card">
            <header className="rm-card-head">
              <h2>한 문장 총평</h2>
              <span className="rm-pill soft">B+ → A-</span>
            </header>
            <p className="rm-verdict">
              “전달력은 안정권에 들어섰어요. 이제{" "}
              <mark>슬라이드 4의 시간 관리</mark>와{" "}
              <mark>누락되는 핵심 메시지 2개</mark>만 잡으면 실전 준비 완료입니다.”
            </p>
            <div className="rm-mini-grid">
              {miniMetrics.map((metric) => (
                <div
                  key={metric.label}
                  className={
                    "dark" in metric && metric.dark
                      ? "rm-mini-card dark"
                      : "rm-mini-card"
                  }
                >
                  <span className="rm-mini-icon">{metric.icon}</span>
                  <small>{metric.label}</small>
                  <strong>
                    {metric.value} <small>{metric.unit}</small>
                  </strong>
                </div>
              ))}
            </div>
          </article>

          <article className="rm-card rm-donut-card">
            <header className="rm-card-head">
              <h2>말하기 속도</h2>
            </header>
            <div
              className="rm-donut"
              style={{
                background:
                  "conic-gradient(var(--rm-ink) 0% 76%, var(--rm-track) 76% 100%)"
              }}
            >
              <span className="rm-donut-center">
                <strong>128</strong>
                <small>wpm</small>
              </span>
            </div>
            <p className="rm-donut-note">
              <strong>적정 범위 (안정적)</strong>
              <small>권장 110–140 wpm · 후반부 152 주의</small>
            </p>
          </article>
        </div>

        <div className="rm-session-grid">
          {sessionSummary.map((item) => (
            <article key={item.label} className={`rm-session-card ${item.tone}`}>
              <div className="rm-session-top">
                <span className="rm-session-icon" />
                <em>{item.note}</em>
              </div>
              <small>{item.label}</small>
              <strong>{item.value}</strong>
              <span className="rm-session-bar">
                <i style={{ width: `${item.pct}%` }} />
              </span>
            </article>
          ))}
        </div>

        {/* ② 진단 */}
        <SectionLabel no="②" title="진단" sub="잘한 점 · 개선이 필요한 3가지" />
        <article className="rm-card rm-strength-strip">
          {strengths.map((item) => (
            <div key={item.title}>
              <span className="rm-point-mark">✓</span>
              <span>
                <strong>{item.title}</strong>
                <small>{item.detail}</small>
              </span>
            </div>
          ))}
        </article>
        <div className="rm-diagnosis-grid">
          {diagnosis.map((item) => (
            <article key={item.no} className={`rm-diagnosis-card ${item.tone}`}>
              <header>
                <span className="rm-diagnosis-no">{item.no}</span>
                <h3>{item.title}</h3>
              </header>
              <small className="rm-overline">WHY IT MATTERS</small>
              <p>{item.why}</p>
              <div className="rm-next-action">
                <small className="rm-overline">NEXT ACTION</small>
                <p>{item.action}</p>
              </div>
            </article>
          ))}
        </div>

        {/* ③ 근거 */}
        <SectionLabel
          no="③"
          title="근거"
          sub="슬라이드별 시간 · 흐름 · 전사문 · 문제 표현"
        />
        <div className="rm-two-grid wide-left">
          <article className="rm-card">
            <header className="rm-card-head">
              <div>
                <h2>슬라이드별 시간 비교</h2>
                <small>행을 누르면 슬라이드 코칭으로 이동</small>
              </div>
              <span className="rm-legend-inline">
                <i className="target" /> 목표 <i className="actual" /> 실제
              </span>
            </header>
            <ul className="rm-slide-rows">
              {slideTimes.map((slide, index) => {
                const diff = slide.actual - slide.target;
                const max = 80;
                return (
                  <li key={slide.no}>
                    <button
                      type="button"
                      className="rm-slide-row"
                      onClick={() => onOpenCoaching(index)}
                    >
                      <span className="rm-slide-no">{slide.no}</span>
                      <span className="rm-slide-body">
                        <span className="rm-slide-title">
                          {slide.title}
                          <em
                            className={
                              diff > 5
                                ? "rm-diff over"
                                : diff < -5
                                  ? "rm-diff under"
                                  : "rm-diff ok"
                            }
                          >
                            {diff > 0 ? `+${diff}초` : `${diff}초`}
                          </em>
                        </span>
                        <span className="rm-slide-bars">
                          <i
                            className="target"
                            style={{ width: `${(slide.target / max) * 100}%` }}
                          />
                          <i
                            className={diff > 5 ? "actual over" : "actual"}
                            style={{ width: `${(slide.actual / max) * 100}%` }}
                          />
                        </span>
                      </span>
                      <span className="rm-slide-go">코칭 ›</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </article>

          <article className="rm-card">
            <header className="rm-card-head">
              <h2>전사문 · 문제 표현</h2>
              <button type="button" className="rm-chip">
                전체 전사 보기
              </button>
            </header>
            <div className="rm-player">
              <button type="button" className="rm-round-button dark">
                ▶
              </button>
              <span className="rm-player-track">
                <i style={{ width: "38%" }} />
              </span>
              <small>1:49 / 4:46</small>
            </div>
            <ul className="rm-evidence-list">
              {transcriptChips.map((chip) => (
                <li key={chip.time} className={chip.kind}>
                  <span className="rm-evidence-time">{chip.time}</span>
                  <span className="rm-evidence-text">{chip.text}</span>
                  <span className="rm-evidence-kind">
                    {chip.kind === "filler"
                      ? "습관어"
                      : chip.kind === "pause"
                        ? "침묵"
                        : chip.kind === "repeat"
                          ? "중복 설명"
                          : "서두름"}
                  </span>
                </li>
              ))}
            </ul>
          </article>
        </div>

        <div className="rm-two-grid wide-left">
          <article className="rm-card">
            <header className="rm-card-head">
              <div>
                <h2>슬라이드별 흐름 (Flow)</h2>
                <small>도트를 누르면 해당 슬라이드 코칭으로 이동</small>
              </div>
              <span className="rm-legend-inline">
                <i className="ok" /> 우수 <i className="warn" /> 주의{" "}
                <i className="miss" /> 이슈
              </span>
            </header>
            <div className="rm-flow">
              {flowSteps.map((step, index) => (
                <button
                  key={step.label}
                  type="button"
                  className={`rm-flow-step ${step.status}`}
                  onClick={() => onOpenCoaching(index)}
                >
                  <span className="rm-flow-dot">
                    {"count" in step && step.count ? step.count : ""}
                  </span>
                  <small>{step.label}</small>
                </button>
              ))}
            </div>
            <div className="rm-flow-minis">
              <div>
                <span className="rm-flow-mini-icon">✓</span>
                <span>
                  <small>FLOW CONSISTENCY</small>
                  <strong>94% Very Good</strong>
                </span>
              </div>
              <div>
                <span className="rm-flow-mini-icon">◉</span>
                <span>
                  <small>VISUAL SYNC</small>
                  <strong>88% Stable</strong>
                </span>
              </div>
            </div>
          </article>

          <article className="rm-card">
            <header className="rm-card-head">
              <h2>습관어 TOP 3</h2>
              <span className="rm-pill warn">12회</span>
            </header>
            <ul className="rm-filler-list">
              {fillerTop3.map((filler) => (
                <li key={filler.word}>
                  <span className="rm-filler-word">{filler.word}</span>
                  <strong>{filler.count}</strong>
                  <em className={filler.up ? "up" : "down"}>{filler.delta}</em>
                </li>
              ))}
            </ul>
          </article>
        </div>

        {/* ④ 행동 */}
        <SectionLabel no="④" title="행동" sub="다음 리허설 처방전 · 연습 코칭" />
        <article className="rm-card dark rm-rx-card">
          <div className="rm-rx-left">
            <span className="rm-overline light">AI 맞춤 코칭 제안</span>
            <h2>
              다음 리허설을 위한
              <br />
              1:1 처방전
            </h2>
            <p>
              이번 분석 결과를 기반으로 지금 가장 집중해야 할 연습 3가지를
              추천합니다.
            </p>
            <ol className="rm-rx-list">
              {nextPlan.map((item) => (
                <li key={item.step}>
                  <span className="rm-plan-step light">{item.step}</span>
                  <span className="rm-plan-label">{item.label}</span>
                  <span className="rm-plan-time">{item.time}</span>
                </li>
              ))}
            </ol>
          </div>
          <div className="rm-ticket">
            <header>
              <strong>AI Coaching Ticket</strong>
              <span className="rm-ticket-qr">▦</span>
            </header>
            <dl>
              <div>
                <dt>연습 모드</dt>
                <dd>슬라이드 4 집중 시뮬레이션</dd>
              </div>
              <div>
                <dt>추천 강도</dt>
                <dd className="hot">High Intensity</dd>
              </div>
              <div>
                <dt>예상 소요 시간</dt>
                <dd>20분</dd>
              </div>
            </dl>
            <button type="button" className="rm-button light block">
              지금 바로 코칭 연습 시작하기
            </button>
          </div>
        </article>
        <div className="rm-coach-grid">
          {coachingSummary.map((coach) => (
            <article key={coach.title} className="rm-card rm-coach-card">
              <header>
                <span className="rm-coach-icon">{coach.icon}</span>
                <span className={`rm-status ${coach.tone}`}>{coach.status}</span>
              </header>
              <h3>{coach.title}</h3>
              <p>{coach.detail}</p>
              <small>{coach.metric}</small>
            </article>
          ))}
        </div>

        {/* ⑤ 성장 */}
        <SectionLabel no="⑤" title="성장" sub="누적 성장 · 반복 문제 · 회차별 기록" />
        <div className="rm-grid">
          <article className="rm-card">
            <header className="rm-card-head">
              <div>
                <h2>누적 성장</h2>
                <small>1차 → 4차 커버율</small>
              </div>
              <span className="rm-delta">+34%p</span>
            </header>
            <div className="rm-growth-bars">
              {growthBars.map((value, index) => (
                <span
                  key={index}
                  className={
                    index === growthBars.length - 1
                      ? "rm-growth-bar last"
                      : "rm-growth-bar"
                  }
                  style={{ height: `${value}%` }}
                />
              ))}
            </div>
          </article>

          <article className="rm-card">
            <header className="rm-card-head">
              <h2>반복해서 나타나는 문제</h2>
              <small>1차 → 4차</small>
            </header>
            <ul className="rm-recur-list">
              {recurringIssues.map((issue) => (
                <li key={issue.label}>
                  <span className="rm-recur-label">{issue.label}</span>
                  <span className="rm-recur-spark">
                    {issue.runs.map((count, index) => (
                      <i
                        key={index}
                        style={{ height: `${8 + count * 4}px` }}
                        className={index === issue.runs.length - 1 ? "on" : ""}
                      />
                    ))}
                  </span>
                  <span className="rm-recur-note">{issue.note}</span>
                </li>
              ))}
            </ul>
          </article>

          <article className="rm-card">
            <header className="rm-card-head">
              <h2>회차별 기록</h2>
              <button type="button" className="rm-round-button subtle">
                ⋯
              </button>
            </header>
            <table className="rm-table compact">
              <thead>
                <tr>
                  <th>회차</th>
                  <th>시간</th>
                  <th>커버율</th>
                  <th>점수</th>
                </tr>
              </thead>
              <tbody>
                {recentRuns.map((run) => (
                  <tr key={run.no}>
                    <td>
                      <strong>{run.title}</strong>
                      <small className="rm-block-sub">{run.date}</small>
                    </td>
                    <td>{run.duration}</td>
                    <td>{run.coverage}</td>
                    <td>
                      <span className="rm-score">{run.score}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </article>
        </div>

        {/* ⑥ 공유 */}
        <SectionLabel no="⑥" title="공유" sub="PDF · 링크 · 이미지 · 팀 리포트" />
        <article className="rm-card dark rm-share-card">
          <div>
            <h2>이 리포트 공유하기</h2>
            <p>연습 결과를 팀·코치와 공유하거나 기록으로 남겨보세요.</p>
          </div>
          <div className="rm-share-actions">
            {shareActions.map((action) => (
              <button key={action.label} type="button" className="rm-share-button">
                <span>{action.icon}</span> {action.label}
              </button>
            ))}
          </div>
        </article>
    </>
  );
}

/* ── 슬라이드 코칭 상세 ─────────────────────────────── */

function SlideCoachingView({
  index,
  onBack,
  onNavigate
}: {
  index: number;
  onBack: () => void;
  onNavigate: (index: number) => void;
}) {
  const slide = slideTimes[index] ?? slideTimes[0];
  const diff = slide.actual - slide.target;

  return (
    <>
        <section className="rm-coach-hero">
          <div className="rm-coach-hero-left">
            <button type="button" className="rm-round-button" onClick={onBack}>
              ←
            </button>
            <div>
              <small>슬라이드 코칭</small>
              <h1>
                {slide.no}. {slide.title}
              </h1>
            </div>
          </div>
          <div className="rm-coach-hero-right">
            <span className="rm-pill soft">
              실제 {slide.actual}초 / 목표 {slide.target}초 (
              {diff > 0 ? `+${diff}` : diff}초)
            </span>
            <span className="rm-coach-nav">
              <button
                type="button"
                className="rm-round-button"
                disabled={index === 0}
                onClick={() => onNavigate(index - 1)}
              >
                ←
              </button>
              <small>
                {index + 1} / {slideTimes.length}
              </small>
              <button
                type="button"
                className="rm-round-button dark"
                disabled={index === slideTimes.length - 1}
                onClick={() => onNavigate(index + 1)}
              >
                →
              </button>
            </span>
          </div>
        </section>

        <div className="rm-coach-layout">
          <div className="rm-coach-main">
            <article className="rm-card rm-slide-preview">
              <span className="rm-slide-thumb">슬라이드 {slide.no} 미리보기</span>
            </article>

            <article className="rm-card">
              <header className="rm-card-head">
                <h2>대본 vs 실제 발화</h2>
                <span className="rm-legend-inline">
                  <i className="ok" /> 전달 <i className="miss" /> 누락{" "}
                  <i className="adlib" /> 애드립 <i className="warn" /> 문제 표현
                </span>
              </header>
              <ul className="rm-script-diff">
                {coachScript.map((line, lineIndex) => (
                  <li key={lineIndex} className={line.kind}>
                    <span className="rm-script-time">{line.time}</span>
                    <span className="rm-script-text">{line.text}</span>
                    <span className="rm-script-kind">
                      {line.kind === "match"
                        ? "전달됨"
                        : line.kind === "missed"
                          ? "누락"
                          : line.kind === "adlib"
                            ? "애드립"
                            : "문제 표현"}
                    </span>
                  </li>
                ))}
              </ul>
            </article>

            <article className="rm-card">
              <header className="rm-card-head">
                <h2>대본 수정 제안</h2>
                <span className="rm-pill soft">1건</span>
              </header>
              <div className="rm-rewrite">
                <div className="rm-rewrite-col before">
                  <small>현재 대본</small>
                  <p>
                    특히 첫 주 이탈이 전체의 60%를 차지하며, 이는 온보딩 퍼널의
                    구조적 복잡성에서 기인한 것으로 분석됩니다.
                  </p>
                </div>
                <span className="rm-rewrite-arrow">→</span>
                <div className="rm-rewrite-col after">
                  <small>제안 (실제 발화 기반)</small>
                  <p>
                    특히 <strong>첫 주에만 60%가 이탈</strong>합니다. 이유는
                    간단해요 — <strong>온보딩이 너무 복잡</strong>하기 때문입니다.
                  </p>
                </div>
              </div>
              <div className="rm-row-end">
                <button type="button" className="rm-button">
                  무시
                </button>
                <button type="button" className="rm-button dark">
                  대본에 반영
                </button>
              </div>
            </article>
          </div>

          <div className="rm-coach-side">
            <IssueFeed issues={slideIssuesByIndex[index] ?? []} />

            <article className="rm-card rm-drill-card">
              <header className="rm-card-head">
                <h2>이 슬라이드 연습</h2>
              </header>
              <p>
                이 슬라이드만 집중 연습하면 총평 등급이 <strong>A</strong>로
                올라갈 확률이 높아요.
              </p>
              <button type="button" className="rm-button dark block">
                슬라이드 {slide.no}만 연습 시작 →
              </button>
            </article>
          </div>
        </div>
    </>
  );
}

/* ── 공용 조각 ─────────────────────────────────────── */

function IssueFeed({ issues }: { issues: SlideIssue[] }) {
  const sorted = [...issues].sort((left, right) =>
    left.severity === right.severity ? 0 : left.severity === "issue" ? -1 : 1
  );
  const issueCount = sorted.filter((issue) => issue.severity === "issue").length;

  return (
    <article className="rm-card">
      <header className="rm-card-head">
        <h2>이 슬라이드 피드백</h2>
        {sorted.length > 0 ? (
          <span className={issueCount > 0 ? "rm-pill warn" : "rm-pill soft"}>
            {sorted.length}건
          </span>
        ) : (
          <span className="rm-pill pass">클리어</span>
        )}
      </header>

      {sorted.length === 0 ? (
        <div className="rm-issue-clear">
          <span className="rm-point-mark">✓</span>
          <div>
            <strong>이 슬라이드는 좋았어요!</strong>
            <small>시간·커버율·페이스 모두 목표 범위 안이에요.</small>
          </div>
        </div>
      ) : (
        <ul className="rm-issue-feed">
          {sorted.map((issue) => (
            <li
              key={issue.title}
              className={`rm-issue-item ${issue.severity}`}
            >
              <header>
                <span className="rm-issue-dot" />
                <em className="rm-tag">{issue.category}</em>
                <strong>{issue.title}</strong>
              </header>
              {issue.evidence.map((evidence) => (
                <p key={evidence.quote} className="rm-issue-evidence">
                  {evidence.time && (
                    <span className="rm-evidence-time">{evidence.time}</span>
                  )}
                  {evidence.quote}
                </p>
              ))}
              {issue.showWpmTrail && (
                <div className="rm-wpm-trail small">
                  {coachWpmTrail.map((wpm, wpmIndex) => (
                    <div key={wpmIndex} className="rm-wpm-col">
                      <span
                        className={wpm > 140 ? "rm-wpm-bar hot" : "rm-wpm-bar"}
                        style={{ height: `${(wpm - 100) * 0.9}px` }}
                      />
                      <small>{wpm}</small>
                    </div>
                  ))}
                </div>
              )}
              <div className="rm-next-action">
                <small className="rm-overline">NEXT ACTION</small>
                <p>{issue.action}</p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </article>
  );
}

function SectionLabel({
  no,
  title,
  sub,
  action
}: {
  no: string;
  title: string;
  sub: string;
  action?: string;
}) {
  return (
    <div className="rm-section-label">
      <span className="rm-section-no">{no}</span>
      <strong>{title}</strong>
      <small>{sub}</small>
      {action && (
        <button type="button" className="rm-chip rm-section-action">
          {action}
        </button>
      )}
    </div>
  );
}
