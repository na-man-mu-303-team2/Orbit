import { IconArrowLeft, IconCheck, IconEdit, IconEye, IconEyeOff, IconMicrophone, IconPresentation, IconSparkles } from "@tabler/icons-react";
import { useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent, type ReactNode } from "react";
import orbitLogo from "../../assets/orbit-logo.png";
import {
  OrbitButton,
  OrbitField,
  OrbitIconButton,
  OrbitInput
} from "../../design-system";
import "./orbit-auth-page.css";

type Navigate = (path: string) => void;

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
