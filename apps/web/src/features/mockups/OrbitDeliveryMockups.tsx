import {
  IconArrowLeft,
  IconCheck,
  IconChevronLeft,
  IconChevronRight,
  IconClock,
  IconDeviceDesktop,
  IconEyeOff,
  IconExternalLink,
  IconMaximize,
  IconMicrophone,
  IconNotes,
  IconPlayerPause,
  IconPlayerPlay,
  IconPlayerStop,
  IconPresentation,
  IconRotateClockwise,
  IconSparkles,
  IconVolume,
  IconX
} from "@tabler/icons-react";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import orbitLogo from "./assets/orbit-logo-selected.png";
import orbitLogoWhite from "../../assets/orbit-logo-white.png";
import { OrbitButton, OrbitStatus } from "../../design-system";
import "./orbit-delivery-mockups.css";

type DeliveryMockupProps = {
  onNavigate: (path: string) => void;
};

export type DeliverySlide = {
  eyebrow: string;
  notes: string;
  subtitle: string;
  theme: "lilac" | "lime" | "cream" | "navy" | "white";
  title: string;
};

export const deliverySlides: DeliverySlide[] = [
  {
    eyebrow: "PRODUCT STRATEGY 2026",
    notes: "오늘은 다음 성장을 만들기 위해 우리가 선택해야 할 세 가지 전략을 말씀드리겠습니다.",
    subtitle: "고객 가치 중심의 실행으로 지속 가능한 성장을 가속화합니다.",
    theme: "lilac",
    title: "다음 성장을 만드는\n세 가지 선택"
  },
  {
    eyebrow: "01 · OPPORTUNITY",
    notes: "먼저 시장보다 빠르게 변하는 고객 기대를 살펴보겠습니다. 핵심은 속도보다 방향입니다.",
    subtitle: "고객 데이터와 현장 인터뷰에서 반복되는 기회를 찾았습니다.",
    theme: "white",
    title: "시장보다 빠르게\n변하는 고객의 기대"
  },
  {
    eyebrow: "02 · PRIORITIES",
    notes: "첫째는 고객 가치, 둘째는 시장 확장, 셋째는 실행 체계입니다. 이 세 가지가 하나의 성장 루프를 만듭니다.",
    subtitle: "선택과 집중을 통해 팀의 실행 속도를 높입니다.",
    theme: "lime",
    title: "2026 핵심 우선순위"
  },
  {
    eyebrow: "03 · ROADMAP",
    notes: "각 우선순위를 분기별 실행 과제로 연결하고, 책임자와 성공 기준을 명확하게 정했습니다.",
    subtitle: "분기별 목표와 책임을 명확하게 연결합니다.",
    theme: "cream",
    title: "전략을 실행으로\n옮기는 로드맵"
  },
  {
    eyebrow: "04 · IMPACT",
    notes: "우리는 시장 점유율 15퍼센트 향상과 ARR 30퍼센트 성장을 핵심 결과로 추적하겠습니다.",
    subtitle: "제품과 시장 지표를 하나의 성장 언어로 정렬합니다.",
    theme: "navy",
    title: "우리가 만들 변화"
  },
  {
    eyebrow: "NEXT STEP",
    notes: "마지막으로 오늘 결정해야 할 세 가지를 확인하고 다음 주 실행으로 연결하겠습니다.",
    subtitle: "오늘의 합의를 다음 주의 실행으로 연결합니다.",
    theme: "white",
    title: "함께 결정할 세 가지"
  }
];

function formatTimer(totalSeconds: number) {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function useMockTimer(isRunning: boolean, initialSeconds: number) {
  const [seconds, setSeconds] = useState(initialSeconds);
  useEffect(() => {
    if (!isRunning) return undefined;
    const interval = window.setInterval(() => setSeconds((value) => value + 1), 1000);
    return () => window.clearInterval(interval);
  }, [isRunning]);
  return [seconds, setSeconds] as const;
}

export function OrbitRehearsalMockup(props: DeliveryMockupProps) {
  const [index, setIndex] = useState(2);
  const [phase, setPhase] = useState<"ready" | "running" | "paused" | "done">("ready");
  const [displayMode, setDisplayMode] = useState<"presenter" | "slideshow">("presenter");
  const [isDisplayPanelOpen, setIsDisplayPanelOpen] = useState(false);
  const [isSlideshowOpen, setIsSlideshowOpen] = useState(false);
  const [elapsed, setElapsed] = useMockTimer(phase === "running", 252);
  const currentSlide = deliverySlides[index];
  const nextSlide = deliverySlides[Math.min(index + 1, deliverySlides.length - 1)];
  const progress = Math.min((elapsed / 600) * 100, 100);

  useEffect(() => {
    if (!isSlideshowOpen) return undefined;
    function handleSlideshowKey(event: KeyboardEvent) {
      if (event.key === "Escape") setIsSlideshowOpen(false);
      if (event.key === "ArrowLeft") setIndex((value) => Math.max(value - 1, 0));
      if (event.key === "ArrowRight") setIndex((value) => Math.min(value + 1, deliverySlides.length - 1));
    }
    window.addEventListener("keydown", handleSlideshowKey);
    return () => window.removeEventListener("keydown", handleSlideshowKey);
  }, [isSlideshowOpen]);

  function moveSlide(direction: -1 | 1) {
    setIndex((value) => Math.min(Math.max(value + direction, 0), deliverySlides.length - 1));
  }

  function openSelectedDisplay() {
    setIsDisplayPanelOpen(false);
    if (displayMode === "presenter") {
      props.onNavigate("/mockup/presenter");
      return;
    }
    setIsSlideshowOpen(true);
  }

  return (
    <div className="orbit-delivery orbit-rehearsal-mockup">
      <DeliveryHeader
        mode="리허설"
        onBack={() => props.onNavigate("/mockup/editor")}
        rightActions={(
          <>
            <OrbitButton
              className="rehearsal-display-trigger"
              icon={<IconDeviceDesktop size={18} />}
              onClick={() => setIsDisplayPanelOpen(true)}
              variant="secondary"
            >
              화면 설정
            </OrbitButton>
            <OrbitButton onClick={() => setPhase("done")}>리허설 종료</OrbitButton>
          </>
        )}
      />

      <main className="rehearsal-mockup-main">
        <section className="rehearsal-mockup-content">
          <div className="rehearsal-mockup-statusbar">
            <span className={`rehearsal-live-dot ${phase === "running" ? "active" : ""}`} />
            <strong>{phase === "running" ? "음성 인식 중" : phase === "paused" ? "잠시 멈춤" : "리허설 준비됨"}</strong>
            <span><IconClock size={16} /> {formatTimer(elapsed)} / 10:00</span>
            <span><IconPresentation size={16} /> {index + 1} / {deliverySlides.length}</span>
          </div>

          <div className="rehearsal-mockup-stage">
            <DeliverySlideCanvas slide={currentSlide} />
            <button aria-label="이전 슬라이드" disabled={index === 0} onClick={() => moveSlide(-1)} type="button">
              <IconChevronLeft size={24} />
            </button>
            <button aria-label="다음 슬라이드" disabled={index === deliverySlides.length - 1} onClick={() => moveSlide(1)} type="button">
              <IconChevronRight size={24} />
            </button>
          </div>

          <section className="rehearsal-teleprompter" aria-label="발표 스크립트">
            <header>
              <span><IconNotes size={18} /> 발표 스크립트</span>
              <OrbitStatus tone="success">자동 따라가기</OrbitStatus>
            </header>
            <p>
              {index === 2 ? (
                <>
                  첫째는 <mark>고객 가치</mark>, 둘째는 <mark>시장 확장</mark>, 셋째는 실행 체계입니다.
                  이 세 가지가 하나의 성장 루프를 만듭니다.
                </>
              ) : currentSlide.notes}
            </p>
            <small>다음: {nextSlide.notes}</small>
          </section>
        </section>

        <aside className="rehearsal-coach-panel">
          <div className="rehearsal-coach-heading">
            <span><IconSparkles size={20} /></span>
            <div><strong>AI 리허설 코치</strong><small>말하는 동안 흐름을 함께 점검해요.</small></div>
          </div>

          <section className="rehearsal-timing-card">
            <div><span>전체 진행</span><strong>{Math.round(progress)}%</strong></div>
            <progress max="100" value={progress} />
            <div className="rehearsal-timing-meta"><span>현재 속도 <b>132 WPM</b></span><span>권장 120–150</span></div>
          </section>

          <section className="rehearsal-keyword-card">
            <header><span>핵심 키워드</span><b>2 / 3</b></header>
            <ul>
              <li className="hit"><IconCheck size={16} /> 고객 가치</li>
              <li className="hit"><IconCheck size={16} /> 시장 확장</li>
              <li><span /> 실행 체계</li>
            </ul>
          </section>

          <section className="rehearsal-advice-card">
            <span><IconSparkles size={17} /> 실시간 피드백</span>
            <strong>좋은 속도예요. 다음 문장 앞에서 한 박자 쉬어보세요.</strong>
          </section>

          <section className="rehearsal-audio-card">
            <header><span><IconMicrophone size={17} /> 마이크</span><OrbitStatus tone="success">정상</OrbitStatus></header>
            <div aria-label="마이크 입력 수준"><i /><i /><i /><i /><i /><i /><i /></div>
          </section>

          <div className="rehearsal-coach-actions">
            {phase === "running" ? (
              <OrbitButton icon={<IconPlayerPause size={18} />} onClick={() => setPhase("paused")}>일시정지</OrbitButton>
            ) : (
              <OrbitButton icon={<IconPlayerPlay size={18} />} onClick={() => setPhase("running")}>
                {phase === "paused" ? "계속하기" : "리허설 시작"}
              </OrbitButton>
            )}
            <button onClick={() => { setElapsed(0); setPhase("ready"); }} type="button">
              <IconRotateClockwise size={17} /> 다시 시작
            </button>
          </div>
        </aside>
      </main>

      {phase === "done" ? (
        <div className="delivery-complete-backdrop" role="dialog" aria-label="리허설 완료" aria-modal="true">
          <section className="delivery-complete-card">
            <span className="delivery-complete-icon"><IconCheck size={30} /></span>
            <p className="orbit-ds-eyebrow">REHEARSAL COMPLETE</p>
            <h1>첫 리허설을 마쳤어요.</h1>
            <p>발표 시간 04:32 · 핵심 키워드 2/3 · 말하기 속도 안정적</p>
            <div><button onClick={() => setPhase("paused")} type="button">계속 연습</button><OrbitButton onClick={() => props.onNavigate("/mockup/rehearsal-complete")}>리포트 보기</OrbitButton></div>
          </section>
        </div>
      ) : null}

      {isDisplayPanelOpen ? (
        <div
          className="rehearsal-display-backdrop"
          onMouseDown={(event) => {
            if (event.currentTarget === event.target) setIsDisplayPanelOpen(false);
          }}
        >
          <section
            aria-label="발표 화면 설정"
            aria-modal="true"
            className="rehearsal-display-panel"
            role="dialog"
          >
            <header>
              <div>
                <span><IconDeviceDesktop size={21} /></span>
                <div><h2>발표 화면 설정</h2><p>어떤 화면을 열지 선택하세요.</p></div>
              </div>
              <button aria-label="화면 설정 닫기" onClick={() => setIsDisplayPanelOpen(false)} type="button">
                <IconX size={20} />
              </button>
            </header>

            <div aria-label="발표 화면 선택" className="rehearsal-display-options" role="radiogroup">
              <button
                aria-checked={displayMode === "presenter"}
                className={displayMode === "presenter" ? "selected" : ""}
                onClick={() => setDisplayMode("presenter")}
                role="radio"
                type="button"
              >
                <span className="rehearsal-display-option-icon"><IconPresentation size={24} /></span>
                <span><strong>발표자 모드</strong><small>현재 슬라이드, 다음 화면, 발표 메모와 타이머를 한곳에서 봅니다.</small></span>
                <i><IconCheck size={15} /></i>
              </button>
              <button
                aria-checked={displayMode === "slideshow"}
                className={displayMode === "slideshow" ? "selected" : ""}
                onClick={() => setDisplayMode("slideshow")}
                role="radio"
                type="button"
              >
                <span className="rehearsal-display-option-icon"><IconMaximize size={24} /></span>
                <span><strong>슬라이드쇼 화면</strong><small>발표 자료만 크게 열어 청중 화면 또는 외부 모니터에 표시합니다.</small></span>
                <i><IconCheck size={15} /></i>
              </button>
            </div>

            <section className="rehearsal-display-summary">
              <div><IconDeviceDesktop size={19} /><span><strong>이 Mac의 화면</strong><small>새 창으로 열기 · 전체화면 전환 가능</small></span></div>
              <OrbitStatus tone="success">사용 가능</OrbitStatus>
            </section>

            <footer>
              <button onClick={() => setIsDisplayPanelOpen(false)} type="button">취소</button>
              <OrbitButton icon={<IconExternalLink size={18} />} onClick={openSelectedDisplay}>
                {displayMode === "presenter" ? "발표자 모드 열기" : "슬라이드쇼 열기"}
              </OrbitButton>
            </footer>
          </section>
        </div>
      ) : null}

      {isSlideshowOpen ? (
        <div aria-label="슬라이드쇼 화면" aria-modal="true" className="rehearsal-slideshow" role="dialog">
          <header>
            <img alt="ORBIT" src={orbitLogoWhite} />
            <span>{index + 1} / {deliverySlides.length}</span>
            <button aria-label="슬라이드쇼 닫기" onClick={() => setIsSlideshowOpen(false)} type="button"><IconX size={21} /></button>
          </header>
          <main><DeliverySlideCanvas slide={currentSlide} /></main>
          <footer>
            <button aria-label="이전 슬라이드" disabled={index === 0} onClick={() => moveSlide(-1)} type="button"><IconChevronLeft size={25} /></button>
            <span>슬라이드쇼 · Esc로 종료</span>
            <button aria-label="다음 슬라이드" disabled={index === deliverySlides.length - 1} onClick={() => moveSlide(1)} type="button"><IconChevronRight size={25} /></button>
          </footer>
        </div>
      ) : null}
    </div>
  );
}

export function OrbitPresenterMockup(props: DeliveryMockupProps) {
  const [index, setIndex] = useState(2);
  const [isBlank, setIsBlank] = useState(false);
  const [isPlaying, setIsPlaying] = useState(true);
  const [isEnded, setIsEnded] = useState(false);
  const [elapsed] = useMockTimer(isPlaying && !isEnded, 252);
  const currentSlide = deliverySlides[index];
  const nextSlide = deliverySlides[index + 1];

  const noteParts = useMemo(() => currentSlide.notes.split(". "), [currentSlide.notes]);

  function moveSlide(direction: -1 | 1) {
    setIndex((value) => Math.min(Math.max(value + direction, 0), deliverySlides.length - 1));
  }

  return (
    <div className="orbit-delivery orbit-presenter-mockup">
      <header className="presenter-mockup-header">
        <div>
          <button aria-label="에디터로 돌아가기" onClick={() => props.onNavigate("/mockup/editor")} type="button"><IconArrowLeft size={19} /></button>
          <span className="presenter-logo"><img alt="ORBIT" src={orbitLogoWhite} /></span>
          <strong>발표자 모드</strong>
          <span className="presenter-connection"><i /> 발표 화면 연결됨</span>
        </div>
        <div className="presenter-header-timer"><IconClock size={18} /><strong>{formatTimer(elapsed)}</strong><span>/ 10:00</span></div>
        <div>
          <button onClick={() => props.onNavigate("/mockup/rehearsal")} type="button">리허설로</button>
          <button className="presenter-end-button" onClick={() => setIsEnded(true)} type="button"><IconPlayerStop size={17} /> 발표 종료</button>
        </div>
      </header>

      <main className="presenter-mockup-main">
        <section className="presenter-current-stage" aria-label="현재 슬라이드">
          <header><span>현재 슬라이드</span><strong>{index + 1} / {deliverySlides.length}</strong></header>
          <div className="presenter-slide-frame">
            {isBlank ? <div className="presenter-blank-screen"><IconEyeOff size={30} /><span>청중 화면을 잠시 가렸습니다.</span></div> : <DeliverySlideCanvas slide={currentSlide} />}
          </div>
        </section>

        <aside className="presenter-side-panel">
          <section className="presenter-next-card">
            <header><span>다음 슬라이드</span><strong>{Math.min(index + 2, deliverySlides.length)} / {deliverySlides.length}</strong></header>
            <div>{nextSlide ? <DeliverySlideCanvas compact slide={nextSlide} /> : <span className="presenter-last-slide">마지막 슬라이드입니다.</span>}</div>
          </section>
          <section className="presenter-notes-card">
            <header><IconNotes size={18} /><span>발표 메모</span></header>
            <div>
              {noteParts.map((note, noteIndex) => <p className={noteIndex === 0 ? "active" : ""} key={note}>{note}{note.endsWith(".") ? "" : "."}</p>)}
            </div>
          </section>
          <section className="presenter-cue-card">
            <span><IconVolume size={17} /> 현재 큐</span>
            <strong>“실행 체계”를 말하면 다음 슬라이드로 이동합니다.</strong>
          </section>
        </aside>
      </main>

      <footer className="presenter-command-dock" aria-label="발표 제어">
        <button aria-label="이전 슬라이드" disabled={index === 0} onClick={() => moveSlide(-1)} type="button"><IconChevronLeft size={24} /></button>
        <button className="presenter-play-button" onClick={() => setIsPlaying((value) => !value)} type="button">
          {isPlaying ? <><IconPlayerPause size={21} /> 일시정지</> : <><IconPlayerPlay size={21} /> 계속하기</>}
        </button>
        <button aria-label="다음 슬라이드" disabled={index === deliverySlides.length - 1} onClick={() => moveSlide(1)} type="button"><IconChevronRight size={24} /></button>
        <span />
        <button aria-pressed={isBlank} onClick={() => setIsBlank((value) => !value)} type="button"><IconEyeOff size={19} /> 화면 가리기</button>
        <button type="button"><IconMaximize size={19} /> 전체화면</button>
      </footer>

      {isEnded ? (
        <div className="delivery-complete-backdrop dark" role="dialog" aria-label="발표 종료" aria-modal="true">
          <section className="delivery-complete-card">
            <span className="delivery-complete-icon"><IconCheck size={30} /></span>
            <p className="orbit-ds-eyebrow">PRESENTATION COMPLETE</p>
            <h1>발표를 종료할까요?</h1>
            <p>청중 화면 연결을 종료하고 프로젝트 허브로 돌아갑니다.</p>
            <div><button onClick={() => setIsEnded(false)} type="button">발표 계속</button><OrbitButton onClick={() => props.onNavigate("/mockup/home")}>종료하고 나가기</OrbitButton></div>
          </section>
        </div>
      ) : null}
    </div>
  );
}

function DeliveryHeader(props: { mode: string; onBack: () => void; rightActions: ReactNode }) {
  return (
    <header className="delivery-header">
      <div>
        <button aria-label="에디터로 돌아가기" onClick={props.onBack} type="button"><IconArrowLeft size={19} /></button>
        <img alt="ORBIT" src={orbitLogo} />
        <span />
        <strong>2026 하반기 제품 전략</strong>
        <OrbitStatus tone="lilac">{props.mode}</OrbitStatus>
      </div>
      <div>{props.rightActions}</div>
    </header>
  );
}

export function DeliverySlideCanvas(props: { compact?: boolean; slide: DeliverySlide }) {
  return (
    <article className={`delivery-slide delivery-slide-${props.slide.theme} ${props.compact ? "compact" : ""}`}>
      <span>ORBIT / 2026</span>
      <div>
        <small>{props.slide.eyebrow}</small>
        <h1>{props.slide.title}</h1>
        {!props.compact ? <p>{props.slide.subtitle}</p> : null}
      </div>
      {!props.compact ? (
        <section>
          <span><small>시장 확장</small><strong>+15%</strong></span>
          <span><small>ARR 성장</small><strong>+30%</strong></span>
          <span><small>신제품 출시</small><strong>2</strong></span>
        </section>
      ) : null}
    </article>
  );
}
