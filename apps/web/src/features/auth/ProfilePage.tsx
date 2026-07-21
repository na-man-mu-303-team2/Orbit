import { IconAt, IconCheck, IconUser } from "@tabler/icons-react";
import { useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { OrbitButton, OrbitField, OrbitInput } from "../../components/ui";
import {
  authMeQueryKey,
  getAvatarUrl,
  updateProfileDisplayName,
  type AuthUser,
} from "./auth-session";
import "./profile-page.css";

export function ProfilePage(props: {
  onNavigate: (path: string) => void;
  user: AuthUser;
}) {
  const queryClient = useQueryClient();
  const [displayName, setDisplayName] = useState(props.user.displayName);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const avatarUrl = getAvatarUrl(props.user.avatar);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isSubmitting) return;

    setError("");
    setSaved(false);
    setIsSubmitting(true);
    try {
      const user = await updateProfileDisplayName(displayName);
      queryClient.setQueryData<AuthUser>(authMeQueryKey, user);
      setDisplayName(user.displayName);
      setSaved(true);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "닉네임을 저장하지 못했습니다.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <section className="orbit-profile-page">
      <header className="orbit-profile-heading">
        <span className="redesign-eyebrow">ACCOUNT</span>
        <h1>프로필</h1>
        <p>ORBIT에서 사용할 닉네임을 관리하세요.</p>
      </header>

      <div className="orbit-profile-layout">
        <aside className="orbit-profile-summary">
          <div className="orbit-profile-avatar" aria-hidden="true">
            {avatarUrl ? <img alt="" src={avatarUrl} /> : props.user.displayName.slice(0, 1)}
          </div>
          <strong>{props.user.displayName}</strong>
          <span>{props.user.email}</span>
          <OrbitButton onClick={() => props.onNavigate("/")} variant="quiet">
            홈으로 돌아가기
          </OrbitButton>
        </aside>

        <form className="orbit-profile-form" onSubmit={handleSubmit}>
          <div className="orbit-profile-form-title">
            <IconUser aria-hidden="true" size={20} />
            <div>
              <h2>계정 정보</h2>
              <p>닉네임은 모든 사용자에게 고유해야 합니다.</p>
            </div>
          </div>
          <OrbitField id="orbit-profile-email" label="이메일">
            <OrbitInput disabled readOnly value={props.user.email} />
          </OrbitField>
          <OrbitField
            error={error || undefined}
            hint="2~20자, 앞뒤 공백과 영문 대소문자를 무시하고 중복을 확인합니다."
            id="orbit-profile-display-name"
            label="닉네임"
          >
            <OrbitInput
              autoComplete="name"
              maxLength={20}
              minLength={2}
              onChange={(event) => {
                setDisplayName(event.currentTarget.value);
                setError("");
                setSaved(false);
              }}
              required
              value={displayName}
            />
          </OrbitField>
          {saved ? (
            <p className="orbit-profile-success" role="status">
              <IconCheck aria-hidden="true" size={16} /> 닉네임을 저장했습니다.
            </p>
          ) : null}
          <div className="orbit-profile-actions">
            <span><IconAt aria-hidden="true" size={16} /> 이메일은 변경할 수 없습니다.</span>
            <OrbitButton loading={isSubmitting} type="submit">
              저장
            </OrbitButton>
          </div>
        </form>
      </div>
    </section>
  );
}
