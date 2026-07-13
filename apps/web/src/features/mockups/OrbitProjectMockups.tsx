import {
  IconArrowLeft,
  IconCalendar,
  IconChartLine,
  IconCheck,
  IconChevronRight,
  IconClock,
  IconEye,
  IconFileText,
  IconLock,
  IconMail,
  IconMicrophone,
  IconPencil,
  IconPresentation,
  IconRefresh,
  IconShieldCheck,
  IconSparkles,
  IconTarget,
  IconUsers,
  IconX
} from "@tabler/icons-react";
import { useState, type ReactNode } from "react";
import orbitLogo from "./assets/orbit-logo-selected.png";
import { OrbitButton, OrbitStatus } from "../../design-system";
import "./orbit-project-mockups.css";

type ProjectMockupProps = {
  onNavigate: (path: string) => void;
};

type AccessRole = "editor" | "viewer";
type AccessState = "request" | "pending";
type TrendMode = "score" | "duration";

const reportRuns = [
  { date: "07.10", duration: 272, focus: "결론 CTA 명확히 말하기", id: 4, score: 86 },
  { date: "07.09", duration: 291, focus: "수치 설명 전 호흡 정리", id: 3, score: 81 },
  { date: "07.08", duration: 309, focus: "도입부 핵심 메시지 압축", id: 2, score: 77 },
  { date: "07.07", duration: 324, focus: "말버릇과 긴 멈춤 줄이기", id: 1, score: 72 }
];

export function OrbitProjectAccessMockup(props: ProjectMockupProps) {
  const [role, setRole] = useState<AccessRole>("editor");
  const [state, setState] = useState<AccessState>("request");
  const [notice, setNotice] = useState("");

  function requestAccess() {
    setState("pending");
    setNotice("");
  }

  function checkStatus() {
    setNotice("아직 승인 대기 중이에요. 승인되면 이메일로 알려드릴게요.");
  }

  return (
    <div className="orbit-project-access-mockup">
      <ProjectUtilityHeader
        label="프로젝트 접근"
        onBack={() => props.onNavigate("/mockup/home")}
        right={<OrbitStatus tone="neutral"><IconLock size={13} /> 비공개 프로젝트</OrbitStatus>}
      />
      <main className="project-access-main">
        <section className="project-access-context">
          <div className="project-access-context-icon"><IconPresentation size={32} /></div>
          <p className="orbit-ds-eyebrow">PRIVATE PROJECT</p>
          <h1>2026 하반기<br />제품 전략</h1>
          <p>제품팀의 다음 반기 전략과 실행 우선순위를 정리한 발표 프로젝트입니다.</p>
          <dl>
            <div><dt><IconUsers size={17} /> 프로젝트 소유자</dt><dd>김지윤 · Product Lead</dd></div>
            <div><dt><IconFileText size={17} /> 프로젝트 구성</dt><dd>슬라이드 18장 · 리포트 4개</dd></div>
            <div><dt><IconCalendar size={17} /> 최근 업데이트</dt><dd>오늘 09:23</dd></div>
          </dl>
          <div className="project-access-members"><span className="orbit-ds-avatar">김</span><span className="orbit-ds-avatar">박</span><span className="orbit-ds-avatar">이</span><strong>외 3명이 함께 작업 중</strong></div>
        </section>

        <section className="project-access-card">
          {state === "request" ? (
            <>
              <span className="project-access-card-icon"><IconLock size={28} /></span>
              <p className="orbit-ds-eyebrow">ACCESS REQUIRED</p>
              <h2>이 프로젝트에 참여하려면<br />승인이 필요해요.</h2>
              <p className="project-access-card-copy">필요한 권한을 선택하면 프로젝트 소유자에게 요청을 보냅니다.</p>
              <div aria-label="요청 권한" className="project-access-options" role="radiogroup">
                <button aria-checked={role === "editor"} className={role === "editor" ? "selected" : ""} onClick={() => setRole("editor")} role="radio" type="button">
                  <span><IconPencil size={21} /></span><div><strong>편집 가능</strong><small>슬라이드와 발표 메모를 확인하고 수정할 수 있어요.</small></div><i>{role === "editor" ? <IconCheck size={14} /> : null}</i>
                </button>
                <button aria-checked={role === "viewer"} className={role === "viewer" ? "selected" : ""} onClick={() => setRole("viewer")} role="radio" type="button">
                  <span><IconEye size={21} /></span><div><strong>보기 전용</strong><small>프로젝트 내용과 리포트를 읽고 확인할 수 있어요.</small></div><i>{role === "viewer" ? <IconCheck size={14} /> : null}</i>
                </button>
              </div>
              <div className="project-access-privacy"><IconShieldCheck size={19} /><span>승인 전에는 프로젝트 내용이 공개되지 않습니다.</span></div>
              <div className="project-access-actions">
                <OrbitButton icon={<IconMail size={18} />} onClick={requestAccess}>접근 권한 요청</OrbitButton>
                <button onClick={() => props.onNavigate("/mockup/home")} type="button">프로젝트 목록으로</button>
              </div>
            </>
          ) : (
            <>
              <span className="project-access-card-icon pending"><IconClock size={30} /></span>
              <p className="orbit-ds-eyebrow">REQUEST SENT</p>
              <h2>접근 요청을 보냈어요.</h2>
              <p className="project-access-card-copy">김지윤님이 요청을 확인하고 있습니다. 승인되면 바로 프로젝트를 열 수 있어요.</p>
              <div className="project-access-pending-summary">
                <div><span>요청 권한</span><strong>{role === "editor" ? "편집 가능" : "보기 전용"}</strong></div>
                <div><span>요청 시간</span><strong>오늘 19:45</strong></div>
                <div><span>현재 상태</span><OrbitStatus tone="warning">승인 대기</OrbitStatus></div>
              </div>
              <ol className="project-access-timeline">
                <li className="complete"><span><IconCheck size={15} /></span><div><strong>접근 요청 전송</strong><small>프로젝트 소유자에게 알림을 보냈습니다.</small></div></li>
                <li><span><IconClock size={15} /></span><div><strong>소유자 승인 대기</strong><small>보통 몇 시간 안에 처리됩니다.</small></div></li>
              </ol>
              {notice ? <p className="project-access-notice" role="status">{notice}</p> : null}
              <div className="project-access-actions pending-actions">
                <OrbitButton icon={<IconRefresh size={18} />} onClick={checkStatus}>승인 여부 다시 확인</OrbitButton>
                <button onClick={() => { setState("request"); setNotice(""); }} type="button"><IconX size={16} /> 요청 취소</button>
              </div>
            </>
          )}
        </section>
      </main>
    </div>
  );
}

export function OrbitProjectReportMockup(props: ProjectMockupProps) {
  const [trendMode, setTrendMode] = useState<TrendMode>("score");

  return (
    <div className="orbit-project-report-mockup">
      <ProjectReportHeader onNavigate={props.onNavigate} />
      <main className="project-report-main">
        <div className="project-report-breadcrumb"><button onClick={() => props.onNavigate("/mockup/reports")} type="button"><IconArrowLeft size={16} /> 리포트 목록</button><IconChevronRight size={14} /><strong>2026 하반기 제품 전략</strong></div>
        <header className="project-report-heading">
          <div><p className="orbit-ds-eyebrow">PROJECT PERFORMANCE</p><h1>프로젝트 종합 리포트</h1><p>네 번의 리허설에서 달라진 발표 흐름과 다음 연습 목표를 확인하세요.</p></div>
          <OrbitButton icon={<IconMicrophone size={18} />} onClick={() => props.onNavigate("/mockup/microphone-check")}>새 리허설</OrbitButton>
        </header>

        <section className="project-report-overview">
          <article className="project-report-score-card"><span>최근 종합 점수</span><div><strong>86</strong><small>/ 100</small></div><p><IconChartLine size={15} /> 첫 리허설보다 <b>14점 향상</b></p><progress aria-label="최근 종합 점수" max="100" value="86" /></article>
          <article className="project-report-ai-card"><span><IconSparkles size={17} /> AI 종합 요약</span><h2>발표 구조는 안정됐고,<br />결론의 행동 요청만 더 선명해지면 좋아요.</h2><p>도입부 메시지와 말하기 속도는 꾸준히 좋아졌습니다. 다음 연습에서는 마지막 30초를 집중적으로 다듬어보세요.</p></article>
        </section>

        <section className="project-report-metrics" aria-label="프로젝트 리허설 핵심 지표">
          <ProjectMetric icon={<IconClock size={18} />} label="발표 시간" note="첫 회차보다 52초 단축" value="04:32" />
          <ProjectMetric icon={<IconMicrophone size={18} />} label="말하기 속도" note="권장 범위 120–150" value="132 WPM" />
          <ProjectMetric icon={<IconTarget size={18} />} label="키워드 포함률" note="최근 3회 연속 상승" value="83%" />
          <ProjectMetric icon={<IconRefresh size={18} />} label="불필요한 말버릇" note="첫 회차보다 38% 감소" value="5회" />
        </section>

        <div className="project-report-grid">
          <section className="project-report-trend">
            <header><div><h2>회차별 변화</h2><p>같은 발표를 반복하며 달라진 흐름입니다.</p></div><div role="tablist" aria-label="추세 지표"><button aria-selected={trendMode === "score"} onClick={() => setTrendMode("score")} role="tab" type="button">점수</button><button aria-selected={trendMode === "duration"} onClick={() => setTrendMode("duration")} role="tab" type="button">발표 시간</button></div></header>
            <div className="project-report-trend-list">
              {[...reportRuns].reverse().map((run) => {
                const value = trendMode === "score" ? run.score : Math.round(((340 - run.duration) / 100) * 100);
                return <div key={run.id}><span>{run.id}회차<small>{run.date}</small></span><progress aria-label={`${run.id}회차 ${trendMode === "score" ? "점수" : "발표 시간 개선"}`} max="100" value={value} /><strong>{trendMode === "score" ? `${run.score}점` : formatDuration(run.duration)}</strong></div>;
              })}
            </div>
            <p className="project-report-trend-caption"><IconChartLine size={16} /> {trendMode === "score" ? "매 회차 평균 4.7점씩 꾸준히 상승했어요." : "반복할수록 핵심 메시지에 집중하며 발표 시간이 짧아졌어요."}</p>
          </section>

          <aside className="project-report-coaching">
            <article className="positive"><span><IconCheck size={17} /> 반복해서 좋아진 점</span><strong>도입부 핵심 메시지가<br />빠르게 전달돼요.</strong><ul><li><IconCheck size={12} />첫 30초 메시지 선명도 상승</li><li><IconCheck size={12} />말하기 속도 권장 범위 유지</li><li><IconCheck size={12} />긴 멈춤 7회 → 2회 감소</li></ul></article>
            <article className="next"><span><IconTarget size={17} /> 다음 연습 목표</span><strong>결론에서 원하는 행동을<br />한 문장으로 말해보세요.</strong><p>“세 가지 전략의 우선순위를 오늘 확정해 주세요.”</p></article>
          </aside>
        </div>

        <section className="project-report-runs">
          <header><div><h2>회차별 리포트</h2><p>총 4회의 리허설 기록</p></div><OrbitStatus tone="lilac">최근 30일</OrbitStatus></header>
          <div className="project-report-run-columns"><span>회차</span><span>날짜</span><span>점수</span><span>발표 시간</span><span>이번 회차 집중 목표</span><span /></div>
          <div className="project-report-run-list">
            {reportRuns.map((run) => <button key={run.id} onClick={() => props.onNavigate("/mockup/report")} type="button"><strong>{run.id}<small>회차</small></strong><span>{run.date}</span><b>{run.score}<small>점</small></b><time>{formatDuration(run.duration)}</time><span>{run.focus}</span><IconChevronRight size={18} /></button>)}
          </div>
        </section>
      </main>
    </div>
  );
}

function ProjectUtilityHeader(props: { label: string; onBack: () => void; right: ReactNode }) {
  return <header className="project-utility-header"><div><button aria-label="뒤로 가기" onClick={props.onBack} type="button"><IconArrowLeft size={20} /></button><img alt="ORBIT" src={orbitLogo} /><span /><strong>{props.label}</strong></div><div>{props.right}</div></header>;
}

function ProjectReportHeader(props: ProjectMockupProps) {
  return <header className="project-report-header"><button aria-label="ORBIT 홈" onClick={() => props.onNavigate("/mockup/home")} type="button"><img alt="ORBIT" src={orbitLogo} /></button><nav aria-label="주요 메뉴"><button onClick={() => props.onNavigate("/mockup/home")} type="button">홈</button><button onClick={() => props.onNavigate("/mockup/home")} type="button">프로젝트</button><button onClick={() => props.onNavigate("/mockup/rehearsal")} type="button">리허설</button><button aria-current="page" onClick={() => props.onNavigate("/mockup/reports")} type="button">리포트</button></nav><div><span><IconPresentation size={17} />2026 하반기 제품 전략</span><span className="orbit-ds-avatar">김</span></div></header>;
}

function ProjectMetric(props: { icon: ReactNode; label: string; note: string; value: string }) {
  return <article><span>{props.icon}{props.label}</span><strong>{props.value}</strong><small>{props.note}</small></article>;
}

function formatDuration(seconds: number) {
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(remainder).padStart(2, "0")}`;
}
