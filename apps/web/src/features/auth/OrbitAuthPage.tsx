import {
  IconArrowLeft,
  IconArrowRight,
  IconCheck,
  IconEdit,
  IconEye,
  IconEyeOff,
  IconFileText,
  IconMicrophone,
  IconPresentation,
  IconSparkles,
  IconUpload
} from "@tabler/icons-react";
import { useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent, type ReactNode } from "react";
import orbitLogo from "../../assets/orbit-logo.png";
import rehearsalEditorialImage from "../mockups/assets/rehearsal-editorial.png";
import {
  OrbitButton,
  OrbitField,
  OrbitIconButton,
  OrbitInput
} from "../../design-system";
import "./orbit-auth-page.css";

type Navigate = (path: string) => void;

export function OrbitPublicLandingPage(props: { onNavigate: Navigate }) {
  function scrollToFlow() {
    document.getElementById("orbit-public-flow")?.scrollIntoView({ behavior: "smooth" });
  }

  return (
    <div className="orbit-public-page">
      <header className="orbit-public-header">
        <button aria-label="ORBIT 공개 화면" onClick={() => window.scrollTo(0, 0)} type="button">
          <img alt="ORBIT" src={orbitLogo} />
        </button>
        <nav aria-label="공개 메뉴">
          <button onClick={scrollToFlow} type="button">제품</button>
          <button onClick={scrollToFlow} type="button">활용 방법</button>
          <button onClick={scrollToFlow} type="button">리허설</button>
          <button onClick={scrollToFlow} type="button">템플릿</button>
        </nav>
        <div>
          <button onClick={() => props.onNavigate("/login")} type="button">로그인</button>
          <OrbitButton onClick={() => props.onNavigate("/signup")}>무료로 시작</OrbitButton>
        </div>
      </header>

      <main>
        <section className="orbit-public-hero">
          <div className="orbit-public-copy">
            <p className="orbit-ds-eyebrow">AI PRESENTATION WORKSPACE</p>
            <h1>생각을 발표로 바꾸는 가장 빠른 캔버스</h1>
            <p>아이디어 정리부터 슬라이드 생성, 리허설과 피드백까지 ORBIT이 발표의 전 과정을 함께합니다.</p>
            <div className="orbit-public-actions">
              <OrbitButton icon={<IconArrowRight aria-hidden="true" size={18} />} onClick={() => props.onNavigate("/signup")}>무료로 발표 만들기</OrbitButton>
              <OrbitButton onClick={scrollToFlow} variant="secondary">예시 보기</OrbitButton>
            </div>
          </div>
          <ProductStage />
        </section>

        <section className="orbit-public-process" id="orbit-public-flow">
          <ProcessStep icon={<IconSparkles aria-hidden="true" size={24} />} number="1" title="생성">아이디어를 정리하고 슬라이드 초안을 만들어요.</ProcessStep>
          <ProcessStep icon={<IconEdit aria-hidden="true" size={24} />} number="2" title="편집">문장과 디자인을 다듬어 나만의 발표로 완성해요.</ProcessStep>
          <ProcessStep icon={<IconMicrophone aria-hidden="true" size={24} />} number="3" title="리허설">발표를 연습하고 AI 피드백으로 더 자신 있게 발표해요.</ProcessStep>
        </section>

        <section className="orbit-public-support">
          <article className="orbit-public-support-card lime">
            <div>
              <IconUpload aria-hidden="true" size={30} stroke={1.6} />
              <h2>자료만 올리면 초안부터 시작</h2>
              <p>PDF, DOCX, PPTX, 이미지를 올리면 AI가 핵심을 추출해 구성을 제안합니다.</p>
              <button onClick={() => props.onNavigate("/signup")} type="button">자료로 시작 <IconArrowRight aria-hidden="true" size={18} /></button>
            </div>
            <div aria-label="지원 파일 예시" className="orbit-public-file-stack">
              <IconFileText aria-hidden="true" size={28} />
              <span>제품 전략 보고서.pdf</span>
              <small>2.4MB · 분석 준비됨</small>
            </div>
          </article>
          <article className="orbit-public-support-card cream">
            <div className="orbit-public-support-copy">
              <IconMicrophone aria-hidden="true" size={30} stroke={1.6} />
              <h2>발표 흐름까지 연습</h2>
              <p>발음, 속도, 구성에 대한 AI 피드백으로 완성도를 높여보세요.</p>
              <button onClick={() => props.onNavigate("/signup")} type="button">리허설 보기 <IconArrowRight aria-hidden="true" size={18} /></button>
            </div>
            <img alt="노트북으로 ORBIT 리허설 피드백을 확인하는 발표자" src={rehearsalEditorialImage} />
          </article>
        </section>

        <section className="orbit-public-final">
          <span>더 빠르고 완성도 높은 발표를 시작하세요.</span>
          <div>
            <OrbitButton onClick={() => props.onNavigate("/login")} variant="secondary">로그인</OrbitButton>
            <OrbitButton icon={<IconArrowRight aria-hidden="true" size={18} />} onClick={() => props.onNavigate("/signup")}>무료로 시작</OrbitButton>
          </div>
        </section>
      </main>
    </div>
  );
}

export function OrbitAuthPage(props: {
  isAuthenticated: boolean;
  mode: "login" | "register";
  onNavigate: Navigate;
}) {
  const queryClient = useQueryClient();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const isRegister = props.mode === "register";

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isSubmitting) return;

    setError("");
    setIsSubmitting(true);
    try {
      await submitOrbitAuth({ email, mode: props.mode, password });

      await queryClient.invalidateQueries({ queryKey: ["auth", "me"] });
      props.onNavigate("/");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : isRegister ? "회원가입에 실패했습니다." : "로그인에 실패했습니다.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="orbit-auth-page">
      <aside className="orbit-auth-brand-panel">
        <button aria-label="ORBIT 공개 화면" onClick={() => props.onNavigate("/")} type="button"><IconArrowLeft aria-hidden="true" className="orbit-auth-back" size={18} /><img alt="ORBIT" src={orbitLogo} /></button>
        <div className="orbit-auth-brand-copy"><p className="orbit-ds-eyebrow">AI PRESENTATION WORKSPACE</p><h1>생각부터<br />발표 순간까지.</h1><p>만들고, 편집하고, 연습하는 모든 흐름을 ORBIT 하나로 이어보세요.</p></div>
        <ol className="orbit-auth-benefits">
          <AuthBenefit icon={<IconSparkles aria-hidden="true" size={19} />} title="AI로 빠르게 시작">아이디어와 자료를 발표 구성으로 정리해요.</AuthBenefit>
          <AuthBenefit icon={<IconEdit aria-hidden="true" size={19} />} title="한눈에 편집">콘텐츠와 디자인을 한 캔버스에서 다듬어요.</AuthBenefit>
          <AuthBenefit icon={<IconMicrophone aria-hidden="true" size={19} />} title="발표까지 자신 있게">리허설과 실전 발표 흐름을 함께 준비해요.</AuthBenefit>
        </ol>
        <div className="orbit-auth-brand-note"><IconPresentation aria-hidden="true" size={20} /><span>생성부터 리허설까지<br /><strong>하나의 작업 흐름으로 연결됩니다.</strong></span></div>
      </aside>

      <main className="orbit-auth-form-panel">
        <div className="orbit-auth-form-card">
          <header className="orbit-auth-form-header">
            <p className="orbit-ds-eyebrow">{isRegister ? "START WITH ORBIT" : "WELCOME BACK"}</p>
            <h1>{isRegister ? "첫 발표를 시작해 볼까요?" : "다시 만나서 반가워요."}</h1>
            <p>{isRegister ? "계정을 만들고 아이디어를 완성도 높은 발표로 바꿔보세요." : "작업하던 발표자료와 리허설 기록을 이어서 확인하세요."}</p>
          </header>

          {props.isAuthenticated ? (
            <div className="orbit-auth-signed-in" role="status">
              <IconCheck aria-hidden="true" size={20} />
              <div><strong>이미 로그인되어 있습니다.</strong><span>현재 계정의 작업 공간으로 이동할 수 있어요.</span></div>
              <OrbitButton onClick={() => props.onNavigate("/")}>작업 공간으로 이동</OrbitButton>
            </div>
          ) : (
            <form className="orbit-auth-form" onSubmit={handleSubmit}>
              <OrbitField id="orbit-auth-email" label="이메일">
                <OrbitInput autoComplete="email" onChange={(event) => setEmail(event.currentTarget.value)} placeholder="name@company.com" required type="email" value={email} />
              </OrbitField>
              <div className="orbit-auth-password-field">
                <OrbitField hint={isRegister ? "8자 이상 입력해 주세요." : undefined} id="orbit-auth-password" label="비밀번호">
                  <OrbitInput autoComplete={isRegister ? "new-password" : "current-password"} minLength={8} onChange={(event) => setPassword(event.currentTarget.value)} placeholder="비밀번호를 입력하세요" required type={showPassword ? "text" : "password"} value={password} />
                </OrbitField>
                <OrbitIconButton aria-label={showPassword ? "비밀번호 숨기기" : "비밀번호 표시"} onClick={() => setShowPassword((current) => !current)} variant="plain">{showPassword ? <IconEyeOff aria-hidden="true" size={18} /> : <IconEye aria-hidden="true" size={18} />}</OrbitIconButton>
              </div>
              {error ? <p className="orbit-auth-error" role="alert">{error}</p> : null}
              <OrbitButton className="orbit-auth-submit" disabled={isSubmitting} type="submit">{isSubmitting ? isRegister ? "가입 중..." : "로그인 중..." : isRegister ? "무료로 시작하기" : "로그인"}</OrbitButton>
            </form>
          )}

          <p className="orbit-auth-switch-copy">{isRegister ? "이미 계정이 있나요?" : "아직 ORBIT 계정이 없나요?"}<button onClick={() => props.onNavigate(isRegister ? "/login" : "/signup")} type="button">{isRegister ? "로그인" : "회원가입"}</button></p>
        </div>
        <p className="orbit-auth-copyright">© 2026 ORBIT · 발표의 모든 순간을 연결합니다.</p>
      </main>
    </div>
  );
}

function ProductStage() {
  return (
    <section aria-label="ORBIT 제품 미리보기" className="orbit-public-stage">
      <div className="orbit-public-stage-flow"><span><IconSparkles aria-hidden="true" size={18} />AI 아이디어 정리</span><IconArrowRight aria-hidden="true" size={18} /><span><IconPresentation aria-hidden="true" size={18} />슬라이드 자동 생성</span><IconArrowRight aria-hidden="true" size={18} /><span><IconMicrophone aria-hidden="true" size={18} />리허설 &amp; 피드백</span></div>
      <div className="orbit-public-product-preview">
        <header><img alt="ORBIT" src={orbitLogo} /><IconFileText aria-hidden="true" size={16} /></header>
        <aside><strong>AI 아이디어 정리</strong><small>핵심 메시지</small><p>고객 가치와 시장 성장에 집중합니다.</p><small>발표 개요</small><ol><li>시장 변화</li><li>제품 전략</li><li>실행 계획</li></ol></aside>
        <aside aria-label="슬라이드 목록" className="orbit-public-preview-slides">{[1, 2, 3, 4, 5].map((slide) => <span key={slide}>{slide}</span>)}</aside>
        <section><span>2026.07.10</span><h2>2026 하반기<br />제품 전략</h2><p>고객 가치 중심의 성장 가속화</p><div><b>15%<small>시장 점유율</small></b><b>30%<small>ARR 성장</small></b></div></section>
        <aside><strong>리허설</strong><small>발표 시간</small><b>05:23</b><progress max="10" value="5" /><strong>AI 피드백</strong><p>도입부가 명확해요.</p><p>핵심 수치를 강조하세요.</p></aside>
      </div>
    </section>
  );
}

function ProcessStep(props: { children: ReactNode; icon: ReactNode; number: string; title: string }) {
  return <article><span>{props.icon}</span><div><strong>{props.number}. {props.title}</strong><p>{props.children}</p></div></article>;
}

function AuthBenefit(props: { children: ReactNode; icon: ReactNode; title: string }) {
  return <li><span>{props.icon}</span><div><strong>{props.title}</strong><small>{props.children}</small></div></li>;
}

async function readAuthError(response: Response) {
  const text = await response.text();
  if (!text) return "인증 요청에 실패했습니다.";
  try {
    const body = JSON.parse(text) as { message?: unknown };
    if (typeof body.message === "string") return body.message;
    if (Array.isArray(body.message)) return body.message.filter((item): item is string => typeof item === "string").join(", ");
  } catch {
    return text;
  }
  return "인증 요청에 실패했습니다.";
}

export async function submitOrbitAuth(input: {
  email: string;
  fetcher?: typeof fetch;
  mode: "login" | "register";
  password: string;
}) {
  const fetcher = input.fetcher ?? fetch;
  const response = await fetcher(`/api/v1/auth/${input.mode}`, {
    body: JSON.stringify({ email: input.email, password: input.password }),
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    method: "POST"
  });
  if (!response.ok) throw new Error(await readAuthError(response));
}
