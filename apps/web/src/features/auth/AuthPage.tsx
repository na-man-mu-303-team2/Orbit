import { IconArrowLeft, IconCheck, IconEye, IconEyeOff } from "@tabler/icons-react";
import { useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import orbitSymbol from "../../assets/orbit-symbol-v2.png";
import { GradientButton } from "../../components/ui";
import {
  OrbitButton,
  OrbitField,
  OrbitIconButton,
  OrbitInput
} from "../../design-system";
import "../../styles/tokens.css";
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
      <header className="orbit-auth-header">
        <div className="orbit-auth-header-inner">
          <button
            aria-label="ORBIT 공개 화면으로 돌아가기"
            className="orbit-auth-home"
            onClick={() => props.onNavigate("/")}
            type="button"
          >
            <IconArrowLeft aria-hidden="true" size={18} />
            <img alt="" aria-hidden="true" src={orbitSymbol} />
            <span>ORBIT</span>
          </button>
        </div>
      </header>

      <main className="orbit-auth-form-panel">
        <div className="orbit-auth-form-card">
          <header className="orbit-auth-form-header">
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
              <GradientButton className="orbit-auth-submit" disabled={isSubmitting} type="submit">{isSubmitting ? isRegister ? "가입 중..." : "로그인 중..." : isRegister ? "무료로 시작하기" : "로그인"}</GradientButton>
            </form>
          )}

          <p className="orbit-auth-switch-copy">{isRegister ? "이미 계정이 있나요?" : "아직 ORBIT 계정이 없나요?"}<button onClick={() => props.onNavigate(isRegister ? "/login" : "/signup")} type="button">{isRegister ? "로그인" : "회원가입"}</button></p>
        </div>
        <p className="orbit-auth-copyright">© 2026 ORBIT · 발표의 모든 순간을 연결합니다.</p>
      </main>
    </div>
  );
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
