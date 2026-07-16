import {
  IconFileText,
  IconMicrophone,
  IconPresentation,
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
          <p className="landing-eyebrow">AI Presentation Workspace</p>
          <h1 aria-label="생각을 발표로 바꾸는 가장 빠른 캔버스">
            생각을 발표로 바꾸는
            <br />
            가장 빠른 캔버스
          </h1>
          <p className="landing-intro">
            아이디어 정리부터 슬라이드 생성, 리허설과 피드백까지 발표의 모든
            순간을 하나의 흐름으로 연결하세요.
          </p>
        </section>

        <ProductShowcase />
      </main>
    </div>
  );
}

function ProductShowcase() {
  return (
    <section
      aria-label="ORBIT 생성, 편집, 리허설 제품 미리보기"
      className="landing-product-showcase"
      id="landing-product-showcase"
    >
      <div className="landing-app-frame" id="landing-editor">
        <header className="landing-app-topbar">
          <div className="landing-app-brand">
            <img alt="" aria-hidden="true" src={orbitSymbol} />
            <span>ORBIT</span>
          </div>
          <div className="landing-app-document">
            <IconPresentation aria-hidden="true" size={15} />
            <span><strong>2026 제품 전략</strong><small>자동 저장됨</small></span>
          </div>
          <div className="landing-app-flow" aria-label="발표 제작 단계">
            <span>생성</span><span className="is-active">편집</span><span>리허설</span>
          </div>
        </header>

        <div className="landing-app-workspace">
          <aside className="landing-slide-rail" aria-label="슬라이드 목록">
            <header><strong>슬라이드</strong><small>12</small></header>
            {[1, 2, 3, 4].map((slide) => (
              <div className={slide === 2 ? "is-active" : ""} key={slide}>
                <small>{slide}</small><span><b /><i /></span>
              </div>
            ))}
          </aside>

          <section className="landing-canvas-workspace" aria-label="프레젠테이션 편집 캔버스">
            <header><span>레이아웃</span><span>테마</span><span>전환</span><small>100%</small></header>
            <article className="landing-slide-canvas">
              <div className="landing-slide-copy">
                <p>2026 H2 STRATEGY</p>
                <h2>고객 가치로<br />성장을 설계하다</h2>
                <span>Orbit Product Team</span>
              </div>
              <div className="landing-slide-data">
                <div className="landing-slide-chart" aria-label="분기별 성장 추이">
                  <span /><span /><span /><span /><span />
                </div>
                <div className="landing-slide-metrics">
                  <span><strong>15%</strong><small>점유율</small></span>
                  <span><strong>30%</strong><small>ARR 성장</small></span>
                </div>
              </div>
            </article>
          </section>

          <aside className="landing-ai-panel" aria-label="AI 편집 제안">
            <header><IconSparkles aria-hidden="true" size={15} /><strong>AI Copilot</strong></header>
            <section className="landing-quality-score">
              <span><small>장표 완성도</small><strong>92</strong></span>
              <progress aria-label="장표 완성도 92점" max="100" value="92" />
            </section>
            <section className="landing-ai-suggestion">
              <IconFileText aria-hidden="true" size={15} />
              <div><strong>메시지를 더 선명하게</strong><p>핵심 성과를 제목에 먼저 보여주세요.</p></div>
            </section>
            <section className="landing-ai-suggestion">
              <IconPresentation aria-hidden="true" size={15} />
              <div><strong>시각적 위계 정리</strong><p>지표 두 개에 시선을 집중했어요.</p></div>
            </section>
          </aside>
        </div>
      </div>

      <article className="landing-rehearsal-card" id="landing-coach">
        <header><span><IconMicrophone aria-hidden="true" size={15} /> AI 리허설 분석</span><small>05:24</small></header>
        <div className="landing-rehearsal-summary">
          <div aria-hidden="true" className="landing-rehearsal-wave">
            {Array.from({ length: 18 }, (_, index) => <span key={index} />)}
          </div>
          <div className="landing-rehearsal-metrics">
            <span><small>말하기 속도</small><strong>안정적</strong></span>
            <span><small>평균 침묵</small><strong>1.2초</strong></span>
          </div>
        </div>
        <p><strong>핵심 메시지가 또렷하게 전달됐어요.</strong> 다음 문장에서는 한 박자 쉬어 강조해 보세요.</p>
      </article>
    </section>
  );
}
