import {
  IconArrowLeft,
  IconArrowRight,
  IconCheck,
  IconChevronLeft,
  IconChevronRight,
  IconClock,
  IconFileImport,
  IconFileText,
  IconFlag,
  IconLayoutGrid,
  IconLink,
  IconListCheck,
  IconLock,
  IconMicrophoneOff,
  IconPlayerPause,
  IconPlayerPlay,
  IconRefresh,
  IconScreenShare,
  IconSparkles,
  IconTarget,
  IconTemplate,
  IconUsers
} from "@tabler/icons-react";
import { useEffect, useState, type ReactNode } from "react";
import {
  OrbitButton,
  OrbitInput,
  OrbitSelect,
  OrbitStatus,
  OrbitTextarea
} from "../../design-system";
import orbitLogo from "./assets/orbit-logo-selected.png";
import orbitLogoWhite from "../../assets/orbit-logo-white.png";
import { MockupHeader } from "./OrbitMockupHeader";
import "./orbit-connected-journey.css";

export type ConnectedJourneyStage = "prepare" | "edit" | "practice" | "rehearse" | "present" | "reflect";

type JourneyProps = {
  onNavigate: (path: string) => void;
};

const connectedJourneyStages: Array<{
  id: ConnectedJourneyStage;
  label: string;
  path: string;
}> = [
  { id: "prepare", label: "목적·자료", path: "/mockup/brief" },
  { id: "edit", label: "구조·편집", path: "/mockup/editor" },
  { id: "practice", label: "작은 연습", path: "/mockup/safe-start" },
  { id: "rehearse", label: "전체 확인", path: "/mockup/rehearsal" },
  { id: "present", label: "발표", path: "/mockup/live-presenter" },
  { id: "reflect", label: "회고", path: "/mockup/journey-complete" }
];

export function OrbitConnectedJourneyShell(props: JourneyProps & {
  activeNav?: "홈" | "프로젝트" | "리허설" | "리포트";
  children: ReactNode;
  stage?: ConnectedJourneyStage;
}) {
  const activeIndex = props.stage
    ? connectedJourneyStages.findIndex((stage) => stage.id === props.stage)
    : -1;

  useEffect(() => {
    window.scrollTo({ behavior: "auto", top: 0 });
  }, [props.stage]);

  return (
    <div className="orbit-mockup connected-journey-shell">
      <MockupHeader
        activeAppItem={props.activeNav ?? "홈"}
        mode="app"
        onAppNavigate={(item) => {
          if (item === "홈" || item === "프로젝트") props.onNavigate("/mockup/home");
          if (item === "리허설") props.onNavigate("/mockup/safe-start");
          if (item === "리포트") props.onNavigate("/mockup/report");
        }}
        onLogoClick={() => props.onNavigate("/mockup/home")}
      />
      {props.stage ? (
        <nav aria-label="발표 준비 단계" className="connected-journey-rail">
          <div>
            <span className="connected-journey-project">첫 업무 성과 보고</span>
            <ol>
              {connectedJourneyStages.map((stage, index) => {
                const state = index < activeIndex ? "complete" : index === activeIndex ? "current" : "upcoming";
                return (
                  <li className={state} key={stage.id}>
                    <button
                      aria-current={state === "current" ? "step" : undefined}
                      onClick={() => props.onNavigate(stage.path)}
                      type="button"
                    >
                      <span>{state === "complete" ? <IconCheck size={13} /> : index + 1}</span>
                      {stage.label}
                    </button>
                  </li>
                );
              })}
            </ol>
          </div>
        </nav>
      ) : null}
      <main>{props.children}</main>
    </div>
  );
}

export function OrbitJourneyHomeMockup(props: JourneyProps) {
  return (
    <OrbitConnectedJourneyShell onNavigate={props.onNavigate}>
      <section className="connected-home-hero">
        <div>
          <p className="orbit-ds-eyebrow">TODAY'S NEXT STEP</p>
          <h1>발표 준비,<br />지금 할 일부터 이어가세요.</h1>
          <p>기능을 찾지 않아도 괜찮아요. ORBIT이 현재 상태에 맞는 다음 행동 하나를 안내합니다.</p>
        </div>
        <aside>
          <span><IconClock size={18} /> 발표까지 3일</span>
          <strong>첫 업무 성과 보고</strong>
          <p>청중과 결론을 정하면 발표 구조를 바로 확인할 수 있어요.</p>
          <div className="connected-home-progress"><i><b /></i><span>전체 여정 1 / 6</span></div>
          <OrbitButton icon={<IconArrowRight size={18} />} onClick={() => props.onNavigate("/mockup/brief")}>이 발표 준비 시작</OrbitButton>
        </aside>
      </section>

      <section className="connected-home-next">
        <header>
          <div><p className="orbit-ds-eyebrow">ONE THING AT A TIME</p><h2>오늘은 세 가지만 정하면 돼요.</h2></div>
          <button onClick={() => props.onNavigate("/mockup/journey")} type="button">전체 흐름 보기 <IconArrowRight size={17} /></button>
        </header>
        <div>
          <article><span>01</span><IconUsers size={23} /><h3>누구에게</h3><p>팀장과 제품 책임자</p></article>
          <article><span>02</span><IconTarget size={23} /><h3>무엇을 남길지</h3><p>이번 분기 성과와 다음 행동</p></article>
          <article><span>03</span><IconClock size={23} /><h3>얼마나 말할지</h3><p>10분 · 12장 내외</p></article>
        </div>
      </section>

      <section className="connected-home-start">
        <button className="lime" onClick={() => props.onNavigate("/mockup/brief")} type="button"><IconTemplate size={27} /><span><strong>구조부터 시작</strong><small>질문에 답하며 발표 목적을 정해요.</small></span><IconArrowRight size={20} /></button>
        <button className="cream" onClick={() => props.onNavigate("/mockup/brief")} type="button"><IconFileImport size={27} /><span><strong>기존 자료로 시작</strong><small>PPTX·PDF의 내용을 살려 이어가요.</small></span><IconArrowRight size={20} /></button>
        <button className="lilac" onClick={() => props.onNavigate("/mockup/safe-start")} type="button"><IconMicrophoneOff size={27} /><span><strong>발표가 먼저 막막해요</strong><small>자료 수정 없이 60초부터 말해봐요.</small></span><IconArrowRight size={20} /></button>
      </section>
    </OrbitConnectedJourneyShell>
  );
}

type StartSource = "outline" | "file" | "existing";

export function OrbitJourneySetupMockup(props: JourneyProps) {
  const [source, setSource] = useState<StartSource>("file");
  const [fileAdded, setFileAdded] = useState(false);

  return (
    <OrbitConnectedJourneyShell activeNav="프로젝트" onNavigate={props.onNavigate} stage="prepare">
      <JourneyBack onClick={() => props.onNavigate("/mockup/home")}>홈으로</JourneyBack>
      <section className="connected-page-heading">
        <div><p className="orbit-ds-eyebrow">STEP 1 · PURPOSE & SOURCE</p><h1>누구에게 무엇을 남길지<br />먼저 정해요.</h1><p>완벽한 문장보다 청중, 결론, 발표 시간만 있으면 충분합니다.</p></div>
        <OrbitStatus tone="lilac">자동 저장됨</OrbitStatus>
      </section>

      <div className="connected-setup-layout">
        <section className="connected-form-panel">
          <header><span>1</span><div><h2>발표 목적</h2><p>AI가 구성과 연습 기준을 제안할 때 사용해요.</p></div></header>
          <div className="connected-form-grid">
            <label><span>발표 제목</span><OrbitInput defaultValue="첫 업무 성과 보고" /></label>
            <label><span>발표 시간</span><OrbitSelect defaultValue="10"><option value="5">5분</option><option value="10">10분</option><option value="15">15분</option></OrbitSelect></label>
            <label><span>주요 청중</span><OrbitInput defaultValue="팀장, 제품 책임자" /></label>
            <label><span>발표에서 얻고 싶은 결과</span><OrbitInput defaultValue="다음 분기 실행안 승인" /></label>
          </div>
          <label className="connected-full-field"><span>꼭 전달할 결론</span><OrbitTextarea defaultValue="고객 온보딩을 개선해 첫 성과 확인 시간을 줄였고, 다음 분기에는 활성화 구간을 확장합니다." rows={4} /></label>
        </section>

        <aside className="connected-source-panel">
          <header><span>2</span><div><h2>시작 자료</h2><p>내용을 새로 만들거나 기존 자료를 살릴 수 있어요.</p></div></header>
          <div aria-label="시작 자료 선택" className="connected-source-options" role="radiogroup">
            <SourceOption active={source === "outline"} icon={<IconSparkles size={21} />} label="목적만으로 초안 만들기" onClick={() => setSource("outline")} />
            <SourceOption active={source === "file"} icon={<IconFileImport size={21} />} label="PPTX·PDF 가져오기" onClick={() => setSource("file")} />
            <SourceOption active={source === "existing"} icon={<IconLayoutGrid size={21} />} label="기존 ORBIT 프로젝트" onClick={() => setSource("existing")} />
          </div>
          {source === "file" ? (
            <button className={`connected-upload${fileAdded ? " added" : ""}`} onClick={() => setFileAdded(true)} type="button">
              {fileAdded ? <IconCheck size={24} /> : <IconFileText size={25} />}
              <strong>{fileAdded ? "성과보고_초안.pptx" : "자료를 선택하세요"}</strong>
              <small>{fileAdded ? "14장 · 내용을 확인할 준비가 됐어요." : "PPTX, PDF · 최대 50MB"}</small>
            </button>
          ) : (
            <div className="connected-source-note"><IconListCheck size={23} /><strong>{source === "outline" ? "5개 장표의 기본 구조를 제안해요." : "최근 프로젝트의 구조와 디자인을 이어가요."}</strong><p>다음 화면에서 구성과 근거를 먼저 확인할 수 있습니다.</p></div>
          )}
          <OrbitButton icon={<IconArrowRight size={18} />} onClick={() => props.onNavigate("/mockup/editor")}>발표 구조 확인하기</OrbitButton>
          <p className="connected-privacy-copy"><IconLock size={16} /> 추가한 자료는 이 프로젝트 구성에만 사용돼요.</p>
        </aside>
      </div>
    </OrbitConnectedJourneyShell>
  );
}

export function OrbitJourneyReviewMockup(props: JourneyProps) {
  const [activeSlide, setActiveSlide] = useState(0);
  const slides = ["결론 먼저", "이번 분기 변화", "고객이 얻은 성과", "배운 점", "다음 행동"];

  return (
    <OrbitConnectedJourneyShell activeNav="프로젝트" onNavigate={props.onNavigate} stage="edit">
      <JourneyBack onClick={() => props.onNavigate("/mockup/brief")}>목적·자료 수정</JourneyBack>
      <section className="connected-page-heading review-heading">
        <div><p className="orbit-ds-eyebrow">STEP 2 · STORY REVIEW</p><h1>구조와 핵심 메시지만<br />먼저 확인하세요.</h1><p>디자인을 다듬기 전에 결론, 근거, 다음 행동이 이어지는지 점검합니다.</p></div>
        <div className="connected-heading-actions"><OrbitButton onClick={() => props.onNavigate("/mockup/safe-start")}>작은 연습으로 넘어가기 <IconArrowRight size={18} /></OrbitButton></div>
      </section>

      <div className="connected-review-workspace">
        <aside className="connected-outline-panel">
          <header><h2>발표 흐름</h2><OrbitStatus tone="success">구성 준비됨</OrbitStatus></header>
          <ol>
            {slides.map((slide, index) => (
              <li className={activeSlide === index ? "active" : ""} key={slide}>
                <button onClick={() => setActiveSlide(index)} type="button"><span>{index + 1}</span><strong>{slide}</strong><IconChevronRight size={16} /></button>
              </li>
            ))}
          </ol>
          <button className="connected-quiet-button" type="button">+ 장표 추가</button>
        </aside>

        <section className="connected-slide-stage">
          <header><span>슬라이드 {activeSlide + 1} / {slides.length}</span><span>마지막 저장 방금 전</span></header>
          <div className="connected-slide-canvas">
            <img alt="ORBIT" src={orbitLogo} />
            <div><small>FIRST BUSINESS UPDATE</small><h2>{slides[activeSlide]}</h2><p>{activeSlide === 0 ? "고객이 첫 성과를 확인하는 시간을 32% 줄였습니다." : activeSlide === 4 ? "다음 분기에는 활성화 경험을 모든 신규 고객으로 확장합니다." : "핵심 수치와 근거를 한 문장으로 설명합니다."}</p></div>
            <footer>2026.07.15 · ORBIT 제품팀</footer>
          </div>
          <div className="connected-slide-message"><IconTarget size={19} /><span><strong>이 장표에서 꼭 말할 내용</strong><small>결론을 먼저 말한 뒤 수치와 다음 행동을 연결하세요.</small></span></div>
        </section>

        <aside className="connected-readiness-panel">
          <p className="orbit-ds-eyebrow">READY TO PRACTICE</p>
          <h2>연습에 필요한 내용은 준비됐어요.</h2>
          <div>
            <CheckRow label="청중과 원하는 결과" value="팀장 · 실행안 승인" />
            <CheckRow label="핵심 결론" value="첫 성과 시간 32% 단축" />
            <CheckRow label="발표 시간" value="10분 · 5개 핵심 장표" />
          </div>
          <article><IconSparkles size={20} /><strong>첫 연습 제안</strong><p>전체 발표보다 도입부 60초를 먼저 말하면 부담이 적어요.</p></article>
          <OrbitButton icon={<IconPlayerPlay size={18} />} onClick={() => props.onNavigate("/mockup/safe-start")}>60초 연습 준비</OrbitButton>
          <button className="connected-quiet-button" type="button">편집을 조금 더 할게요</button>
        </aside>
      </div>
    </OrbitConnectedJourneyShell>
  );
}

type RehearsalPhase = "ready" | "running" | "paused";

export function OrbitJourneyRehearsalMockup(props: JourneyProps) {
  const [phase, setPhase] = useState<RehearsalPhase>("ready");
  const [seconds, setSeconds] = useState(0);

  useEffect(() => {
    if (phase !== "running") return undefined;
    const interval = window.setInterval(() => setSeconds((value) => value + 1), 1000);
    return () => window.clearInterval(interval);
  }, [phase]);

  const minutes = String(Math.floor(seconds / 60)).padStart(2, "0");
  const remainder = String(seconds % 60).padStart(2, "0");

  return (
    <OrbitConnectedJourneyShell activeNav="리허설" onNavigate={props.onNavigate} stage="rehearse">
      <JourneyBack onClick={() => props.onNavigate("/mockup/safe-feedback")}>작은 연습 결과</JourneyBack>
      <section className="connected-page-heading rehearsal-heading">
        <div><p className="orbit-ds-eyebrow">STEP 4 · FULL REHEARSAL</p><h1>이번에는 처음부터 끝까지<br />흐름만 확인해요.</h1><p>새로운 점수를 매기지 않고 시간과 핵심 메시지만 점검합니다.</p></div>
        <OrbitStatus tone={phase === "running" ? "success" : "lilac"}>{phase === "running" ? "리허설 중" : "준비 완료"}</OrbitStatus>
      </section>

      <div className="connected-rehearsal-layout">
        <section className="connected-rehearsal-stage">
          <div className="connected-slide-canvas rehearsal-slide"><img alt="ORBIT" src={orbitLogo} /><div><small>FIRST BUSINESS UPDATE</small><h2>첫 업무 성과 보고</h2><p>고객이 더 빠르게 성과를 확인할 수 있도록</p></div><footer>1 / 5 · 도입부</footer></div>
          <div className="connected-rehearsal-script"><span>현재 말할 내용</span><strong>“이번 보고의 결론은 고객이 첫 성과를 확인하는 시간을 줄였다는 점입니다.”</strong><p>막히면 그대로 읽어도 괜찮아요. 다음 장표는 직접 넘길 수 있습니다.</p></div>
        </section>
        <aside className="connected-rehearsal-console">
          <header><span className={phase === "running" ? "live" : ""} /><strong>{phase === "running" ? "흐름 확인 중" : phase === "paused" ? "잠시 멈춤" : "시작 전"}</strong><OrbitStatus tone="neutral">나만 보기</OrbitStatus></header>
          <div className="connected-rehearsal-time"><small>진행 시간</small><strong>{minutes}:{remainder}</strong><span>/ 10:00</span></div>
          <progress aria-label="전체 리허설 진행률" max="600" value={seconds} />
          <OrbitButton icon={phase === "running" ? <IconPlayerPause size={18} /> : <IconPlayerPlay size={18} />} onClick={() => setPhase((value) => value === "running" ? "paused" : "running")}>{phase === "running" ? "잠시 멈추기" : seconds ? "계속하기" : "전체 리허설 시작"}</OrbitButton>
          <div className="connected-rehearsal-checks"><CheckRow label="마이크" value="연결됨" /><CheckRow label="화면 진행" value="수동" /><CheckRow label="음성 분석" value="사용 안 함" /></div>
          <article><IconFlag size={20} /><strong>이번 확인 목표</strong><p>결론 → 성과 근거 → 다음 행동의 순서를 끝까지 유지하기</p></article>
          <button className="connected-finish-link" onClick={() => props.onNavigate("/mockup/report")} type="button">리허설 마치고 다음 행동 보기 <IconArrowRight size={18} /></button>
        </aside>
      </div>
    </OrbitConnectedJourneyShell>
  );
}

export function OrbitJourneyReportMockup(props: JourneyProps) {
  return (
    <OrbitConnectedJourneyShell activeNav="리포트" onNavigate={props.onNavigate} stage="rehearse">
      <JourneyBack onClick={() => props.onNavigate("/mockup/rehearsal")}>전체 리허설</JourneyBack>
      <section className="connected-report-hero">
        <span><IconCheck size={29} /></span>
        <div><p className="orbit-ds-eyebrow">FULL FLOW COMPLETE</p><h1>전체 흐름을 확인했어요.</h1><p>비교나 순위 대신, 발표 전에 바꿀 행동 하나만 남겼습니다.</p></div>
        <OrbitStatus tone="success">발표 준비 가능</OrbitStatus>
      </section>
      <div className="connected-report-layout">
        <section>
          <article className="connected-report-strength"><span><IconSparkles size={19} /> 이번에 잘한 점</span><h2>결론과 고객 성과를 앞부분에서 분명하게 전달했어요.</h2><p>도입부에서 발표 목적이 드러나 청중이 이후 내용을 따라가기 쉬운 흐름이었습니다.</p></article>
          <article className="connected-report-action"><span>발표 전 바꿀 행동 한 가지</span><h2>마지막 장표에서 요청할 행동을 한 문장으로 말하세요.</h2><p>“다음 분기 활성화 실험을 승인해 주세요”라고 마무리하면 발표의 목적이 더 선명해집니다.</p></article>
          <div className="connected-report-choices">
            <button onClick={() => props.onNavigate("/mockup/safe-start")} type="button"><IconRefresh size={21} /><span><strong>60초만 더 연습</strong><small>마무리 문장만 짧게 반복하기</small></span><IconChevronRight size={18} /></button>
            <button onClick={() => props.onNavigate("/mockup/live-presenter")} type="button"><IconScreenShare size={21} /><span><strong>발표 화면 준비</strong><small>화면과 청중 연결을 확인하기</small></span><IconChevronRight size={18} /></button>
          </div>
        </section>
        <aside className="connected-ready-summary">
          <p className="orbit-ds-eyebrow">READY CHECK</p><h2>이제 발표로 이동해도 괜찮아요.</h2>
          <CheckRow label="목표 시간" value="10분 안에 완료" />
          <CheckRow label="핵심 메시지" value="모두 전달" />
          <CheckRow label="취약 구간" value="마무리 1개" />
          <p><IconLock size={16} /> 이 결과는 현재 나에게만 보입니다.</p>
          <OrbitButton icon={<IconArrowRight size={18} />} onClick={() => props.onNavigate("/mockup/live-presenter")}>발표 준비로 이동</OrbitButton>
        </aside>
      </div>
    </OrbitConnectedJourneyShell>
  );
}

type LivePhase = "ready" | "live";

export function OrbitJourneyPresenterMockup(props: JourneyProps) {
  const [phase, setPhase] = useState<LivePhase>("ready");
  const [slide, setSlide] = useState(1);
  const [seconds, setSeconds] = useState(0);

  useEffect(() => {
    if (phase !== "live") return undefined;
    const interval = window.setInterval(() => setSeconds((value) => value + 1), 1000);
    return () => window.clearInterval(interval);
  }, [phase]);

  if (phase === "live") {
    return (
      <div className="connected-live-mode">
        <header><img alt="ORBIT" src={orbitLogoWhite} /><span><i /> 발표 화면 연결됨</span><strong>{String(Math.floor(seconds / 60)).padStart(2, "0")}:{String(seconds % 60).padStart(2, "0")}</strong><button onClick={() => props.onNavigate("/mockup/journey-complete")} type="button">발표 종료</button></header>
        <main>
          <section><div className="connected-live-slide"><small>FIRST BUSINESS UPDATE</small><h1>{slide === 1 ? "첫 업무 성과 보고" : slide === 5 ? "다음 분기 실행안" : "고객이 얻은 성과"}</h1><p>{slide === 1 ? "고객이 더 빠르게 성과를 확인할 수 있도록" : slide === 5 ? "활성화 경험을 모든 신규 고객으로 확장합니다." : "첫 성과 확인 시간을 32% 줄였습니다."}</p></div></section>
          <aside><span>발표 메모</span><h2>{slide === 1 ? "결론을 먼저 말하고 2초 쉬기" : slide === 5 ? "승인 요청을 한 문장으로 마무리" : "수치의 비교 기간을 천천히 설명"}</h2><p>실전 발표에서는 새로운 피드백이나 평가를 보여주지 않습니다.</p><div><small>현재 장표</small><strong>{slide} / 5</strong></div></aside>
        </main>
        <footer><button aria-label="이전 장표" disabled={slide === 1} onClick={() => setSlide((value) => Math.max(1, value - 1))} type="button"><IconChevronLeft size={22} /></button><span>{slide} / 5</span><button aria-label="다음 장표" disabled={slide === 5} onClick={() => setSlide((value) => Math.min(5, value + 1))} type="button"><IconChevronRight size={22} /></button></footer>
      </div>
    );
  }

  return (
    <OrbitConnectedJourneyShell activeNav="리허설" onNavigate={props.onNavigate} stage="present">
      <JourneyBack onClick={() => props.onNavigate("/mockup/report")}>전체 확인 결과</JourneyBack>
      <section className="connected-page-heading presenter-ready-heading"><div><p className="orbit-ds-eyebrow">STEP 5 · PRESENT</p><h1>평가 없이 발표에만<br />집중할 준비를 해요.</h1><p>화면과 청중 연결만 확인하면 실전 발표를 시작할 수 있습니다.</p></div><OrbitStatus tone="success">발표 준비됨</OrbitStatus></section>
      <div className="connected-presenter-ready">
        <section><div className="connected-slide-canvas"><img alt="ORBIT" src={orbitLogo} /><div><small>FIRST BUSINESS UPDATE</small><h2>첫 업무 성과 보고</h2><p>고객이 더 빠르게 성과를 확인할 수 있도록</p></div><footer>5개 핵심 장표 · 10분</footer></div></section>
        <aside><p className="orbit-ds-eyebrow">FINAL CHECK</p><h2>실전 화면 점검</h2><div><CheckRow label="발표자 화면" value="이 화면" /><CheckRow label="청중 화면" value="연결됨" /><CheckRow label="화면 진행" value="직접 넘기기" /></div><article><IconLink size={20} /><span><strong>청중 입장 링크</strong><small>orbit.live/2741 · 비밀번호 2741</small></span></article><OrbitButton icon={<IconScreenShare size={18} />} onClick={() => setPhase("live")}>발표 시작</OrbitButton><p><IconMicrophoneOff size={16} /> 실전 중에는 녹음과 AI 코칭이 꺼집니다.</p></aside>
      </div>
    </OrbitConnectedJourneyShell>
  );
}

export function OrbitJourneyCompleteMockup(props: JourneyProps) {
  const [feeling, setFeeling] = useState("편안했어요");
  return (
    <OrbitConnectedJourneyShell activeNav="리포트" onNavigate={props.onNavigate} stage="reflect">
      <section className="connected-complete-hero"><span><IconCheck size={34} /></span><p className="orbit-ds-eyebrow">PRESENTATION COMPLETE</p><h1>발표를 마쳤어요.</h1><p>잘했는지 평가하기보다, 다음 발표에 남길 경험 하나를 정리해요.</p></section>
      <div className="connected-complete-layout">
        <section><header><h2>오늘 해낸 것</h2><OrbitStatus tone="success">완료</OrbitStatus></header><div className="connected-complete-stats"><article><small>발표 시간</small><strong>09:42</strong><span>목표 10분 안</span></article><article><small>전달한 흐름</small><strong>5 / 5</strong><span>핵심 장표 완료</span></article><article><small>다음에 이어갈 것</small><strong>1개</strong><span>마무리 요청 문장</span></article></div><article className="connected-complete-note"><IconSparkles size={21} /><div><strong>다음 발표에도 이어갈 점</strong><p>첫 문장에서 결론을 말한 뒤 잠시 쉬는 방식이 편안했습니다.</p></div></article></section>
        <aside><p className="orbit-ds-eyebrow">PERSONAL NOTE</p><h2>오늘 발표는 어땠나요?</h2><p>이 기록은 나만 보고, 다음 연습의 시작 강도를 조정하는 데 사용합니다.</p><div aria-label="발표 체감 선택" role="radiogroup">{["편안했어요", "할 만했어요", "어려웠어요"].map((item) => <button aria-checked={feeling === item} className={feeling === item ? "selected" : ""} key={item} onClick={() => setFeeling(item)} role="radio" type="button"><span>{feeling === item ? <IconCheck size={14} /> : null}</span>{item}</button>)}</div><p className="connected-complete-private"><IconLock size={16} /> 개인 회고는 팀에 공유되지 않아요.</p><OrbitButton icon={<IconArrowRight size={18} />} onClick={() => props.onNavigate("/mockup/home")}>홈으로 돌아가기</OrbitButton></aside>
      </div>
    </OrbitConnectedJourneyShell>
  );
}

function JourneyBack(props: { children: ReactNode; onClick: () => void }) {
  return <button className="connected-back" onClick={props.onClick} type="button"><IconArrowLeft size={17} />{props.children}</button>;
}

function SourceOption(props: { active: boolean; icon: ReactNode; label: string; onClick: () => void }) {
  return <button aria-checked={props.active} className={props.active ? "selected" : ""} onClick={props.onClick} role="radio" type="button"><span>{props.active ? <IconCheck size={13} /> : null}</span>{props.icon}<strong>{props.label}</strong></button>;
}

function CheckRow(props: { label: string; value: string }) {
  return <div className="connected-check-row"><span><IconCheck size={14} /></span><div><strong>{props.label}</strong><small>{props.value}</small></div></div>;
}
