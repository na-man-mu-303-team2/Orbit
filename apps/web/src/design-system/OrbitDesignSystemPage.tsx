import {
  IconArrowRight,
  IconBell,
  IconFileUpload,
  IconPresentation,
  IconSearch,
  IconSparkles,
  IconTemplate,
  IconUpload,
  IconWand
} from "@tabler/icons-react";
import { useState, type ReactNode } from "react";
import orbitLogo from "../assets/orbit-logo.png";
import orbitLogoWhite from "../assets/orbit-logo-white.png";
import { OrbitButton, OrbitColorBlock, OrbitStatus } from "./components";
import { orbitDesignTokens } from "./tokens";
import "./orbit-design-system.css";

const sectionLinks = [
  { id: "foundations", label: "Foundations" },
  { id: "type", label: "Typography" },
  { id: "components", label: "Components" },
  { id: "patterns", label: "Patterns" },
  { id: "tokens", label: "Tokens" }
] as const;

const palette = [
  { label: "Ink", value: orbitDesignTokens.color.ink, role: "Primary action" },
  { label: "Lilac", value: orbitDesignTokens.color.lilac, role: "Core workspace" },
  { label: "Lime", value: orbitDesignTokens.color.lime, role: "Template action" },
  { label: "Cream", value: orbitDesignTokens.color.cream, role: "Import action" },
  { label: "Mint", value: orbitDesignTokens.color.mint, role: "Positive support" },
  { label: "Navy", value: orbitDesignTokens.color.navy, role: "Inverse surface" }
] as const;

const projects = [
  {
    title: "2026 하반기 제품 전략",
    status: <OrbitStatus tone="lilac">편집 중</OrbitStatus>,
    updatedAt: "2026-07-10 09:23",
    duration: "15분",
    slides: 18
  },
  {
    title: "IR Deck 시리즈 B 업데이트",
    status: <OrbitStatus tone="warning">리허설 중</OrbitStatus>,
    updatedAt: "2026-07-09 16:40",
    duration: "20분",
    slides: 21
  },
  {
    title: "마케팅 성과 리뷰 Q2",
    status: <OrbitStatus tone="info">피드백 반영</OrbitStatus>,
    updatedAt: "2026-07-08 14:12",
    duration: "10분",
    slides: 14
  }
];

export function OrbitDesignSystemPage() {
  const [activeSection, setActiveSection] = useState<(typeof sectionLinks)[number]["id"]>(
    "foundations"
  );
  const [startMode, setStartMode] = useState("topic");

  function goToSection(id: (typeof sectionLinks)[number]["id"]) {
    setActiveSection(id);
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  return (
    <div className="orbit-ds-page">
      <header className="orbit-ds-topbar">
        <a aria-label="ORBIT 홈으로 이동" href="/">
          <img alt="ORBIT" src={orbitLogo} />
        </a>
        <nav aria-label="디자인 시스템 섹션">
          {sectionLinks.map((link) => (
            <button
              aria-current={activeSection === link.id}
              className="orbit-ds-nav-button"
              key={link.id}
              onClick={() => goToSection(link.id)}
              type="button"
            >
              {link.label}
            </button>
          ))}
        </nav>
        <div className="orbit-ds-topbar-actions">
          <button aria-label="알림" className="orbit-ds-icon-button" type="button">
            <IconBell size={19} stroke={1.8} />
          </button>
          <span aria-label="사용자 김지윤" className="orbit-ds-avatar">
            김
          </span>
        </div>
      </header>

      <main className="orbit-ds-main">
        <section className="orbit-ds-hero">
          <div>
            <p className="orbit-ds-eyebrow">ORBIT DESIGN SYSTEM · 2026</p>
            <h1>생각을 발표로 연결하는 하나의 언어</h1>
            <p className="orbit-ds-hero-copy">
              공개 화면부터 프로젝트 허브, AI 생성 과정까지 같은 제품처럼 이어지도록 만든
              ORBIT의 시각·상호작용 기준입니다.
            </p>
          </div>
          <aside className="orbit-ds-principle">
            <IconSparkles aria-hidden="true" size={34} stroke={1.6} />
            <strong>Color follows intent.</strong>
            <span>흑백은 구조, 라일락은 핵심 작업, 라임과 크림은 보조 행동에 사용합니다.</span>
          </aside>
        </section>

        <section className="orbit-ds-section" id="foundations">
          <SectionHeading
            description="색은 장식이 아니라 사용자의 다음 행동을 알려주는 신호입니다. 한 화면에는 하나의 큰 라일락 작업 면만 사용합니다."
            eyebrow="01 · Foundations"
            title="Color system"
          />
          <div className="orbit-ds-palette-grid">
            {palette.map((color) => (
              <article className="orbit-ds-swatch" key={color.label}>
                <div className="orbit-ds-swatch-color" style={{ background: color.value }} />
                <div className="orbit-ds-swatch-meta">
                  <strong>{color.label}</strong>
                  <span>{color.role}</span>
                  <code>{color.value}</code>
                </div>
              </article>
            ))}
          </div>
          <div className="orbit-ds-brand-assets">
            <article>
              <img alt="밝은 화면용 ORBIT 로고" src={orbitLogo} />
              <span><strong>Light surface</strong><small>Canvas · Surface</small></span>
            </article>
            <article className="dark">
              <img alt="어두운 화면용 ORBIT 흰색 로고" src={orbitLogoWhite} />
              <span><strong>Dark surface</strong><small>Ink · Navy · Presenter</small></span>
            </article>
          </div>
        </section>

        <section className="orbit-ds-section" id="type">
          <SectionHeading
            description="한국어 가독성을 우선하면서도 편집 도구다운 단단한 리듬을 유지합니다. 무게보다 크기와 여백으로 위계를 만듭니다."
            eyebrow="02 · Typography"
            title="Editorial clarity"
          />
          <div className="orbit-ds-type-stack">
            <TypeRow label="Display · 86/84 · 650">
              <div className="orbit-ds-type-display">발표를 더 선명하게</div>
            </TypeRow>
            <TypeRow label="Title · 64/67 · 620">
              <div className="orbit-ds-type-title">다음 발표를 이어가세요.</div>
            </TypeRow>
            <TypeRow label="Page title · 48/53 · 620">
              <div className="orbit-ds-type-page-title">리허설 종합 리포트</div>
            </TypeRow>
            <TypeRow label="Heading · 26/35 · 600">
              <div className="orbit-ds-type-heading">어떤 발표를 만들까요?</div>
            </TypeRow>
            <TypeRow label="Subheading · 20/28 · 600">
              <div className="orbit-ds-type-subheading">발표의 핵심 메시지가 더 또렷해졌어요.</div>
            </TypeRow>
            <TypeRow label="Body · 16/26 · 400">
              <div className="orbit-ds-type-body">
                아이디어 정리부터 슬라이드 생성, 리허설과 피드백까지 ORBIT이 발표의 전
                과정을 하나의 흐름으로 연결합니다.
              </div>
            </TypeRow>
            <TypeRow label="UI · 14/21 · 500">
              <div className="orbit-ds-type-ui">프로젝트 이름 · 최근 업데이트 · 다음 연습 포인트</div>
            </TypeRow>
            <TypeRow label="Caption · 12/18 · 600">
              <div className="orbit-ds-type-caption">보조 상태, 짧은 표 머리글, 비활성 메타데이터에만 사용</div>
            </TypeRow>
          </div>
        </section>

        <section className="orbit-ds-section" id="components">
          <SectionHeading
            description="모든 조작은 44px 이상의 높이와 명확한 focus 상태를 갖습니다. Primary action은 화면당 하나만 둡니다."
            eyebrow="03 · Components"
            title="Product controls"
          />
          <div className="orbit-ds-component-grid">
            <Specimen code="button / action" title="Buttons">
              <div className="orbit-ds-inline">
                <OrbitButton icon={<IconSparkles size={18} stroke={1.8} />}>
                  AI 발표자료 만들기
                </OrbitButton>
                <OrbitButton icon={<IconUpload size={18} stroke={1.8} />} variant="secondary">
                  PPTX 가져오기
                </OrbitButton>
                <OrbitButton variant="quiet">초안 저장</OrbitButton>
                <OrbitButton disabled>생성 중</OrbitButton>
                <button aria-label="검색" className="orbit-ds-icon-button" type="button">
                  <IconSearch size={19} stroke={1.8} />
                </button>
              </div>
            </Specimen>

            <Specimen code="status / semantic" title="Status">
              <div className="orbit-ds-status-list">
                <OrbitStatus>초안 생성</OrbitStatus>
                <OrbitStatus tone="lilac">편집 중</OrbitStatus>
                <OrbitStatus tone="warning">리허설 중</OrbitStatus>
                <OrbitStatus tone="info">피드백 반영</OrbitStatus>
                <OrbitStatus tone="success">완료</OrbitStatus>
              </div>
            </Specimen>

            <Specimen code="segmented / start mode" title="Start mode">
              <div aria-label="시작 방법" className="orbit-ds-segmented" role="group">
                {[
                  { id: "topic", label: "주제로 시작" },
                  { id: "file", label: "자료로 시작" },
                  { id: "template", label: "템플릿" }
                ].map((mode) => (
                  <button
                    aria-pressed={startMode === mode.id}
                    className="orbit-ds-segment"
                    key={mode.id}
                    onClick={() => setStartMode(mode.id)}
                    type="button"
                  >
                    {mode.label}
                  </button>
                ))}
              </div>
            </Specimen>

            <Specimen code="field / default + invalid" title="Form fields">
              <div className="orbit-ds-form-grid">
                <label className="orbit-ds-field orbit-ds-field-wide">
                  <span>발표 주제</span>
                  <input className="orbit-ds-input" defaultValue="2026 하반기 제품 전략" />
                  <small>목적이 드러나는 구체적인 제목을 권장합니다.</small>
                </label>
                <label className="orbit-ds-field">
                  <span>발표 톤</span>
                  <select className="orbit-ds-select" defaultValue="professional">
                    <option value="professional">Professional</option>
                    <option value="friendly">Friendly</option>
                    <option value="concise">Concise</option>
                  </select>
                </label>
                <label className="orbit-ds-field">
                  <span>오류 상태</span>
                  <input aria-invalid="true" className="orbit-ds-input" defaultValue="0분" />
                  <small>발표 시간은 1분 이상이어야 합니다.</small>
                </label>
              </div>
            </Specimen>

            <Specimen code="upload / drop zone" title="Reference upload" wide>
              <div className="orbit-ds-upload">
                <IconFileUpload aria-hidden="true" size={28} stroke={1.6} />
                <div>
                  <strong>파일을 드래그하거나 클릭하여 업로드하세요.</strong>
                  <span>PDF, DOCX, PPTX, 이미지 · 최대 50MB</span>
                </div>
              </div>
            </Specimen>
          </div>
        </section>

        <section className="orbit-ds-section" id="patterns">
          <SectionHeading
            description="리스트는 하나의 표면으로 묶고, 큰 컬러 블록은 서로 다른 시작점을 분리하는 데만 사용합니다."
            eyebrow="04 · Patterns"
            title="Application patterns"
          />
          <div className="orbit-ds-table-wrap">
            <table className="orbit-ds-table">
              <thead>
                <tr>
                  <th>이름</th>
                  <th>단계</th>
                  <th>최근 수정</th>
                  <th>발표 시간</th>
                  <th>슬라이드</th>
                  <th aria-label="작업" />
                </tr>
              </thead>
              <tbody>
                {projects.map((project) => (
                  <tr key={project.title}>
                    <td>
                      <span className="orbit-ds-project-name">
                        <span className="orbit-ds-project-icon">
                          <IconPresentation size={20} stroke={1.7} />
                        </span>
                        {project.title}
                      </span>
                    </td>
                    <td>{project.status}</td>
                    <td>{project.updatedAt}</td>
                    <td>{project.duration}</td>
                    <td>{project.slides}</td>
                    <td>
                      <button aria-label={`${project.title} 열기`} className="orbit-ds-icon-button" type="button">
                        <IconArrowRight size={18} stroke={1.8} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="orbit-ds-block-grid" style={{ marginTop: 40 }}>
            <OrbitColorBlock icon={<IconWand size={32} stroke={1.6} />} tone="lilac">
              <strong>AI로 만들기</strong>
              <p>핵심 작업에는 한 화면에 하나의 라일락 면을 사용합니다.</p>
            </OrbitColorBlock>
            <OrbitColorBlock icon={<IconTemplate size={32} stroke={1.6} />} tone="lime">
              <strong>템플릿에서 시작</strong>
              <p>새로운 구조를 선택하는 보조 시작점입니다.</p>
            </OrbitColorBlock>
            <OrbitColorBlock icon={<IconUpload size={32} stroke={1.6} />} tone="cream">
              <strong>PPTX 가져오기</strong>
              <p>기존 작업을 이어오는 보조 시작점입니다.</p>
            </OrbitColorBlock>
          </div>
        </section>

        <section className="orbit-ds-section" id="tokens">
          <SectionHeading
            description="CSS custom properties는 모든 Web 화면의 기준입니다. 캔버스나 렌더러에서 값이 필요할 때는 같은 값을 내보내는 TypeScript 토큰을 사용합니다."
            eyebrow="05 · Tokens"
            title="Implementation map"
          />
          <table className="orbit-ds-token-table">
            <thead>
              <tr>
                <th>Role</th>
                <th>CSS token</th>
                <th>Rule</th>
              </tr>
            </thead>
            <tbody>
              <TokenRow rule="화면당 하나의 최우선 행동" role="Primary action" token="--orbit-ds-ink" />
              <TokenRow rule="생성·편집 같은 핵심 작업 면" role="Core workspace" token="--orbit-ds-lilac" />
              <TokenRow rule="템플릿 기반 시작점" role="Template action" token="--orbit-ds-lime" />
              <TokenRow rule="가져오기·전환 행동" role="Import action" token="--orbit-ds-cream" />
              <TokenRow rule="키보드 focus에서만 표시" role="Focus ring" token="--orbit-ds-focus" />
              <TokenRow rule="버튼·탭·상태 label" role="Pill radius" token="--orbit-ds-radius-pill" />
            </tbody>
          </table>
        </section>

        <footer className="orbit-ds-footer">
          <p>ORBIT Design System · selected visual direction · 2026-07-10</p>
          <OrbitButton icon={<IconArrowRight size={18} stroke={1.8} />} onClick={() => goToSection("foundations")}>
            처음으로
          </OrbitButton>
        </footer>
      </main>
    </div>
  );
}

function SectionHeading(props: { description: string; eyebrow: string; title: string }) {
  return (
    <header className="orbit-ds-section-heading">
      <div>
        <p className="orbit-ds-eyebrow">{props.eyebrow}</p>
        <h2>{props.title}</h2>
      </div>
      <p>{props.description}</p>
    </header>
  );
}

function TypeRow(props: { children: ReactNode; label: string }) {
  return (
    <div className="orbit-ds-type-row">
      <div className="orbit-ds-type-label">{props.label}</div>
      {props.children}
    </div>
  );
}

function Specimen(props: { children: ReactNode; code: string; title: string; wide?: boolean }) {
  return (
    <article className={`orbit-ds-specimen${props.wide ? " orbit-ds-specimen-wide" : ""}`}>
      <header className="orbit-ds-specimen-header">
        <h3>{props.title}</h3>
        <code>{props.code}</code>
      </header>
      {props.children}
    </article>
  );
}

function TokenRow(props: { role: string; rule: string; token: string }) {
  return (
    <tr>
      <td>{props.role}</td>
      <td>
        <code>{props.token}</code>
      </td>
      <td>{props.rule}</td>
    </tr>
  );
}
