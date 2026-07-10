import {
  IconArrowLeft,
  IconArrowRight,
  IconBell,
  IconChartBar,
  IconCheck,
  IconChevronDown,
  IconClock,
  IconDots,
  IconEdit,
  IconFileText,
  IconFileUpload,
  IconFolder,
  IconLayoutGrid,
  IconMicrophone,
  IconPlayerPlay,
  IconPresentation,
  IconSearch,
  IconSettings,
  IconSparkles,
  IconTemplate,
  IconUpload,
  IconUserCircle,
  IconWand
} from "@tabler/icons-react";
import { useMemo, useRef, useState, type ReactNode } from "react";
import orbitLogo from "../../assets/orbit-logo.png";
import { OrbitButton, OrbitStatus } from "../../design-system";
import { OrbitEditorMockup } from "./OrbitEditorMockup";
import { OrbitPresenterMockup, OrbitRehearsalMockup } from "./OrbitDeliveryMockups";
import { OrbitRehearsalCompleteMockup, OrbitReportDetailMockup, OrbitReportListMockup } from "./OrbitReportMockups";
import { OrbitLivePresentationMockup, OrbitLivePresenterMockup } from "./OrbitLiveMockups";
import { OrbitLoginMockup, OrbitSignupMockup } from "./OrbitAuthMockups";
import { OrbitMicrophoneCheckMockup } from "./OrbitMicrophoneCheckMockup";
import { OrbitProjectAccessMockup, OrbitProjectReportMockup } from "./OrbitProjectMockups";
import rehearsalEditorialImage from "./assets/rehearsal-editorial.png";
import "../../design-system/orbit-design-system.css";
import "./orbit-mockup.css";

export type OrbitMockupScreen = "public" | "home" | "create" | "editor" | "microphone-check" | "project-request" | "rehearsal" | "presenter" | "rehearsal-complete" | "reports" | "report" | "report-project" | "live" | "live-presenter" | "login" | "signup";

type OrbitMockupFlowProps = {
  onNavigate: (path: string) => void;
  screen: OrbitMockupScreen;
};

const mockProjects = [
  {
    title: "2026 하반기 제품 전략",
    status: "편집 중",
    tone: "lilac" as const,
    updatedAt: "2026-07-10 09:23",
    duration: "15분",
    slides: 18
  },
  {
    title: "IR Deck 시리즈 B 업데이트",
    status: "리허설 중",
    tone: "warning" as const,
    updatedAt: "2026-07-09 16:40",
    duration: "20분",
    slides: 21
  },
  {
    title: "마케팅 성과 리뷰 Q2",
    status: "피드백 반영",
    tone: "info" as const,
    updatedAt: "2026-07-08 14:12",
    duration: "10분",
    slides: 14
  },
  {
    title: "신규 서비스 론칭 계획",
    status: "초안 생성",
    tone: "neutral" as const,
    updatedAt: "2026-07-07 11:05",
    duration: "12분",
    slides: 12
  }
];

export function OrbitMockupFlow(props: OrbitMockupFlowProps) {
  if (props.screen === "public") {
    return <OrbitPublicMockup onNavigate={props.onNavigate} />;
  }
  if (props.screen === "home") {
    return <OrbitHomeMockup onNavigate={props.onNavigate} />;
  }
  if (props.screen === "editor") {
    return <OrbitEditorMockup onNavigate={props.onNavigate} />;
  }
  if (props.screen === "microphone-check") {
    return <OrbitMicrophoneCheckMockup onNavigate={props.onNavigate} />;
  }
  if (props.screen === "project-request") {
    return <OrbitProjectAccessMockup onNavigate={props.onNavigate} />;
  }
  if (props.screen === "rehearsal") {
    return <OrbitRehearsalMockup onNavigate={props.onNavigate} />;
  }
  if (props.screen === "presenter") {
    return <OrbitPresenterMockup onNavigate={props.onNavigate} />;
  }
  if (props.screen === "rehearsal-complete") {
    return <OrbitRehearsalCompleteMockup onNavigate={props.onNavigate} />;
  }
  if (props.screen === "reports") {
    return <OrbitReportListMockup onNavigate={props.onNavigate} />;
  }
  if (props.screen === "report") {
    return <OrbitReportDetailMockup onNavigate={props.onNavigate} />;
  }
  if (props.screen === "report-project") {
    return <OrbitProjectReportMockup onNavigate={props.onNavigate} />;
  }
  if (props.screen === "live") {
    return <OrbitLivePresentationMockup onNavigate={props.onNavigate} />;
  }
  if (props.screen === "live-presenter") {
    return <OrbitLivePresenterMockup onNavigate={props.onNavigate} />;
  }
  if (props.screen === "login") {
    return <OrbitLoginMockup onNavigate={props.onNavigate} />;
  }
  if (props.screen === "signup") {
    return <OrbitSignupMockup onNavigate={props.onNavigate} />;
  }
  return <OrbitCreateMockup onNavigate={props.onNavigate} />;
}

export function OrbitPublicMockup(props: Pick<OrbitMockupFlowProps, "onNavigate">) {
  function goToHome() {
    props.onNavigate("/mockup/home");
  }

  function goToLogin() {
    props.onNavigate("/mockup/login");
  }

  function goToSignup() {
    props.onNavigate("/mockup/signup");
  }

  function scrollToFlow() {
    document.getElementById("mockup-public-flow")?.scrollIntoView({ behavior: "smooth" });
  }

  return (
    <div className="orbit-mockup orbit-mockup-public">
      <MockupHeader
        mode="public"
        onLoginClick={goToLogin}
        onLogoClick={() => props.onNavigate("/mockup")}
        onPrimaryClick={goToSignup}
      />
      <main>
        <section className="mockup-public-hero">
          <div className="mockup-public-copy">
            <p className="orbit-ds-eyebrow">AI PRESENTATION WORKSPACE</p>
            <h1>생각을 발표로 바꾸는 가장 빠른 캔버스</h1>
            <p>
              아이디어 정리부터 슬라이드 생성, 리허설과 피드백까지 ORBIT이 발표의 전
              과정을 함께합니다.
            </p>
            <div className="mockup-public-actions">
              <OrbitButton icon={<IconArrowRight size={18} />} onClick={goToHome}>
                무료로 발표 만들기
              </OrbitButton>
              <OrbitButton onClick={scrollToFlow} variant="secondary">
                예시 보기
              </OrbitButton>
            </div>
          </div>

          <section aria-label="ORBIT 제품 미리보기" className="mockup-product-stage">
            <div className="mockup-stage-flow">
              <StageLabel icon={<IconSparkles size={19} />} label="AI 아이디어 정리" />
              <IconArrowRight aria-hidden="true" size={20} />
              <StageLabel icon={<IconPresentation size={19} />} label="슬라이드 자동 생성" />
              <IconArrowRight aria-hidden="true" size={20} />
              <StageLabel icon={<IconMicrophone size={19} />} label="리허설 & 피드백" />
            </div>
            <ProductPreview />
          </section>
        </section>

        <section className="mockup-process-strip" id="mockup-public-flow">
          <ProcessStep icon={<IconSparkles size={24} />} number="1" title="생성">
            아이디어를 정리하고 슬라이드 초안을 만들어요.
          </ProcessStep>
          <ProcessStep icon={<IconEdit size={24} />} number="2" title="편집">
            문장과 디자인을 다듬어 나만의 발표로 완성해요.
          </ProcessStep>
          <ProcessStep icon={<IconMicrophone size={24} />} number="3" title="리허설">
            발표를 연습하고 AI 피드백으로 더 자신 있게 발표해요.
          </ProcessStep>
        </section>

        <section className="mockup-public-support">
          <article className="mockup-support-card mockup-support-lime">
            <div>
              <IconUpload size={30} stroke={1.6} />
              <h2>자료만 올리면 초안부터 시작</h2>
              <p>PDF, DOCX, PPTX, 이미지를 올리면 AI가 핵심을 추출해 구성을 제안합니다.</p>
              <button type="button" onClick={goToHome}>
                자료로 시작 <IconArrowRight size={18} />
              </button>
            </div>
            <div className="mockup-file-stack" aria-label="지원 파일 예시">
              <IconFileText size={28} />
              <span>제품 전략 보고서.pdf</span>
              <small>2.4MB · 분석 준비됨</small>
            </div>
          </article>

          <article className="mockup-support-card mockup-support-cream">
            <div className="mockup-support-copy">
              <IconMicrophone size={30} stroke={1.6} />
              <h2>발표 흐름까지 연습</h2>
              <p>발음, 속도, 구성에 대한 AI 피드백으로 완성도를 높여보세요.</p>
              <button type="button" onClick={goToHome}>
                리허설 보기 <IconArrowRight size={18} />
              </button>
            </div>
            <img alt="노트북으로 ORBIT 리허설 피드백을 확인하는 발표자" src={rehearsalEditorialImage} />
          </article>
        </section>

        <section className="mockup-public-final">
          <span>더 빠르고 완성도 높은 발표를 시작하세요.</span>
          <div>
            <OrbitButton onClick={goToLogin} variant="secondary">
              로그인
            </OrbitButton>
            <OrbitButton icon={<IconArrowRight size={18} />} onClick={goToSignup}>
              무료로 시작
            </OrbitButton>
          </div>
        </section>
      </main>
    </div>
  );
}

export function OrbitHomeMockup(props: Pick<OrbitMockupFlowProps, "onNavigate">) {
  const [query, setQuery] = useState("");
  const [stage, setStage] = useState("all");
  const [notice, setNotice] = useState("");
  const visibleProjects = useMemo(() => {
    return mockProjects.filter((project) => {
      const matchesQuery = project.title.toLocaleLowerCase("ko").includes(query.toLocaleLowerCase("ko"));
      const matchesStage = stage === "all" || project.status === stage;
      return matchesQuery && matchesStage;
    });
  }, [query, stage]);

  function goToCreate() {
    props.onNavigate("/mockup/create");
  }

  return (
    <div className="orbit-mockup orbit-mockup-home">
      <MockupHeader mode="app" onLogoClick={() => props.onNavigate("/mockup/home")} />
      <main className="mockup-app-main">
        <section className="mockup-home-heading">
          <div>
            <p className="orbit-ds-eyebrow">YOUR WORKSPACE</p>
            <h1>김지윤님, 다음 발표를 이어가세요.</h1>
            <p>만들고, 편집하고, 연습하는 흐름을 한 곳에서 관리하세요.</p>
          </div>
          <OrbitButton icon={<IconSparkles size={20} />} onClick={goToCreate}>
            AI 발표자료 만들기 <IconArrowRight size={18} />
          </OrbitButton>
        </section>

        <section className="mockup-continue-strip">
          <span className="mockup-project-mark">
            <IconPresentation size={21} />
          </span>
          <div>
            <strong>2026 하반기 제품 전략</strong>
            <span>마지막 수정 2026.07.10 09:23</span>
          </div>
          <OrbitStatus tone="lilac">편집 중</OrbitStatus>
          <OrbitButton
            icon={<IconArrowRight size={18} />}
            onClick={() => props.onNavigate("/mockup/editor")}
            variant="secondary"
          >
            계속 편집
          </OrbitButton>
        </section>

        {notice ? (
          <div className="mockup-inline-notice" role="status">
            <IconCheck size={17} />
            {notice}
            <button aria-label="알림 닫기" onClick={() => setNotice("")} type="button">
              닫기
            </button>
          </div>
        ) : null}

        <section className="mockup-project-surface">
          <div className="mockup-project-toolbar">
            <label className="mockup-search-field">
              <IconSearch size={19} />
              <input
                aria-label="프로젝트 검색"
                onChange={(event) => setQuery(event.target.value)}
                placeholder="프로젝트 검색"
                value={query}
              />
            </label>
            <label className="mockup-filter-field">
              <span>단계</span>
              <select aria-label="프로젝트 단계" onChange={(event) => setStage(event.target.value)} value={stage}>
                <option value="all">모든 단계</option>
                <option value="편집 중">편집 중</option>
                <option value="리허설 중">리허설 중</option>
                <option value="피드백 반영">피드백 반영</option>
                <option value="초안 생성">초안 생성</option>
              </select>
              <IconChevronDown aria-hidden="true" size={17} />
            </label>
            <button aria-label="프로젝트 보기 설정" className="orbit-ds-icon-button" type="button">
              <IconSettings size={19} />
            </button>
          </div>
          <div className="mockup-project-table-wrap">
            <table className="mockup-project-table">
              <thead>
                <tr>
                  <th>이름</th>
                  <th>단계</th>
                  <th>최근 수정</th>
                  <th>발표 시간</th>
                  <th>슬라이드</th>
                  <th>작업</th>
                </tr>
              </thead>
              <tbody>
                {visibleProjects.map((project, index) => (
                  <tr key={project.title}>
                    <td>
                      <span className={`mockup-table-thumb mockup-table-thumb-${index + 1}`}>
                        <IconPresentation size={19} />
                      </span>
                      <strong>{project.title}</strong>
                    </td>
                    <td>
                      <OrbitStatus tone={project.tone}>{project.status}</OrbitStatus>
                    </td>
                    <td>{project.updatedAt}</td>
                    <td>{project.duration}</td>
                    <td>{project.slides}</td>
                    <td>
                      <div className="mockup-row-actions">
                        <button
                          aria-label={`${project.title} 편집`}
                          onClick={() => props.onNavigate("/mockup/editor")}
                          type="button"
                        >
                          <IconEdit size={18} />
                        </button>
                        <button
                          aria-label={`${project.title} 리허설`}
                          onClick={() => setNotice(`${project.title} 리허설을 시작하는 흐름입니다.`)}
                          type="button"
                        >
                          <IconMicrophone size={18} />
                        </button>
                        <button aria-label={`${project.title} 더보기`} type="button">
                          <IconDots size={18} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {visibleProjects.length === 0 ? (
              <div className="mockup-empty-state">
                <IconSearch size={24} />
                <strong>조건에 맞는 프로젝트가 없습니다.</strong>
                <button
                  onClick={() => {
                    setQuery("");
                    setStage("all");
                  }}
                  type="button"
                >
                  필터 초기화
                </button>
              </div>
            ) : null}
          </div>
        </section>

        <section className="mockup-home-start-grid">
          <button className="mockup-start-block mockup-start-lime" onClick={goToCreate} type="button">
            <IconTemplate size={32} stroke={1.6} />
            <span>
              <strong>템플릿에서 시작</strong>
              <small>검증된 구조로 빠르게 시작하세요.</small>
            </span>
            <IconArrowRight size={23} />
          </button>
          <button className="mockup-start-block mockup-start-cream" onClick={goToCreate} type="button">
            <IconUpload size={32} stroke={1.6} />
            <span>
              <strong>PPTX 가져오기</strong>
              <small>기존 파일을 업로드해 AI로 개선하세요.</small>
            </span>
            <IconArrowRight size={23} />
          </button>
        </section>
      </main>
    </div>
  );
}

type CreatePhase = "input" | "review" | "done";

export function OrbitCreateMockup(props: Pick<OrbitMockupFlowProps, "onNavigate">) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [phase, setPhase] = useState<CreatePhase>("input");
  const [startMode, setStartMode] = useState("topic");
  const [topic, setTopic] = useState("2026 하반기 제품 전략");
  const [message, setMessage] = useState(
    "고객 가치 중심의 제품 전략으로 지속 가능한 성장을 가속화합니다.\n신제품 2종 출시, 핵심 시장 확장, 데이터 기반 의사결정 체계 고도화를 통해\n시장 점유율 15% 향상과 ARR 30% 성장을 달성하겠습니다."
  );
  const [fileName, setFileName] = useState("");
  const [tone, setTone] = useState("Professional");
  const [duration, setDuration] = useState("10분");
  const [slides, setSlides] = useState("6–8장");

  if (phase === "done") {
    return (
      <div className="orbit-mockup orbit-mockup-create">
        <MockupHeader mode="app" onLogoClick={() => props.onNavigate("/mockup/home")} />
        <main className="mockup-create-success">
          <span className="mockup-success-icon">
            <IconCheck size={34} />
          </span>
          <p className="orbit-ds-eyebrow">GENERATION COMPLETE</p>
          <h1>발표자료 초안이 준비됐어요.</h1>
          <p>8장의 슬라이드와 발표 스크립트, 리허설 가이드를 만들었습니다.</p>
          <div className="mockup-success-summary">
            <span>
              <IconPresentation size={22} />
              <strong>{topic}</strong>
            </span>
            <span>8장</span>
            <span>{duration}</span>
            <OrbitStatus tone="success">생성 완료</OrbitStatus>
          </div>
          <div className="mockup-success-actions">
            <OrbitButton onClick={() => props.onNavigate("/mockup/home")} variant="secondary">
              프로젝트 허브로
            </OrbitButton>
            <OrbitButton icon={<IconArrowRight size={18} />} onClick={() => props.onNavigate("/mockup/editor")}>
              에디터에서 열기
            </OrbitButton>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="orbit-mockup orbit-mockup-create">
      <MockupHeader mode="app" onLogoClick={() => props.onNavigate("/mockup/home")} />
      <main className="mockup-create-main">
        <div className="mockup-create-breadcrumb">
          <button onClick={() => props.onNavigate("/mockup/home")} type="button">
            <IconArrowLeft size={17} /> 홈
          </button>
          <span>/</span>
          <strong>새 발표자료</strong>
        </div>

        <section className="mockup-create-heading">
          <div>
            <p className="orbit-ds-eyebrow">AI PRESENTATION</p>
            <h1>{phase === "review" ? "이 구성으로 만들까요?" : "어떤 발표를 만들까요?"}</h1>
            <p>
              {phase === "review"
                ? "핵심 설정을 확인한 뒤 발표자료 생성을 시작하세요."
                : "주제와 핵심 메시지를 입력하면 AI가 최적의 발표자료를 만들어드려요."}
            </p>
          </div>
          <CreateSteps phase={phase} />
        </section>

        {phase === "review" ? (
          <CreateReview
            duration={duration}
            fileName={fileName}
            message={message}
            onBack={() => setPhase("input")}
            onGenerate={() => setPhase("done")}
            slides={slides}
            tone={tone}
            topic={topic}
          />
        ) : (
          <section className="mockup-create-workspace">
            <div className="mockup-create-content">
              <fieldset className="mockup-start-mode">
                <legend>시작 방법 선택</legend>
                <div>
                  {[
                    { id: "topic", icon: <IconSparkles size={19} />, label: "주제로 시작" },
                    { id: "file", icon: <IconFolder size={19} />, label: "자료로 시작" },
                    { id: "template", icon: <IconLayoutGrid size={19} />, label: "템플릿으로 시작" }
                  ].map((mode) => (
                    <button
                      aria-pressed={startMode === mode.id}
                      key={mode.id}
                      onClick={() => setStartMode(mode.id)}
                      type="button"
                    >
                      {mode.icon}
                      {mode.label}
                    </button>
                  ))}
                </div>
              </fieldset>

              <label className="mockup-create-field">
                <span>발표 주제 <b>*</b></span>
                <input onChange={(event) => setTopic(event.target.value)} value={topic} />
              </label>

              <label className="mockup-create-field">
                <span>핵심 메시지 <b>*</b></span>
                <textarea onChange={(event) => setMessage(event.target.value)} value={message} />
                <small>{message.length}/1,000</small>
              </label>

              <section className="mockup-create-upload">
                <div>
                  <span>참고자료 추가 <small>(선택)</small></span>
                  <button onClick={() => fileInputRef.current?.click()} type="button">
                    <IconFileUpload size={30} />
                    <strong>{fileName || "파일을 드래그하거나 클릭하여 업로드하세요"}</strong>
                    <small>{fileName ? "파일이 선택되었습니다." : "PDF, DOCX, PPTX, 이미지 · 최대 50MB"}</small>
                  </button>
                  <input
                    hidden
                    onChange={(event) => setFileName(event.target.files?.[0]?.name ?? "")}
                    ref={fileInputRef}
                    type="file"
                  />
                </div>
                <p>
                  <IconCheck size={16} /> PPTX를 첨부하면 기존 디자인을 참고할 수 있어요.
                </p>
              </section>
            </div>

            <aside className="mockup-create-settings">
              <h2>발표 설정</h2>
              <CreateSelect icon={<IconUserCircle size={25} />} label="발표 톤" onChange={setTone} value={tone}>
                <option>Professional</option>
                <option>Friendly</option>
                <option>Concise</option>
              </CreateSelect>
              <CreateSelect icon={<IconClock size={25} />} label="발표 시간" onChange={setDuration} value={duration}>
                <option>5분</option>
                <option>10분</option>
                <option>15분</option>
                <option>20분</option>
              </CreateSelect>
              <CreateSelect icon={<IconPresentation size={25} />} label="슬라이드" onChange={setSlides} value={slides}>
                <option>4–6장</option>
                <option>6–8장</option>
                <option>8–12장</option>
              </CreateSelect>
              <div className="mockup-create-note">
                <IconFileText size={20} />
                <span>슬라이드와 함께 발표 스크립트, 스피치 코칭 포인트까지 준비해 드려요.</span>
              </div>
            </aside>
          </section>
        )}

        {phase === "input" ? (
          <footer className="mockup-create-actions">
            <button type="button">초안 저장</button>
            <OrbitButton
              disabled={!topic.trim() || !message.trim()}
              icon={<IconSparkles size={18} />}
              onClick={() => setPhase("review")}
            >
              구성 확인
            </OrbitButton>
          </footer>
        ) : null}
      </main>
    </div>
  );
}

function MockupHeader(props: {
  mode: "public" | "app";
  onLoginClick?: () => void;
  onLogoClick: () => void;
  onPrimaryClick?: () => void;
}) {
  return (
    <header className="mockup-header">
      <button aria-label="ORBIT 목업 홈" className="mockup-logo-button" onClick={props.onLogoClick} type="button">
        <img alt="ORBIT" src={orbitLogo} />
      </button>
      <nav aria-label={props.mode === "public" ? "공개 navigation" : "제품 navigation"}>
        {(props.mode === "public"
          ? ["제품", "활용 방법", "리허설", "템플릿"]
          : ["홈", "프로젝트", "리허설", "리포트"]
        ).map((item, index) => (
          <button aria-current={index === 0 ? "page" : undefined} key={item} type="button">
            {item}
          </button>
        ))}
      </nav>
      {props.mode === "public" ? (
        <div className="mockup-header-public-actions">
          <button onClick={props.onLoginClick} type="button">로그인</button>
          <OrbitButton onClick={props.onPrimaryClick}>무료로 시작</OrbitButton>
        </div>
      ) : (
        <div className="mockup-header-app-actions">
          <label>
            <IconSearch size={18} />
            <input aria-label="전체 검색" placeholder="검색" />
          </label>
          <button aria-label="알림" type="button"><IconBell size={20} /></button>
          <span><IconUserCircle size={28} /> 김지윤 <IconChevronDown size={16} /></span>
        </div>
      )}
    </header>
  );
}

function StageLabel(props: { icon: ReactNode; label: string }) {
  return (
    <span>
      <i>{props.icon}</i>
      <strong>{props.label}</strong>
    </span>
  );
}

function ProductPreview() {
  return (
    <div className="mockup-product-preview">
      <div className="mockup-preview-toolbar">
        <img alt="ORBIT" src={orbitLogo} />
        <span />
        <IconPlayerPlay size={15} />
        <IconFileText size={15} />
        <IconChartBar size={15} />
        <IconDots size={16} />
      </div>
      <div className="mockup-preview-body">
        <aside className="mockup-preview-outline">
          <strong>AI 아이디어 정리</strong>
          <small>핵심 메시지</small>
          <p>고객 가치와 시장 성장에 집중합니다.</p>
          <small>발표 개요</small>
          <ol><li>시장 변화</li><li>제품 전략</li><li>실행 계획</li></ol>
        </aside>
        <aside className="mockup-preview-slides">
          {[1, 2, 3, 4, 5].map((slide) => <span key={slide}>{slide}</span>)}
        </aside>
        <section className="mockup-preview-canvas">
          <span className="mockup-preview-date">2026.07.10</span>
          <h2>2026 하반기<br />제품 전략</h2>
          <p>고객 가치 중심의 성장 가속화</p>
          <div className="mockup-preview-stat-row">
            <span><strong>15%</strong>시장 점유율</span>
            <span><strong>30%</strong>ARR 성장</span>
          </div>
        </section>
        <aside className="mockup-preview-feedback">
          <strong>리허설</strong>
          <small>발표 시간</small>
          <b>05:23</b>
          <progress max="10" value="5" />
          <strong>AI 피드백</strong>
          <p>도입부가 명확해요.</p>
          <p>핵심 수치를 강조하세요.</p>
        </aside>
      </div>
    </div>
  );
}

function ProcessStep(props: { children: ReactNode; icon: ReactNode; number: string; title: string }) {
  return (
    <article>
      <span>{props.icon}</span>
      <div><strong>{props.number}. {props.title}</strong><p>{props.children}</p></div>
    </article>
  );
}

function CreateSteps(props: { phase: CreatePhase }) {
  const current = props.phase === "input" ? 1 : 2;
  return (
    <ol className="mockup-create-steps" aria-label="생성 단계">
      {["내용 입력", "구성 확인", "생성"].map((label, index) => (
        <li className={index + 1 <= current ? "active" : ""} key={label}>
          <span>{index + 1}</span>{label}
        </li>
      ))}
    </ol>
  );
}

function CreateSelect(props: {
  children: ReactNode;
  icon: ReactNode;
  label: string;
  onChange: (value: string) => void;
  value: string;
}) {
  return (
    <label className="mockup-create-select">
      {props.icon}<span>{props.label}</span>
      <select onChange={(event) => props.onChange(event.target.value)} value={props.value}>{props.children}</select>
      <IconChevronDown aria-hidden="true" size={17} />
    </label>
  );
}

function CreateReview(props: {
  duration: string;
  fileName: string;
  message: string;
  onBack: () => void;
  onGenerate: () => void;
  slides: string;
  tone: string;
  topic: string;
}) {
  return (
    <section className="mockup-review-card">
      <div className="mockup-review-main">
        <span className="mockup-review-icon"><IconWand size={28} /></span>
        <p className="orbit-ds-eyebrow">PRESENTATION BRIEF</p>
        <h2>{props.topic}</h2>
        <p>{props.message}</p>
        {props.fileName ? <span className="mockup-review-file"><IconFileText size={18} />{props.fileName}</span> : null}
      </div>
      <dl className="mockup-review-settings">
        <div><dt>발표 톤</dt><dd>{props.tone}</dd></div>
        <div><dt>발표 시간</dt><dd>{props.duration}</dd></div>
        <div><dt>슬라이드</dt><dd>{props.slides}</dd></div>
        <div><dt>생성 항목</dt><dd>슬라이드 · 스크립트 · 리허설 가이드</dd></div>
      </dl>
      <footer>
        <OrbitButton icon={<IconArrowLeft size={18} />} onClick={props.onBack} variant="secondary">내용 수정</OrbitButton>
        <OrbitButton icon={<IconSparkles size={18} />} onClick={props.onGenerate}>이 구성으로 생성</OrbitButton>
      </footer>
    </section>
  );
}
