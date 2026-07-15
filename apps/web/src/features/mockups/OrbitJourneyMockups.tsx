import {
  IconArrowLeft,
  IconArrowRight,
  IconCheck,
  IconChevronRight,
  IconClock,
  IconFlag,
  IconHourglass,
  IconInfoCircle,
  IconLock,
  IconMicrophone,
  IconMicrophoneOff,
  IconPlayerPause,
  IconPlayerPlay,
  IconPresentation,
  IconRefresh,
  IconShare,
  IconShieldCheck,
  IconSparkles,
  IconTarget,
  IconTrash
} from "@tabler/icons-react";
import { useEffect, useState, type ReactNode } from "react";
import { OrbitButton, OrbitDialog, OrbitStatus } from "../../design-system";
import orbitLogo from "./assets/orbit-logo-selected.png";
import { OrbitConnectedJourneyShell, type ConnectedJourneyStage } from "./OrbitConnectedJourneyMockups";
import "./orbit-journey-mockups.css";

type JourneyMockupProps = {
  onNavigate: (path: string) => void;
};

type PracticeMode = "voice" | "no-analysis" | "timer";
type PracticePhase = "ready" | "running" | "paused";
type PrivacyChoice = "deleted" | "private" | "shared";

const journeySections = [
  {
    description: "목적과 발표 시간을 정하고, 기존 자료 또는 AI 초안으로 시작합니다.",
    pages: [
      ["발표 브리프", "/mockup/brief"],
      ["AI 발표자료 만들기", "/mockup/create"],
      ["에디터", "/mockup/editor"]
    ],
    title: "자료 준비"
  },
  {
    description: "음성 분석과 개인정보 범위를 고른 뒤, 60초만 가볍게 말해봅니다.",
    pages: [
      ["내 속도 설정", "/mockup/safe-start"],
      ["60초 안심 연습", "/mockup/safe-practice"],
      ["작은 연습 피드백", "/mockup/safe-feedback"]
    ],
    title: "부담 없는 첫 연습"
  },
  {
    description: "준비가 되면 마이크를 확인하고 처음부터 끝까지 흐름을 점검합니다.",
    pages: [
      ["리허설 준비", "/mockup/microphone-check"],
      ["전체 리허설", "/mockup/rehearsal"],
      ["리허설 완료", "/mockup/rehearsal-complete"]
    ],
    title: "전체 흐름 확인"
  },
  {
    description: "점수보다 다음 행동을 확인하고, 필요한 구간이나 예상 질문만 연습합니다.",
    pages: [
      ["행동 리포트", "/mockup/report"],
      ["연습 계획", "/mockup/practice-plan"],
      ["집중 연습", "/mockup/focused-practice"],
      ["도전 Q&A", "/mockup/challenge-qna"]
    ],
    title: "다음 행동 선택"
  },
  {
    description: "발표자 화면과 청중 화면을 점검하고, 새로운 피드백 없이 발표에 집중합니다.",
    pages: [
      ["발표자 화면", "/mockup/live-presenter"],
      ["청중 화면", "/mockup/live"],
      ["청중 입장", "/mockup/audience"],
      ["발표 회고", "/mockup/journey-complete"]
    ],
    title: "발표"
  }
] as const;

export function OrbitJourneyMapMockup(props: JourneyMockupProps) {
  return (
    <JourneyPage onNavigate={props.onNavigate}>
      <section className="journey-map-heading">
        <div>
          <p className="orbit-ds-eyebrow">USER JOURNEY MOCKUP</p>
          <h1>발표 준비부터 실전까지,<br />필요한 순간만 이어가세요.</h1>
          <p>모든 기능을 거치지 않아도 괜찮아요. 지금 상태에 맞는 화면부터 확인할 수 있습니다.</p>
        </div>
        <OrbitButton icon={<IconPlayerPlay size={18} />} onClick={() => props.onNavigate("/mockup/home")}>
          홈에서 여정 시작
        </OrbitButton>
      </section>

      <section className="journey-map-list" aria-label="ORBIT 사용자 여정 화면">
        {journeySections.map((section, index) => (
          <article key={section.title}>
            <span>{String(index + 1).padStart(2, "0")}</span>
            <div>
              <h2>{section.title}</h2>
              <p>{section.description}</p>
            </div>
            <nav aria-label={`${section.title} 화면`}>
              {section.pages.map(([label, path]) => (
                <button key={path} onClick={() => props.onNavigate(path)} type="button">
                  {label}<IconChevronRight size={17} />
                </button>
              ))}
            </nav>
          </article>
        ))}
      </section>
    </JourneyPage>
  );
}

const practiceModeOptions: Array<{
  description: string;
  icon: ReactNode;
  id: PracticeMode;
  label: string;
}> = [
  {
    description: "핵심 메시지와 시간을 분석해 다음 행동을 제안해요.",
    icon: <IconMicrophone size={21} />,
    id: "voice",
    label: "음성 분석과 함께"
  },
  {
    description: "녹음과 분석 없이 자유롭게 말해요.",
    icon: <IconMicrophoneOff size={21} />,
    id: "no-analysis",
    label: "음성 분석 없이"
  },
  {
    description: "시간과 장표만 보면서 스스로 연습해요.",
    icon: <IconClock size={21} />,
    id: "timer",
    label: "타이머만 사용"
  }
];

export function OrbitSafeStartMockup(props: JourneyMockupProps) {
  const [mode, setMode] = useState<PracticeMode>("no-analysis");
  const [excludeLongPauses, setExcludeLongPauses] = useState(true);
  const [privateResult, setPrivateResult] = useState(true);

  function startPractice() {
    if (mode === "voice") {
      props.onNavigate("/mockup/microphone-check");
      return;
    }
    props.onNavigate("/mockup/safe-practice");
  }

  return (
    <JourneyPage activeNav="리허설" onNavigate={props.onNavigate} stage="practice">
      <JourneyBreadcrumb label="첫 업무 성과 보고" onBack={() => props.onNavigate("/mockup/editor")} />
      <div className="safe-start-layout">
        <section className="safe-start-preview">
          <p className="orbit-ds-eyebrow">60-SECOND PRACTICE</p>
          <h1>오늘은 도입부만 연습해요.</h1>
          <p>첫 60초에 집중해 부담 없이 시작해 보세요.</p>
          <JourneySlidePreview />
          <div className="journey-keywords" aria-label="도입부 핵심 키워드">
            <span><IconShieldCheck size={17} /> 고객이 얻을 변화</span>
            <span><IconTarget size={17} /> 이번 보고의 결론</span>
            <span><IconSparkles size={17} /> 다음 행동</span>
          </div>
        </section>

        <aside className="safe-start-controls">
          <header>
            <p className="orbit-ds-eyebrow">PRACTICE CONTROL</p>
            <h2>내 속도로 시작하기</h2>
            <p>원하는 연습 방식을 고르고 편하게 시작해 보세요.</p>
          </header>

          <div className="safe-mode-options" role="radiogroup" aria-label="연습 방식">
            {practiceModeOptions.map((option) => (
              <button
                aria-checked={mode === option.id}
                className={mode === option.id ? "selected" : ""}
                key={option.id}
                onClick={() => setMode(option.id)}
                role="radio"
                type="button"
              >
                <span className="safe-mode-radio">{mode === option.id ? <IconCheck size={14} /> : null}</span>
                <span className="safe-mode-icon">{option.icon}</span>
                <span><strong>{option.label}</strong><small>{option.description}</small></span>
              </button>
            ))}
          </div>

          <div className="safe-preference-list">
            <ToggleRow
              active={excludeLongPauses}
              description="생각을 정리하는 멈춤은 피드백에 반영하지 않아요."
              icon={<IconHourglass size={21} />}
              label="긴 멈춤은 평가하지 않기"
              onToggle={() => setExcludeLongPauses((value) => !value)}
            />
            <ToggleRow
              active={privateResult}
              description="녹음과 피드백은 다른 팀원에게 자동 공유되지 않아요."
              icon={<IconLock size={21} />}
              label="연습 결과는 나만 보기"
              onToggle={() => setPrivateResult((value) => !value)}
            />
          </div>

          <OrbitButton icon={<IconPlayerPlay size={18} />} onClick={startPractice}>
            {mode === "voice" ? "마이크 확인하고 시작" : "60초 도입부 연습 시작"}
          </OrbitButton>
          <button className="journey-quiet-action" onClick={() => props.onNavigate("/mockup/microphone-check")} type="button">
            <IconPresentation size={18} /> 전체 발표로 변경
          </button>
          <p className="safe-recognition-note"><IconInfoCircle size={17} /> 음성 인식이 불확실한 구간은 나중에 평가에서 제외할 수 있어요.</p>
        </aside>
      </div>
    </JourneyPage>
  );
}

export function OrbitSafePracticeMockup(props: JourneyMockupProps) {
  const [phase, setPhase] = useState<PracticePhase>("ready");
  const [seconds, setSeconds] = useState(0);

  useEffect(() => {
    if (phase !== "running") return undefined;
    const interval = window.setInterval(() => {
      setSeconds((value) => {
        if (value >= 59) {
          window.clearInterval(interval);
          setPhase("paused");
          return 60;
        }
        return value + 1;
      });
    }, 1000);
    return () => window.clearInterval(interval);
  }, [phase]);

  const time = `00:${String(seconds).padStart(2, "0")}`;

  function resetPractice() {
    setPhase("ready");
    setSeconds(0);
  }

  return (
    <JourneyPage activeNav="리허설" onNavigate={props.onNavigate} stage="practice">
      <JourneyBreadcrumb label="도입부 60초" onBack={() => props.onNavigate("/mockup/safe-start")} />
      <section className="safe-practice-heading">
        <div><p className="orbit-ds-eyebrow">SAFE PRACTICE</p><h1>첫 문장은 결론부터 말해보세요.</h1><p>완벽하게 말하지 않아도 괜찮아요. 막히면 핵심 단어를 보고 다시 이어가면 됩니다.</p></div>
        <OrbitStatus tone="lilac">나만 보는 연습</OrbitStatus>
      </section>

      <div className="safe-practice-layout">
        <section className="safe-practice-stage">
          <JourneySlidePreview compact />
          <div className="safe-prompt-line">
            <span>첫 문장 제안</span>
            <strong>“이번 보고의 결론은 고객이 더 빠르게 성과를 확인할 수 있다는 점입니다.”</strong>
          </div>
          <div className="journey-keywords" aria-label="말할 핵심 단어">
            <span>결론</span><span>고객 변화</span><span>다음 행동</span>
          </div>
        </section>

        <aside className="safe-practice-console">
          <header><span className={phase === "running" ? "running" : ""} /><strong>{phase === "running" ? "연습 중" : phase === "paused" ? "잠시 멈춤" : "준비됨"}</strong><OrbitStatus tone="neutral">음성 분석 없음</OrbitStatus></header>
          <div className="safe-practice-timer"><small>진행 시간</small><strong>{time}</strong><span>/ 01:00</span></div>
          <progress aria-label="60초 연습 진행률" max="60" value={seconds} />
          <section>
            <span><IconTarget size={19} /> 이번 목표</span>
            <strong>첫 문장에서 결론을 말하고, 핵심 단어 세 개 중 두 개 이상 사용하기</strong>
          </section>
          <p><IconMicrophoneOff size={18} /> 이 연습은 녹음하거나 분석하지 않아요.</p>
          <div className="safe-practice-actions">
            <OrbitButton
              icon={phase === "running" ? <IconPlayerPause size={18} /> : <IconPlayerPlay size={18} />}
              onClick={() => setPhase((value) => value === "running" ? "paused" : "running")}
            >
              {phase === "running" ? "잠시 멈추기" : seconds > 0 ? "계속 말하기" : "연습 시작"}
            </OrbitButton>
            <button onClick={resetPractice} type="button"><IconRefresh size={17} /> 다시 시작</button>
          </div>
          <button className="safe-finish-action" onClick={() => props.onNavigate("/mockup/safe-feedback")} type="button">
            연습 마치고 확인하기<IconArrowRight size={18} />
          </button>
        </aside>
      </div>
    </JourneyPage>
  );
}

export function OrbitSafeFeedbackMockup(props: JourneyMockupProps) {
  const [privacy, setPrivacy] = useState<PrivacyChoice>("private");
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);

  return (
    <JourneyPage activeNav="리허설" onNavigate={props.onNavigate} stage="practice">
      <JourneyBreadcrumb label="첫 연습 결과" onBack={() => props.onNavigate("/mockup/safe-practice")} />
      <section className="safe-feedback-hero">
        <span><IconCheck size={28} /></span>
        <div><p className="orbit-ds-eyebrow">FIRST PRACTICE COMPLETE</p><h1>첫 연습을 마쳤어요.</h1><p>점수 대신, 다음에 바꿀 작은 행동 하나만 확인해 볼게요.</p></div>
        <OrbitStatus tone="success">나만 보는 결과</OrbitStatus>
      </section>

      <div className="safe-feedback-layout">
        <section className="safe-feedback-main">
          <article className="safe-feedback-positive">
            <header><IconSparkles size={20} /><span>이번에 잘한 점</span></header>
            <h2>첫 문장에서 보고의 결론을 분명하게 말했어요.</h2>
            <p>대본 전체를 읽지 않고도 핵심 단어를 보며 다음 문장으로 자연스럽게 이어갔습니다.</p>
            <div><span>전달한 핵심 내용</span><strong>결론 · 고객 변화</strong><small>다음 행동은 다음 연습에서 이어가면 충분해요.</small></div>
          </article>

          <article className="safe-feedback-next">
            <span>다음 행동 한 가지</span>
            <h2>첫 문장 뒤에 2초만 쉬어보세요.</h2>
            <p>결론이 청중에게 도착할 시간을 만든 뒤 근거를 이어 말하면 더 편안하게 들립니다.</p>
            <OrbitButton icon={<IconRefresh size={18} />} onClick={() => props.onNavigate("/mockup/safe-practice")}>60초 한 번 더 연습</OrbitButton>
          </article>

          <div className="safe-feedback-paths">
            <button onClick={() => props.onNavigate("/mockup/safe-start")} type="button"><IconFlag size={20} /><span><strong>다른 작은 연습 선택</strong><small>어려운 장표나 장표 연결로 이어가기</small></span><IconChevronRight size={18} /></button>
            <button onClick={() => props.onNavigate("/mockup/rehearsal")} type="button"><IconPresentation size={20} /><span><strong>전체 흐름 확인</strong><small>준비됐다면 처음부터 끝까지 말해보기</small></span><IconChevronRight size={18} /></button>
          </div>
        </section>

        <aside className="safe-feedback-privacy">
          <header><IconLock size={21} /><div><h2>연습 기록</h2><p>저장과 공유는 직접 결정할 수 있어요.</p></div></header>
          <div role="radiogroup" aria-label="연습 기록 공개 범위">
            <PrivacyOption active={privacy === "private"} icon={<IconLock size={19} />} label="나만 보관" onSelect={() => setPrivacy("private")} />
            <PrivacyOption active={privacy === "shared"} icon={<IconShare size={19} />} label="선택한 결과만 공유" onSelect={() => setPrivacy("shared")} />
            <PrivacyOption active={privacy === "deleted"} icon={<IconTrash size={19} />} label="지금 삭제" onSelect={() => setDeleteDialogOpen(true)} />
          </div>
          <p className="safe-privacy-state" role="status">
            {privacy === "private" ? "이 결과는 다른 팀원에게 보이지 않아요." : privacy === "shared" ? "잘한 점과 완료 여부만 공유하도록 선택했어요." : "연습 기록을 삭제했어요."}
          </p>
          <button className="journey-quiet-action" onClick={() => props.onNavigate("/mockup/home")} type="button">오늘 연습 마치기</button>
        </aside>
      </div>

      <OrbitDialog
        description="삭제하면 이 연습의 시간과 피드백을 다시 확인할 수 없습니다."
        footer={<><OrbitButton onClick={() => setDeleteDialogOpen(false)} variant="secondary">취소</OrbitButton><OrbitButton onClick={() => { setPrivacy("deleted"); setDeleteDialogOpen(false); }}>기록 삭제</OrbitButton></>}
        onClose={() => setDeleteDialogOpen(false)}
        open={deleteDialogOpen}
        title="이 연습 기록을 삭제할까요?"
      >
        <p className="safe-delete-note"><IconTrash size={19} /> 프로젝트와 발표자료는 그대로 유지됩니다.</p>
      </OrbitDialog>
    </JourneyPage>
  );
}

function JourneyPage(props: JourneyMockupProps & { activeNav?: "홈" | "프로젝트" | "리허설" | "리포트"; children: ReactNode; stage?: ConnectedJourneyStage }) {
  return <OrbitConnectedJourneyShell activeNav={props.activeNav} onNavigate={props.onNavigate} stage={props.stage}><div className="orbit-journey-mockup">{props.children}</div></OrbitConnectedJourneyShell>;
}

function JourneyBreadcrumb(props: { label: string; onBack: () => void }) {
  return <div className="journey-breadcrumb"><button onClick={props.onBack} type="button"><IconArrowLeft size={18} /> 프로젝트 보기</button><span>/</span><strong>{props.label}</strong></div>;
}

function JourneySlidePreview(props: { compact?: boolean }) {
  return (
    <div className={`journey-slide-preview${props.compact ? " compact" : ""}`}>
      <img alt="ORBIT" src={orbitLogo} />
      <div><small>FIRST BUSINESS UPDATE</small><h2>첫 업무 성과 보고</h2><p>고객이 더 빠르게 성과를 확인할 수 있도록</p></div>
      <footer><span>2026.07.15</span><span>ORBIT 제품팀</span></footer>
    </div>
  );
}

function ToggleRow(props: { active: boolean; description: string; icon: ReactNode; label: string; onToggle: () => void }) {
  return (
    <button aria-pressed={props.active} onClick={props.onToggle} type="button">
      <span>{props.icon}</span><span><strong>{props.label}</strong><small>{props.description}</small></span><i aria-hidden="true"><b /></i>
    </button>
  );
}

function PrivacyOption(props: { active: boolean; icon: ReactNode; label: string; onSelect: () => void }) {
  return <button aria-checked={props.active} className={props.active ? "selected" : ""} onClick={props.onSelect} role="radio" type="button"><span>{props.icon}</span><strong>{props.label}</strong>{props.active ? <IconCheck size={17} /> : null}</button>;
}
