import {
  IconArrowLeft,
  IconBrandGoogle,
  IconCheck,
  IconEdit,
  IconEye,
  IconEyeOff,
  IconLock,
  IconMail,
  IconMicrophone,
  IconPresentation,
  IconSparkles,
  IconUser
} from "@tabler/icons-react";
import { useState, type FormEvent, type ReactNode } from "react";
import orbitLogo from "./assets/orbit-logo-selected.png";
import { OrbitButton } from "../../components/ui";
import "./orbit-auth-mockups.css";

type AuthMockupProps = {
  onNavigate: (path: string) => void;
};

export function OrbitLoginMockup(props: AuthMockupProps) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [remember, setRemember] = useState(true);
  const [error, setError] = useState("");

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!email.trim() || !password.trim()) {
      setError("이메일과 비밀번호를 모두 입력해 주세요.");
      return;
    }
    setError("");
    props.onNavigate("/mockup/home");
  }

  return (
    <AuthShell onNavigate={props.onNavigate}>
      <AuthFormHeader eyebrow="WELCOME BACK" title="다시 만나서 반가워요.">
        작업하던 발표자료와 리허설 기록을 이어서 확인하세요.
      </AuthFormHeader>

      <button className="auth-social-button" onClick={() => props.onNavigate("/mockup/home")} type="button"><IconBrandGoogle size={19} />Google로 계속하기</button>
      <AuthDivider />

      <form className="auth-form" noValidate onSubmit={handleSubmit}>
        <AuthField icon={<IconMail size={18} />} label="이메일">
          <input autoComplete="email" aria-label="이메일" onChange={(event) => setEmail(event.currentTarget.value)} placeholder="name@company.com" type="email" value={email} />
        </AuthField>
        <AuthField icon={<IconLock size={18} />} label="비밀번호">
          <input autoComplete="current-password" aria-label="비밀번호" onChange={(event) => setPassword(event.currentTarget.value)} placeholder="비밀번호를 입력하세요" type={showPassword ? "text" : "password"} value={password} />
          <button aria-label={showPassword ? "비밀번호 숨기기" : "비밀번호 표시"} onClick={() => setShowPassword((value) => !value)} type="button">{showPassword ? <IconEyeOff size={18} /> : <IconEye size={18} />}</button>
        </AuthField>

        <div className="auth-form-options"><label><input checked={remember} onChange={(event) => setRemember(event.currentTarget.checked)} type="checkbox" />로그인 상태 유지</label><button type="button">비밀번호를 잊으셨나요?</button></div>
        {error ? <p className="auth-form-error" role="alert">{error}</p> : null}
        <OrbitButton className="auth-submit-button" type="submit">로그인</OrbitButton>
      </form>

      <p className="auth-switch-copy">아직 ORBIT 계정이 없나요? <button onClick={() => props.onNavigate("/mockup/signup")} type="button">회원가입</button></p>
    </AuthShell>
  );
}

export function OrbitSignupMockup(props: AuthMockupProps) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [agreed, setAgreed] = useState(false);
  const [marketing, setMarketing] = useState(false);
  const [error, setError] = useState("");
  const passwordReady = password.length >= 8;

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!name.trim() || !email.trim() || !passwordReady) {
      setError("이름, 이메일, 8자 이상의 비밀번호를 확인해 주세요.");
      return;
    }
    if (!agreed) {
      setError("서비스 이용을 위해 필수 약관에 동의해 주세요.");
      return;
    }
    setError("");
    props.onNavigate("/mockup/home");
  }

  return (
    <AuthShell onNavigate={props.onNavigate}>
      <AuthFormHeader eyebrow="START WITH ORBIT" title="첫 발표를 시작해 볼까요?">
        계정을 만들고 아이디어를 완성도 높은 발표로 바꿔보세요.
      </AuthFormHeader>

      <button className="auth-social-button" onClick={() => props.onNavigate("/mockup/home")} type="button"><IconBrandGoogle size={19} />Google로 가입하기</button>
      <AuthDivider />

      <form className="auth-form" noValidate onSubmit={handleSubmit}>
        <div className="auth-signup-row">
          <AuthField icon={<IconUser size={18} />} label="이름"><input autoComplete="name" aria-label="이름" onChange={(event) => setName(event.currentTarget.value)} placeholder="이름" value={name} /></AuthField>
          <AuthField icon={<IconMail size={18} />} label="이메일"><input autoComplete="email" aria-label="이메일" onChange={(event) => setEmail(event.currentTarget.value)} placeholder="name@company.com" type="email" value={email} /></AuthField>
        </div>
        <AuthField icon={<IconLock size={18} />} label="비밀번호">
          <input autoComplete="new-password" aria-label="비밀번호" onChange={(event) => setPassword(event.currentTarget.value)} placeholder="8자 이상 입력하세요" type={showPassword ? "text" : "password"} value={password} />
          <button aria-label={showPassword ? "비밀번호 숨기기" : "비밀번호 표시"} onClick={() => setShowPassword((value) => !value)} type="button">{showPassword ? <IconEyeOff size={18} /> : <IconEye size={18} />}</button>
        </AuthField>
        <p className={`auth-password-rule ${passwordReady ? "ready" : ""}`}><IconCheck size={15} />8자 이상 입력</p>

        <div className="auth-agreements">
          <label><input checked={agreed} onChange={(event) => setAgreed(event.currentTarget.checked)} type="checkbox" /><span><strong>[필수]</strong> 서비스 이용약관 및 개인정보 처리방침에 동의합니다.</span></label>
          <label><input checked={marketing} onChange={(event) => setMarketing(event.currentTarget.checked)} type="checkbox" /><span><strong>[선택]</strong> 제품 업데이트와 발표 팁을 이메일로 받습니다.</span></label>
        </div>
        {error ? <p className="auth-form-error" role="alert">{error}</p> : null}
        <OrbitButton className="auth-submit-button" type="submit">무료로 시작하기</OrbitButton>
      </form>

      <p className="auth-switch-copy">이미 계정이 있나요? <button onClick={() => props.onNavigate("/mockup/login")} type="button">로그인</button></p>
    </AuthShell>
  );
}

function AuthShell(props: AuthMockupProps & { children: ReactNode }) {
  return (
    <div className="orbit-auth-mockup">
      <aside className="auth-brand-panel">
        <button aria-label="ORBIT 공개 화면" onClick={() => props.onNavigate("/mockup")} type="button"><IconArrowLeft size={18} /><img alt="ORBIT" src={orbitLogo} /></button>
        <div className="auth-brand-copy"><p className="redesign-eyebrow">AI PRESENTATION WORKSPACE</p><h1>생각부터<br />발표 순간까지.</h1><p>만들고, 편집하고, 연습하는 모든 흐름을 ORBIT 하나로 이어보세요.</p></div>
        <ol className="auth-brand-benefits"><li><span><IconSparkles size={19} /></span><div><strong>AI로 빠르게 시작</strong><small>아이디어와 자료를 발표 구성으로 정리해요.</small></div></li><li><span><IconEdit size={19} /></span><div><strong>한눈에 편집</strong><small>콘텐츠와 디자인을 한 캔버스에서 다듬어요.</small></div></li><li><span><IconMicrophone size={19} /></span><div><strong>발표까지 자신 있게</strong><small>리허설과 실전 발표 흐름을 함께 준비해요.</small></div></li></ol>
        <div className="auth-brand-note"><IconPresentation size={20} /><span>오늘도 ORBIT에서<br /><strong>3,248개의 발표</strong>가 준비되고 있어요.</span></div>
      </aside>
      <main className="auth-form-panel"><div className="auth-form-card">{props.children}</div><p className="auth-copyright">© 2026 ORBIT · 발표의 모든 순간을 연결합니다.</p></main>
    </div>
  );
}

function AuthFormHeader(props: { children: ReactNode; eyebrow: string; title: string }) {
  return <header className="auth-form-header"><p className="redesign-eyebrow">{props.eyebrow}</p><h1>{props.title}</h1><p>{props.children}</p></header>;
}

function AuthDivider() {
  return <div className="auth-divider"><span>또는 이메일로 계속하기</span></div>;
}

function AuthField(props: { children: ReactNode; icon: ReactNode; label: string }) {
  return <label className="auth-field"><span>{props.label}</span><div>{props.icon}{props.children}</div></label>;
}
