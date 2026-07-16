import {
  IconArrowUp,
  IconMicrophone,
  IconPlus,
  IconSparkles
} from "@tabler/icons-react";
import orbitSymbol from "../../assets/orbit-symbol-v2.png";
import "../../styles/tokens.css";
import "./landing-page.css";

type Navigate = (path: string) => void;

export function LandingPage(props: { onNavigate: Navigate }) {
  return (
    <div className="landing-page">
      <header className="landing-header">
        <div className="landing-header-inner">
          <button
            aria-label="ORBIT 홈"
            className="landing-logo"
            onClick={() => window.scrollTo(0, 0)}
            type="button"
          >
            <img alt="" aria-hidden="true" src={orbitSymbol} />
            <span>ORBIT</span>
          </button>

          <div className="landing-header-actions">
            <button
              className="landing-login"
              onClick={() => props.onNavigate("/login")}
              type="button"
            >
              로그인
            </button>
          </div>
        </div>
      </header>

      <main className="landing-hero">
        <section className="landing-hero-copy">
          <h1>
            생각을 발표로 바꾸는
            <br />
            <strong>가장 빠른 캔버스</strong>
          </h1>
          <p className="landing-intro">
            아이디어 정리부터 슬라이드 생성, 리허설과 피드백까지 발표의 모든
            순간을 하나의 흐름으로 연결하세요.
          </p>
        </section>

        <div className="landing-float-cards">
          <EditorFloatCard />
          <RehearsalFloatCard />
        </div>
      </main>
    </div>
  );
}

function EditorFloatCard() {
  return (
    <article
      aria-label="AI 슬라이드 초안 미리보기"
      className="landing-float-card landing-float-left"
    >
      <span className="landing-chip landing-chip-tinted">
        <IconSparkles aria-hidden="true" size={12} />
        AI 초안 생성
      </span>
      <strong>2026 제품 전략</strong>
      <p>핵심 메시지를 정리해 슬라이드 초안을 자동으로 구성해요.</p>

      <div aria-hidden="true" className="landing-mini-slide">
        <small>2026 H2 STRATEGY</small>
        <span>
          고객 가치로
          <br />
          성장을 설계하다
        </span>
        <div className="landing-mini-chart">
          <i />
          <i />
          <i />
          <i />
          <i />
        </div>
      </div>

      <div aria-hidden="true" className="landing-copilot">
        <span className="landing-copilot-plus">
          <IconPlus size={13} />
        </span>
        <p>어떻게 도와드릴까요?</p>
        <span className="landing-copilot-send">
          <IconArrowUp size={13} />
        </span>
      </div>
    </article>
  );
}

function RehearsalFloatCard() {
  return (
    <article
      aria-label="AI 리허설 피드백 미리보기"
      className="landing-float-card landing-float-right"
    >
      <span className="landing-chip landing-chip-dot">AI 리허설 피드백</span>
      <header className="landing-rehearsal-head">
        <span>
          <IconMicrophone aria-hidden="true" size={14} />
          리허설 분석
        </span>
        <small>05:24</small>
      </header>

      <div aria-hidden="true" className="landing-rehearsal-wave">
        {Array.from({ length: 16 }, (_, index) => (
          <span key={index} />
        ))}
      </div>

      <p>
        <strong>핵심 메시지가 또렷해요.</strong> 다음 문장에서 한 박자 쉬어
        강조해 보세요.
      </p>
    </article>
  );
}
