import {
  IconArrowLeft,
  IconCheck,
  IconChevronLeft,
  IconChevronRight,
  IconClock,
  IconEyeOff,
  IconMaximize,
  IconMessageCircle,
  IconMicrophone,
  IconNotes,
  IconPlayerPause,
  IconPlayerPlay,
  IconPlayerStop,
  IconPresentation,
  IconUsers,
  IconWifi,
  IconX
} from "@tabler/icons-react";
import { useEffect, useMemo, useState } from "react";
import orbitLogoWhite from "../../assets/orbit-logo-white.png";
import { OrbitButton } from "../../design-system";
import { DeliverySlideCanvas, deliverySlides } from "./OrbitDeliveryMockups";
import "./orbit-live-mockups.css";

type LiveMockupProps = {
  onNavigate: (path: string) => void;
};

function formatLiveTimer(totalSeconds: number) {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function useLiveTimer(isRunning: boolean) {
  const [seconds, setSeconds] = useState(252);
  useEffect(() => {
    if (!isRunning) return undefined;
    const timer = window.setInterval(() => setSeconds((value) => value + 1), 1000);
    return () => window.clearInterval(timer);
  }, [isRunning]);
  return seconds;
}

export function OrbitLivePresentationMockup(props: LiveMockupProps) {
  const [index, setIndex] = useState(2);
  const [isBlank, setIsBlank] = useState(false);
  const [isEnded, setIsEnded] = useState(false);

  function moveSlide(direction: -1 | 1) {
    setIndex((value) => Math.min(Math.max(value + direction, 0), deliverySlides.length - 1));
  }

  useEffect(() => {
    function handleKey(event: KeyboardEvent) {
      if (event.key === "ArrowLeft") moveSlide(-1);
      if (event.key === "ArrowRight") moveSlide(1);
      if (event.key.toLocaleLowerCase() === "b") setIsBlank((value) => !value);
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, []);

  return (
    <div className="orbit-live-screen">
      <header className="live-screen-header">
        <div><img alt="ORBIT" src={orbitLogoWhite} /><span className="live-badge"><i /> LIVE</span><strong>2026 하반기 제품 전략</strong></div>
        <div><span className="live-screen-connection"><IconWifi size={16} /> 청중 화면 연결됨</span><button onClick={() => props.onNavigate("/mockup/live-presenter")} type="button"><IconPresentation size={17} />발표자 모드</button><button className="live-end-button" onClick={() => setIsEnded(true)} type="button"><IconPlayerStop size={17} />발표 종료</button></div>
      </header>

      <main className="live-screen-stage" aria-label="실전 발표 슬라이드">
        {isBlank ? <div className="live-screen-blank"><IconEyeOff size={34} /><strong>청중 화면을 가렸습니다.</strong><span>B 키를 누르거나 아래 제어에서 다시 표시하세요.</span></div> : <DeliverySlideCanvas slide={deliverySlides[index]} />}
      </main>

      <footer className="live-screen-controls" aria-label="실전 발표 제어">
        <span><IconUsers size={17} /> 청중 12명 참여 중</span>
        <div><button aria-label="이전 슬라이드" disabled={index === 0} onClick={() => moveSlide(-1)} type="button"><IconChevronLeft size={23} /></button><strong>{index + 1} / {deliverySlides.length}</strong><button aria-label="다음 슬라이드" disabled={index === deliverySlides.length - 1} onClick={() => moveSlide(1)} type="button"><IconChevronRight size={23} /></button></div>
        <div><button aria-pressed={isBlank} onClick={() => setIsBlank((value) => !value)} type="button"><IconEyeOff size={17} />화면 가리기</button><button type="button"><IconMaximize size={17} />전체화면</button></div>
      </footer>

      {isEnded ? <LiveEndDialog onCancel={() => setIsEnded(false)} onConfirm={() => props.onNavigate("/mockup/home")} /> : null}
    </div>
  );
}

export function OrbitLivePresenterMockup(props: LiveMockupProps) {
  const [index, setIndex] = useState(2);
  const [isPlaying, setIsPlaying] = useState(true);
  const [isBlank, setIsBlank] = useState(false);
  const [isEnded, setIsEnded] = useState(false);
  const elapsed = useLiveTimer(isPlaying && !isEnded);
  const slide = deliverySlides[index];
  const nextSlide = deliverySlides[index + 1];
  const noteParts = useMemo(() => slide.notes.split(". "), [slide.notes]);

  function moveSlide(direction: -1 | 1) {
    setIndex((value) => Math.min(Math.max(value + direction, 0), deliverySlides.length - 1));
  }

  return (
    <div className="orbit-live-presenter">
      <header className="live-presenter-header">
        <div><button aria-label="에디터로 돌아가기" onClick={() => props.onNavigate("/mockup/editor")} type="button"><IconArrowLeft size={19} /></button><img alt="ORBIT" src={orbitLogoWhite} /><span className="live-badge"><i /> LIVE</span><strong>2026 하반기 제품 전략</strong></div>
        <div className="live-presenter-timer"><IconClock size={17} /><strong>{formatLiveTimer(elapsed)}</strong><span>/ 10:00</span></div>
        <div><span className="live-screen-connection"><IconWifi size={16} /> 청중 화면 연결됨</span><button onClick={() => props.onNavigate("/mockup/live")} type="button"><IconPresentation size={17} />청중 화면</button><button className="live-end-button" onClick={() => setIsEnded(true)} type="button"><IconPlayerStop size={17} />발표 종료</button></div>
      </header>

      <main className="live-presenter-main">
        <section className="live-presenter-current" aria-label="현재 발표 슬라이드">
          <header><span>현재 슬라이드</span><strong>{index + 1} / {deliverySlides.length}</strong></header>
          <div>{isBlank ? <div className="live-screen-blank"><IconEyeOff size={32} /><strong>청중 화면 가림</strong></div> : <DeliverySlideCanvas slide={slide} />}</div>
        </section>

        <aside className="live-presenter-rail">
          <section className="live-presenter-next"><header><span>다음 슬라이드</span><strong>{Math.min(index + 2, deliverySlides.length)} / {deliverySlides.length}</strong></header><div>{nextSlide ? <DeliverySlideCanvas compact slide={nextSlide} /> : <span>마지막 슬라이드입니다.</span>}</div></section>
          <section className="live-presenter-notes"><header><IconNotes size={18} /><span>발표 메모</span><small>자동 따라가기</small></header><div>{noteParts.map((note, noteIndex) => <p className={noteIndex === 0 ? "active" : ""} key={note}>{note}{note.endsWith(".") ? "" : "."}</p>)}</div></section>
          <section className="live-audience-panel"><header><span><IconUsers size={18} />청중 연결</span><strong>12명</strong></header><div><span><IconMessageCircle size={17} />질문<strong>3</strong></span><span><IconMicrophone size={17} />발언 요청<strong>1</strong></span></div><button type="button">청중 반응 보기</button></section>
        </aside>
      </main>

      <footer className="live-presenter-dock" aria-label="실전 발표 제어">
        <div><button aria-label="이전 슬라이드" disabled={index === 0} onClick={() => moveSlide(-1)} type="button"><IconChevronLeft size={24} /></button><button className="live-play-button" onClick={() => setIsPlaying((value) => !value)} type="button">{isPlaying ? <><IconPlayerPause size={20} />일시정지</> : <><IconPlayerPlay size={20} />계속하기</>}</button><button aria-label="다음 슬라이드" disabled={index === deliverySlides.length - 1} onClick={() => moveSlide(1)} type="button"><IconChevronRight size={24} /></button></div>
        <span><i /> 청중 화면과 실시간 동기화 중</span>
        <div><button aria-pressed={isBlank} onClick={() => setIsBlank((value) => !value)} type="button"><IconEyeOff size={18} />화면 가리기</button><button type="button"><IconMaximize size={18} />전체화면</button></div>
      </footer>

      {isEnded ? <LiveEndDialog onCancel={() => setIsEnded(false)} onConfirm={() => props.onNavigate("/mockup/home")} /> : null}
    </div>
  );
}

function LiveEndDialog(props: { onCancel: () => void; onConfirm: () => void }) {
  return <div className="live-end-backdrop" role="dialog" aria-label="실전 발표 종료" aria-modal="true"><section><button aria-label="발표 종료 닫기" onClick={props.onCancel} type="button"><IconX size={20} /></button><span><IconCheck size={28} /></span><p className="orbit-ds-eyebrow">LIVE PRESENTATION</p><h1>실전 발표를 종료할까요?</h1><p>청중 화면 연결을 닫고 발표 기록을 저장합니다.</p><div><button onClick={props.onCancel} type="button">발표 계속</button><OrbitButton onClick={props.onConfirm}>종료하고 나가기</OrbitButton></div></section></div>;
}
