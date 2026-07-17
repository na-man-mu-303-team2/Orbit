import {
  IconArrowRight,
  IconChartBar,
  IconChevronDown,
  IconMicrophone,
  IconPlayerPlay,
  IconSparkles,
} from "@tabler/icons-react";
import orbitSymbol from "../../assets/orbit-symbol-v2.png";
import { GradientButton } from "../../components/ui/GradientButton";
import "../../styles/tokens.css";
import "./landing-page.css";

type Navigate = (path: string) => void;

const slidePreviews = [
  { label: "표지", variant: "cover" },
  { label: "문제", variant: "quote" },
  { label: "전략", variant: "chart" },
  { label: "성과", variant: "metrics" },
];

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
            <GradientButton onClick={() => props.onNavigate("/signup")}>
              무료로 시작
            </GradientButton>
          </div>
        </div>
      </header>

      <main className="landing-main">
        <section className="landing-hero">
          <p className="landing-eyebrow">
            <span aria-hidden="true" />
            AI Presentation Workspace
          </p>

          <h1>
            생각을 발표로 바꾸는
            <br />
            가장 빠른 캔버스
          </h1>

          <div className="landing-hero-bottom">
            <div className="landing-hero-copy">
              <p className="landing-intro">
                아이디어 정리부터 슬라이드 생성, 리허설과 피드백까지.
                <br />
                발표의 모든 순간을 하나의 흐름으로 연결하세요.
              </p>
              <GradientButton
                className="landing-primary-action"
                onClick={() => props.onNavigate("/signup")}
                size="large"
              >
                무료로 시작하기
                <IconArrowRight aria-hidden="true" size={16} />
              </GradientButton>
            </div>

            <p className="landing-product-note">
              <strong>New</strong>
              AI 리허설 코치
              <IconArrowRight aria-hidden="true" size={15} />
            </p>
          </div>
        </section>

        <ProductPreview />
      </main>

      <footer className="landing-footer">
        <span>© 2026 ORBIT</span>
        <span>발표의 모든 순간을 연결합니다.</span>
      </footer>
    </div>
  );
}

function ProductPreview() {
  return (
    <section
      aria-label="ORBIT 편집 화면 미리보기"
      className="landing-product-preview"
    >
      <header className="landing-preview-topbar">
        <div className="landing-preview-brand">
          <img alt="" aria-hidden="true" src={orbitSymbol} />
          <span>ORBIT</span>
          <IconChevronDown aria-hidden="true" size={13} />
        </div>

        <div className="landing-preview-document">
          <strong>2026 제품 전략</strong>
          <span>저장됨</span>
        </div>

        <div aria-hidden="true" className="landing-preview-people">
          <span>Y</span>
          <span>J</span>
          <i />
        </div>
      </header>

      <div className="landing-preview-workspace">
        <aside aria-label="슬라이드 목록" className="landing-preview-rail">
          <div className="landing-preview-rail-heading">
            <strong>Slides</strong>
            <span>12</span>
          </div>

          {slidePreviews.map((slide, index) => (
            <div
              className={`landing-preview-thumbnail ${index === 2 ? "is-active" : ""}`}
              key={slide.label}
            >
              <span>{index + 1}</span>
              <div
                className={`landing-thumbnail-art landing-thumbnail-${slide.variant}`}
              >
                <i />
                <i />
                <i />
              </div>
            </div>
          ))}
        </aside>

        <section className="landing-preview-editor">
          <header className="landing-preview-toolbar">
            <div>
              <span>레이아웃</span>
              <span>테마</span>
              <span>전환</span>
            </div>
            <small>76%</small>
          </header>

          <div className="landing-preview-canvas-wrap">
            <article className="landing-preview-slide">
              <div className="landing-slide-copy">
                <p>2026 H2 STRATEGY</p>
                <h2>
                  고객의 시간을
                  <br />
                  성장으로 바꾸다
                </h2>
                <span>Orbit Product Team</span>
              </div>

              <div aria-hidden="true" className="landing-slide-visual">
                <div className="landing-slide-orbit" />
                <div className="landing-slide-metric landing-slide-metric-main">
                  <small>ARR GROWTH</small>
                  <strong>+34%</strong>
                </div>
                <div className="landing-slide-metric landing-slide-metric-sub">
                  <small>ACTIVE TEAMS</small>
                  <strong>12.8K</strong>
                </div>
              </div>
            </article>
          </div>
        </section>

        <aside aria-label="AI 편집 제안" className="landing-preview-ai">
          <header>
            <span>
              <IconSparkles aria-hidden="true" size={15} />
              AI Copilot
            </span>
            <i />
          </header>

          <div className="landing-ai-score">
            <span>
              <small>슬라이드 완성도</small>
              <strong>92</strong>
            </span>
            <div aria-hidden="true">
              <i />
            </div>
          </div>

          <div className="landing-ai-message">
            <IconChartBar aria-hidden="true" size={16} />
            <p>
              <strong>성과를 더 선명하게</strong>
              핵심 지표의 대비를 높였어요.
            </p>
          </div>

          <div className="landing-ai-message">
            <IconSparkles aria-hidden="true" size={16} />
            <p>
              <strong>카피 다듬기</strong>
              발표 흐름에 맞게 문장을 줄였어요.
            </p>
          </div>

          <span className="landing-ai-apply">제안 모두 적용</span>
        </aside>
      </div>

      <article className="landing-rehearsal-peek">
        <header>
          <span>
            <IconMicrophone aria-hidden="true" size={15} />
            AI 리허설 분석
          </span>
          <small>05:24</small>
        </header>

        <div className="landing-rehearsal-content">
          <div aria-hidden="true" className="landing-rehearsal-score">
            <strong>86</strong>
            <span>Great</span>
          </div>
          <p>
            <strong>핵심 메시지가 또렷해요.</strong>
            다음 문장에서 한 박자 쉬어 강조해 보세요.
          </p>
          <span aria-hidden="true" className="landing-rehearsal-play">
            <IconPlayerPlay size={14} />
          </span>
        </div>
      </article>
    </section>
  );
}
