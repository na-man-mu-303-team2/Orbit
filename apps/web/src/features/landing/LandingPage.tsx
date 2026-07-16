import { IconArrowRight } from "@tabler/icons-react";
import orbitSymbol from "../../assets/orbit-symbol-v2.png";
import { GradientButton } from "../../components/ui/GradientButton";
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
            <GradientButton
              onClick={() => props.onNavigate("/signup")}
            >
              무료로 시작
            </GradientButton>
          </div>
        </div>
      </header>

      <main className="landing-main">
        <section className="landing-hero">
          <p className="landing-eyebrow">AI Presentation Workspace</p>
          <h1>
            생각을 발표로 바꾸는
            <br />
            가장 빠른 캔버스
          </h1>
          <p className="landing-intro">
            아이디어 정리부터 슬라이드 생성, 리허설과 피드백까지 발표의 모든
            순간을 하나의 흐름으로 연결하세요.
          </p>
          <div className="landing-hero-actions">
            <GradientButton
              onClick={() => props.onNavigate("/signup")}
              size="large"
            >
              무료로 시작하기
              <IconArrowRight aria-hidden="true" size={16} />
            </GradientButton>
          </div>
          <p className="landing-hero-note">설치 없이 웹에서 바로 시작할 수 있어요.</p>
        </section>
      </main>

      <footer className="landing-footer">
        <span>© 2026 ORBIT</span>
        <span>발표의 모든 순간을 연결합니다.</span>
      </footer>
    </div>
  );
}
