import {
  IconArrowLeft,
  IconArrowRight,
  IconCheck,
  IconClock,
  IconFileText,
  IconLayoutGrid,
  IconMessageCircleQuestion,
  IconMicrophone,
  IconPresentation,
  IconRefresh,
  IconSparkles,
  IconUserCircle,
  IconUsers
} from "@tabler/icons-react";
import { useState, type ReactNode } from "react";
import {
  OrbitButton,
  OrbitDialog,
  OrbitField,
  OrbitInput,
  OrbitStatus,
  OrbitTabs,
  OrbitTextarea
} from "../../design-system";
import { AiPptMockupPage } from "../ai-ppt/AiPptMockupPage";
import { MockupHeader } from "./OrbitMockupHeader";
import "./orbit-gap-mockups.css";

type MockupNavigateProps = { onNavigate: (path: string) => void };

const catalogItems = [
  {
    category: "백엔드 계약만 존재",
    description: "청중과 목적, 평가 관점을 1분 안에 정리합니다.",
    icon: <IconSparkles size={24} />,
    path: "/mockup/brief",
    title: "발표 브리프 · 평가 관점"
  },
  {
    category: "백엔드 계약만 존재",
    description: "자동 저장 버전을 비교하고 안전하게 복원합니다.",
    icon: <IconClock size={24} />,
    path: "/mockup/version-history",
    title: "에디터 버전 기록"
  },
  {
    category: "구현됨 · 목업 없음",
    description: "리허설 결과에서 다음 연습 Top 3를 고릅니다.",
    icon: <IconLayoutGrid size={24} />,
    path: "/mockup/practice-plan",
    title: "다음 연습 계획"
  },
  {
    category: "구현됨 · 목업 없음",
    description: "한 구간을 짧게 반복하며 안정화 여부를 확인합니다.",
    icon: <IconMicrophone size={24} />,
    path: "/mockup/focused-practice",
    title: "집중 연습"
  },
  {
    category: "구현됨 · 목업 없음",
    description: "발표 근거를 바탕으로 예상 질문에 답합니다.",
    icon: <IconMessageCircleQuestion size={24} />,
    path: "/mockup/challenge-qna",
    title: "도전 Q&A"
  },
  {
    category: "구현됨 · 목업 없음",
    description: "비밀번호 확인 후 질문방 또는 스트리밍 방으로 입장합니다.",
    icon: <IconUsers size={24} />,
    path: "/mockup/audience",
    title: "청중 입장"
  },
  {
    category: "고립된 독립 페이지",
    description: "기존 AI PPT 위저드를 목업 플로우에서 확인합니다.",
    icon: <IconPresentation size={24} />,
    path: "/mockup/ai-ppt",
    title: "AI PPT 상세 위저드"
  }
] as const;

export function OrbitMockupCatalog(props: MockupNavigateProps) {
  return (
    <MockupPage onNavigate={props.onNavigate}>
      <section className="gap-catalog-hero">
        <div>
          <p className="orbit-ds-eyebrow">PRODUCT SURFACE MAP</p>
          <h1>화면 밖에 있던 기능을<br />사용자 여정으로 연결했어요.</h1>
          <p>production 구현, API 계약, 독립 페이지를 기존 목업과 대조해 새로 필요한 화면만 모았습니다.</p>
        </div>
        <dl>
          <div><dt>신규 목업</dt><dd>6</dd></div>
          <div><dt>연결한 페이지</dt><dd>1</dd></div>
          <div><dt>디자인 기준</dt><dd>ORBIT DS</dd></div>
        </dl>
      </section>

      <section className="gap-catalog-grid" aria-label="누락 목업 목록">
        {catalogItems.map((item, index) => (
          <button className={`gap-catalog-card tone-${index % 3}`} key={item.path} onClick={() => props.onNavigate(item.path)} type="button">
            <span className="gap-catalog-card-icon">{item.icon}</span>
            <span><small>{item.category}</small><strong>{item.title}</strong><p>{item.description}</p></span>
            <IconArrowRight aria-hidden="true" size={20} />
          </button>
        ))}
      </section>
    </MockupPage>
  );
}

export function OrbitAiPptConnectedMockup(props: MockupNavigateProps) {
  return <div className="gap-ai-ppt-connected"><button onClick={() => props.onNavigate("/mockup/catalog")} type="button"><IconArrowLeft size={17} /> 목업 맵</button><AiPptMockupPage /></div>;
}

const audienceOptions = ["처음 듣는 청중", "실무자", "의사결정자"];
const purposeOptions = ["설명", "설득", "교육", "보고"];
const lensOptions = [
  { id: "general", label: "처음 듣는 청중", copy: "용어 설명과 핵심 흐름을 먼저 봅니다." },
  { id: "decision", label: "의사결정자", copy: "근거 수치와 다음 행동을 우선합니다." },
  { id: "strict", label: "엄격한 검토자", copy: "주장과 근거, 빠진 전제를 확인합니다." }
];

export function OrbitPresentationBriefMockup(props: MockupNavigateProps) {
  const [audience, setAudience] = useState(audienceOptions[2]);
  const [purpose, setPurpose] = useState(purposeOptions[1]);
  const [lens, setLens] = useState("decision");
  const [outcome, setOutcome] = useState("제품 전략 승인과 다음 분기 투자 결정");
  const [saved, setSaved] = useState(false);

  return (
    <MockupPage onNavigate={props.onNavigate}>
      <GapBreadcrumb current="발표 브리프" onBack={() => props.onNavigate("/mockup/catalog")} />
      <section className="gap-page-heading">
        <div><p className="orbit-ds-eyebrow">PRESENTATION BRIEF</p><h1>누구에게, 무엇을 얻기 위해<br />발표하는지 먼저 정리해요.</h1><p>1분 브리프가 생성 결과와 리허설 평가 기준을 같은 방향으로 맞춥니다.</p></div>
        <OrbitStatus tone={saved ? "success" : "lilac"}>{saved ? "브리프 저장됨" : "약 1분"}</OrbitStatus>
      </section>

      <div className="brief-layout">
        <section className="brief-form-panel">
          <BriefChoice label="청중" options={audienceOptions} selected={audience} onSelect={setAudience} />
          <BriefChoice label="발표 목적" options={purposeOptions} selected={purpose} onSelect={setPurpose} />
          <div className="brief-two-column">
            <OrbitField id="brief-duration" label="목표 시간"><OrbitInput defaultValue="15" inputMode="numeric" /></OrbitField>
            <OrbitField id="brief-outcome" label="발표 후 원하는 결과"><OrbitInput onChange={(event) => setOutcome(event.currentTarget.value)} value={outcome} /></OrbitField>
          </div>
          <OrbitField hint="최대 3개까지 핵심 문장을 적을 수 있어요." id="brief-must-cover" label="반드시 전달할 내용">
            <OrbitTextarea defaultValue={"신제품 2종 출시\nARR 30% 성장 목표\n의사결정이 필요한 투자 항목"} rows={4} />
          </OrbitField>
          <div className="brief-two-column">
            <OrbitField id="brief-opening" label="오프닝 조건"><OrbitInput defaultValue="시장 변화 수치로 시작" /></OrbitField>
            <OrbitField id="brief-closing" label="클로징 조건"><OrbitInput defaultValue="승인할 다음 행동을 명확히 요청" /></OrbitField>
          </div>
        </section>

        <aside className="brief-lens-panel">
          <header><span><IconUserCircle size={22} /></span><div><h2>평가 관점</h2><p>같은 발표에서도 먼저 볼 기준을 고릅니다.</p></div></header>
          <div className="brief-lens-list" role="radiogroup" aria-label="평가 관점">
            {lensOptions.map((option) => (
              <button aria-checked={lens === option.id} className={lens === option.id ? "selected" : ""} key={option.id} onClick={() => setLens(option.id)} role="radio" type="button">
                <span>{lens === option.id ? <IconCheck size={15} /> : null}</span><strong>{option.label}</strong><small>{option.copy}</small>
              </button>
            ))}
          </div>
          <div className="brief-impact-note"><IconSparkles size={20} /><span><strong>브리프가 있으면</strong> 필수 메시지, 오프닝, 클로징과 예상 반론까지 분석해요.</span></div>
          <OrbitButton icon={<IconArrowRight size={18} />} onClick={() => setSaved(true)}>브리프 저장하고 계속</OrbitButton>
          <button className="gap-quiet-link" type="button">일반 기준으로 건너뛰기</button>
        </aside>
      </div>
    </MockupPage>
  );
}

const practiceGoals = [
  { category: "구조", problem: "결론을 첫 30초 안에 먼저 말하기", action: "첫 문장을 결론으로 바꾸고 근거를 이어 말해 보세요.", success: "30초 안에 결론과 요청 사항이 모두 등장" },
  { category: "핵심 메시지", problem: "ARR 30% 성장 근거를 한 문장으로 연결하기", action: "수치 뒤에 고객 행동 변화의 원인을 붙여 말하세요.", success: "수치와 원인이 끊김 없이 한 문장으로 전달" },
  { category: "전달", problem: "전환 구간의 긴 멈춤 줄이기", action: "다음 장표의 첫 문장을 미리 소리 내어 연결하세요.", success: "전환 멈춤이 2초 이내로 유지" }
];

export function OrbitPracticePlanMockup(props: MockupNavigateProps) {
  const [selected, setSelected] = useState(0);
  const goal = practiceGoals[selected];
  return (
    <MockupPage onNavigate={props.onNavigate}>
      <GapBreadcrumb current="다음 연습 계획" onBack={() => props.onNavigate("/mockup/report")} />
      <section className="gap-page-heading compact">
        <div><p className="orbit-ds-eyebrow">NEXT REHEARSAL</p><h1>다음 연습은 이 세 가지에 집중하세요.</h1><p>한 번에 하나씩 고르고, 짧게 반복한 뒤 전체 발표에서 확인합니다.</p></div>
        <OrbitStatus tone="lilac">Adaptive coach</OrbitStatus>
      </section>
      <div className="practice-plan-layout">
        <ol className="practice-plan-list">
          {practiceGoals.map((item, index) => (
            <li key={item.problem}><button aria-pressed={selected === index} onClick={() => setSelected(index)} type="button"><span>0{index + 1}</span><div><small>{item.category}</small><strong>{item.problem}</strong></div><OrbitStatus tone={index === 0 ? "warning" : "neutral"}>{index === 0 ? "반복 필요" : "새 목표"}</OrbitStatus></button></li>
          ))}
        </ol>
        <article className="practice-plan-focus" aria-live="polite">
          <span className="practice-focus-icon"><IconSparkles size={24} /></span><small>{goal.category}</small><h2>{goal.problem}</h2>
          <dl><div><dt>다음 행동</dt><dd>{goal.action}</dd></div><div><dt>성공 기준</dt><dd>{goal.success}</dd></div></dl>
          <OrbitButton icon={<IconMicrophone size={18} />} onClick={() => props.onNavigate("/mockup/focused-practice")}>선택한 구간 연습</OrbitButton>
          <button className="gap-quiet-link" onClick={() => props.onNavigate("/mockup/challenge-qna")} type="button">도전 질문 3개 연습 <IconArrowRight size={16} /></button>
        </article>
      </div>
    </MockupPage>
  );
}

export function OrbitFocusedPracticeMockup(props: MockupNavigateProps) {
  const [recording, setRecording] = useState(false);
  const [attempts, setAttempts] = useState<Array<"다시 연습" | "통과">>(["다시 연습"]);
  function toggleRecording() {
    if (!recording) { setRecording(true); return; }
    setRecording(false);
    setAttempts((current) => [...current, current.length >= 2 ? "통과" : "다시 연습"]);
  }
  return (
    <MockupPage onNavigate={props.onNavigate}>
      <GapBreadcrumb current="집중 연습" onBack={() => props.onNavigate("/mockup/practice-plan")} />
      <section className="focused-mockup-shell">
        <header><div><p className="orbit-ds-eyebrow">FOCUSED PRACTICE</p><h1>한 구간만 짧게 반복하세요.</h1><p>슬라이드 3 · 제품 우선순위</p></div><OrbitStatus tone={attempts.at(-1) === "통과" ? "success" : recording ? "warning" : "lilac"}>{attempts.at(-1) === "통과" ? "연습에서 안정화됨" : recording ? "녹음 중" : "연습 가능"}</OrbitStatus></header>
        <div className="focused-mockup-layout">
          <section className="focused-slide-card"><span>03 · PRIORITIES</span><h2>2026 핵심 우선순위</h2><p>고객 가치 중심의 성장 가속화</p><div><strong>+15%</strong><small>시장 점유율</small></div></section>
          <article className="focused-goal-card"><span><IconSparkles size={22} /></span><small>현재 목표</small><h2>ARR 30% 성장 근거를 한 문장으로 연결하기</h2><p>수치 뒤에 고객 행동 변화의 원인을 붙여 말하세요.</p><div><IconCheck size={17} /><span>수치와 원인이 끊김 없이 한 문장으로 전달</span></div></article>
        </div>
        <section className="focused-attempts"><header><h2>반복 기록</h2><span>{attempts.length}회 시도</span></header>{attempts.map((result, index) => <div key={`${result}-${index}`}><span>{index + 1}회</span><strong>{result}</strong><small>{result === "통과" ? "핵심 수치와 근거가 연결됐어요." : "근거 문장을 조금 더 짧게 말해 보세요."}</small><OrbitStatus tone={result === "통과" ? "success" : "warning"}>{result}</OrbitStatus></div>)}</section>
        <footer><OrbitButton icon={<IconMicrophone size={18} />} onClick={toggleRecording}>{recording ? "녹음 끝내기" : attempts.length ? "한 번 더 연습" : "녹음 시작"}</OrbitButton><OrbitButton onClick={() => props.onNavigate("/mockup/practice-plan")} variant="quiet">연습 마치기</OrbitButton></footer>
      </section>
    </MockupPage>
  );
}

export function OrbitChallengeQnaMockup(props: MockupNavigateProps) {
  const [mode, setMode] = useState("voice");
  const [hint, setHint] = useState("");
  const [answer, setAnswer] = useState("");
  const [submitted, setSubmitted] = useState(false);
  return (
    <MockupPage onNavigate={props.onNavigate}>
      <GapBreadcrumb current="도전 Q&A" onBack={() => props.onNavigate("/mockup/practice-plan")} />
      <section className="qna-mockup-shell">
        <header><div><p className="orbit-ds-eyebrow">CHALLENGE Q&amp;A</p><h1>질문 하나에 집중해 답해 보세요.</h1><p>실제 청중이 물을 만한 질문을 발표 근거로 연습합니다.</p></div><OrbitStatus tone="lilac">1 / 3</OrbitStatus></header>
        <article className="qna-mockup-question"><small>반론 · 어려움</small><h2>신제품 2종을 동시에 출시할 때 실행 리스크가 커지지 않는다고 판단한 근거는 무엇인가요?</h2></article>
        <nav className="qna-mockup-help" aria-label="답변 도움"><button onClick={() => setHint("핵심 개념: 단계별 출시 기준, 고객 검증, 공통 플랫폼")}>개념 힌트</button><button onClick={() => setHint("장표 3의 우선순위와 장표 5의 실행 로드맵을 연결하세요.")}>장표 근거</button><span>전체 가이드는 첫 답변 후 열립니다.</span></nav>
        {hint ? <aside className="qna-mockup-hint" aria-live="polite">{hint}</aside> : null}
        <OrbitTabs activeTab={mode} ariaLabel="답변 방식" onChange={setMode} tabs={[{ id: "voice", label: "음성" }, { id: "text", label: "텍스트" }]}>
          <section className="qna-mockup-answer">
            {mode === "text" ? <OrbitTextarea aria-label="답변" onChange={(event) => setAnswer(event.currentTarget.value)} placeholder="결론, 근거, 다음 행동 순서로 답해 보세요." rows={6} value={answer} /> : <div className="qna-voice-ready"><span><IconMicrophone size={28} /></span><div><strong>음성 답변이 기본이에요.</strong><p>준비되면 녹음을 시작하세요. 최대 2분 뒤 자동으로 멈춥니다.</p></div></div>}
            <OrbitButton disabled={mode === "text" && !answer.trim()} icon={mode === "voice" ? <IconMicrophone size={18} /> : <IconArrowRight size={18} />} onClick={() => setSubmitted(true)}>{mode === "voice" ? "음성 답변 시작" : "답변 제출"}</OrbitButton>
          </section>
        </OrbitTabs>
        {submitted ? <section className="qna-mockup-result" aria-live="polite"><span><IconCheck size={22} /></span><div><small>답변 피드백</small><h2>결론은 명확해요. 실행 기준을 한 가지 더 붙여 보세요.</h2><p>청중 적합성: 의사결정자가 비교할 수 있도록 단계별 중단 조건을 함께 말하면 더 설득력 있어요.</p></div><OrbitButton icon={<IconArrowRight size={18} />} onClick={() => { setSubmitted(false); setAnswer(""); }}>다음 질문</OrbitButton></section> : null}
      </section>
    </MockupPage>
  );
}

export function OrbitAudienceEntranceMockup(props: MockupNavigateProps) {
  const [passcode, setPasscode] = useState("");
  const [verified, setVerified] = useState(false);
  const [room, setRoom] = useState("");
  return (
    <div className="audience-gap-page">
      <button className="audience-gap-back" onClick={() => props.onNavigate("/mockup/catalog")} type="button"><IconArrowLeft size={18} /> 목업 맵</button>
      <section className="audience-gap-panel">
        <span className="audience-gap-mark"><IconPresentation size={28} /></span><p className="orbit-ds-eyebrow">LIVE AUDIENCE</p><h1>청중 입장</h1><p>{verified ? "입장할 공간을 선택해 주세요." : "발표자가 공유한 4자리 비밀번호를 입력해 주세요."}</p>
        {!verified ? <><label className="audience-gap-code"><span>입장 비밀번호</span><input aria-label="4자리 입장 비밀번호" inputMode="numeric" maxLength={4} onChange={(event) => setPasscode(event.currentTarget.value.replace(/\D/g, ""))} value={passcode} /><div aria-hidden="true">{[0, 1, 2, 3].map((index) => <span className={passcode[index] ? "filled" : ""} key={index}>{passcode[index] ?? ""}</span>)}</div></label><OrbitButton disabled={passcode.length !== 4} onClick={() => setVerified(true)}>비밀번호 확인</OrbitButton></> : <><OrbitStatus tone="success">비밀번호 확인 완료</OrbitStatus><div className="audience-gap-rooms" role="radiogroup" aria-label="입장할 방"><button aria-checked={room === "questions"} className={room === "questions" ? "selected" : ""} onClick={() => setRoom("questions")} role="radio" type="button"><IconMessageCircleQuestion size={24} /><strong>질문방</strong><small>발표자에게 질문을 남깁니다.</small></button><button aria-checked={room === "stream"} className={room === "stream" ? "selected" : ""} onClick={() => setRoom("stream")} role="radio" type="button"><IconPresentation size={24} /><strong>스트리밍 방</strong><small>발표 화면을 함께 봅니다.</small></button></div><OrbitButton disabled={!room} icon={<IconArrowRight size={18} />}>입장하기</OrbitButton></>}
        <small className="audience-gap-session">세션 ORBIT-2407</small>
      </section>
    </div>
  );
}

const snapshots = [
  { version: 18, label: "현재 버전", reason: "메시지 제안 적용", time: "오늘 14:32", tone: "lilac" as const },
  { version: 17, label: "자동 저장", reason: "슬라이드 4 레이아웃 수정", time: "오늘 14:18", tone: "neutral" as const },
  { version: 16, label: "자동 저장", reason: "발표 메모와 키워드 변경", time: "오늘 13:54", tone: "neutral" as const },
  { version: 15, label: "덱 교체", reason: "AI 초안 생성 완료", time: "오늘 13:40", tone: "warning" as const }
];

export function OrbitVersionHistoryMockup(props: MockupNavigateProps) {
  const [selected, setSelected] = useState(1);
  const [confirming, setConfirming] = useState(false);
  const [restored, setRestored] = useState(false);
  const snapshot = snapshots[selected];
  return (
    <MockupPage onNavigate={props.onNavigate}>
      <GapBreadcrumb current="버전 기록" onBack={() => props.onNavigate("/mockup/editor")} />
      <section className="gap-page-heading compact"><div><p className="orbit-ds-eyebrow">VERSION HISTORY</p><h1>이전 작업을 확인하고 안전하게 복원하세요.</h1><p>자동 저장과 주요 변경 시점의 덱 버전을 비교합니다.</p></div><OrbitStatus tone={restored ? "success" : "neutral"}>{restored ? `버전 ${snapshot.version} 복원됨` : "현재 버전 18"}</OrbitStatus></section>
      <div className="version-layout">
        <aside className="version-list"><header><h2>저장 기록</h2><button aria-label="새로고침" type="button"><IconRefresh size={18} /></button></header>{snapshots.map((item, index) => <button aria-pressed={selected === index} key={item.version} onClick={() => { setSelected(index); setRestored(false); }} type="button"><span><IconClock size={18} /></span><div><small>{item.time}</small><strong>버전 {item.version} · {item.reason}</strong></div><OrbitStatus tone={item.tone}>{item.label}</OrbitStatus></button>)}</aside>
        <section className="version-preview"><header><div><small>미리보기</small><h2>버전 {snapshot.version} · {snapshot.reason}</h2></div><OrbitButton disabled={selected === 0} icon={<IconRefresh size={18} />} onClick={() => setConfirming(true)}>이 버전 복원</OrbitButton></header><div className="version-preview-slide"><span>PRODUCT STRATEGY 2026</span><h3>다음 성장을 만드는<br />세 가지 선택</h3><p>고객 가치 중심의 실행으로 지속 가능한 성장을 가속화합니다.</p><div><strong>+15%</strong><strong>+30%</strong><strong>2</strong></div></div><footer><IconFileText size={17} /><span>복원하면 현재 덱은 새 snapshot으로 보존되고, 선택한 버전이 새 현재 버전이 됩니다.</span></footer></section>
      </div>
      <OrbitDialog description={`버전 ${snapshot.version}의 내용으로 현재 덱을 복원합니다.`} footer={<><OrbitButton onClick={() => setConfirming(false)} variant="secondary">취소</OrbitButton><OrbitButton onClick={() => { setConfirming(false); setRestored(true); }}>복원하기</OrbitButton></>} onClose={() => setConfirming(false)} open={confirming} title="이 버전을 복원할까요?"><p className="version-dialog-note">현재 작업은 사라지지 않고 복원 직전 버전으로 자동 저장됩니다.</p></OrbitDialog>
    </MockupPage>
  );
}

function MockupPage(props: MockupNavigateProps & { children: ReactNode }) {
  return <div className="orbit-mockup orbit-gap-mockup"><MockupHeader mode="app" onLogoClick={() => props.onNavigate("/mockup/catalog")} /><main>{props.children}</main></div>;
}

function GapBreadcrumb(props: { current: string; onBack: () => void }) {
  return <nav className="gap-breadcrumb" aria-label="목업 breadcrumb"><button onClick={props.onBack} type="button"><IconArrowLeft size={17} /> 목업 맵</button><span>/</span><strong>{props.current}</strong></nav>;
}

function BriefChoice(props: { label: string; onSelect: (value: string) => void; options: string[]; selected: string }) {
  return <fieldset className="brief-choice"><legend>{props.label}</legend><div>{props.options.map((option) => <button aria-pressed={props.selected === option} key={option} onClick={() => props.onSelect(option)} type="button">{props.selected === option ? <IconCheck size={15} /> : null}{option}</button>)}</div></fieldset>;
}
