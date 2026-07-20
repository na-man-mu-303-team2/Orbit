import {
  IconChevronDown,
  IconLogin,
  IconLogout
} from "@tabler/icons-react";
import {
  type ChangeEvent,
  useEffect,
  useRef,
  useState
} from "react";
import {
  getAvatarUrl,
  officialAvatarIds,
  type AuthAvatar,
  type AuthUser,
  updateOfficialAvatar,
  uploadProfileAvatar,
} from "../features/auth/auth-session";
import "../styles/tokens.css";
import { WorkspaceContainer } from "./patterns";
import {
  DropdownMenu,
  DropdownMenuAccount,
  DropdownMenuItem,
  OrbitBrand,
  OrbitButton,
  OrbitIconButton
} from "./ui";
import { OrbitDialog } from "./ui/Dialog";
import "./orbit-app-header.css";

type OrbitAppHeaderProps = {
  activeItem: OrbitAppNavigationItem;
  avatar?: AuthAvatar | null;
  isAuthenticated: boolean;
  isLoggingOut: boolean;
  onAvatarUpdated?: (user: AuthUser) => void;
  onLogout: () => void;
  onNavigate: (path: string) => void;
  userInitial: string;
  userLabel: string;
};

export type OrbitAppNavigationItem = "home" | "project" | "rehearsal" | "reports";

const maxAvatarFileSizeBytes = 3 * 1024 * 1024;
const acceptedAvatarMimeTypes = new Set(["image/jpeg", "image/png", "image/webp"]);

export function OrbitAppHeader(props: OrbitAppHeaderProps) {
  const [avatarError, setAvatarError] = useState<string | null>(null);
  const [isAvatarDialogOpen, setIsAvatarDialogOpen] = useState(false);
  const [isAvatarUpdating, setIsAvatarUpdating] = useState(false);
  const [isOfficialAvatarListOpen, setIsOfficialAvatarListOpen] = useState(false);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const accountRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const avatarImageUrl = getAvatarUrl(props.avatar);
  const selectedOfficialAvatarId =
    props.avatar?.kind === "official" ? props.avatar.avatarId : null;
  const previewOfficialAvatarIds = selectedOfficialAvatarId && !officialAvatarIds.slice(0, 5).includes(selectedOfficialAvatarId)
    ? [...officialAvatarIds.slice(0, 4), selectedOfficialAvatarId]
    : officialAvatarIds.slice(0, 5);
  const visibleOfficialAvatarIds = isOfficialAvatarListOpen
    ? officialAvatarIds
    : previewOfficialAvatarIds;

  async function saveOfficialAvatar(avatarId: (typeof officialAvatarIds)[number]) {
    if (isAvatarUpdating) return;
    setAvatarError(null);
    setIsAvatarUpdating(true);
    try {
      props.onAvatarUpdated?.(await updateOfficialAvatar(avatarId));
      setIsMenuOpen(false);
      setIsAvatarDialogOpen(false);
    } catch (error) {
      setAvatarError(error instanceof Error ? error.message : "프로필 이미지를 저장하지 못했습니다.");
    } finally {
      setIsAvatarUpdating(false);
    }
  }

  function openAvatarPicker() {
    fileInputRef.current?.click();
  }

  function openAvatarSettings() {
    setAvatarError(null);
    setIsMenuOpen(false);
    setIsOfficialAvatarListOpen(false);
    setIsAvatarDialogOpen(true);
  }

  function handleAvatarUpload(event: ChangeEvent<HTMLInputElement>) {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = "";

    if (!file) {
      return;
    }
    if (!acceptedAvatarMimeTypes.has(file.type)) {
      setAvatarError("JPG, PNG, WebP 이미지만 업로드할 수 있습니다.");
      return;
    }
    if (file.size > maxAvatarFileSizeBytes) {
      setAvatarError("파일 크기가 3MB를 초과했습니다. 3MB 이하 이미지를 선택해 주세요.");
      return;
    }
    if (isAvatarUpdating) return;
    setAvatarError(null);
    setIsAvatarUpdating(true);
    void uploadProfileAvatar(file)
      .then((user) => {
        props.onAvatarUpdated?.(user);
        setIsMenuOpen(false);
        setIsAvatarDialogOpen(false);
      })
      .catch((error: unknown) => {
        setAvatarError(error instanceof Error ? error.message : "프로필 이미지를 저장하지 못했습니다.");
      })
      .finally(() => setIsAvatarUpdating(false));
  }

  useEffect(() => {
    if (!isMenuOpen) return;

    function handlePointerDown(event: PointerEvent) {
      if (!accountRef.current?.contains(event.target as Node)) {
        setIsMenuOpen(false);
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setIsMenuOpen(false);
    }

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isMenuOpen]);

  return (
    <header className="orbit-app-header orbit-app-header-redesign">
      <WorkspaceContainer className="orbit-app-header-inner">
        <button
          aria-label="ORBIT 홈으로 이동"
          className="orbit-app-header-brand"
          onClick={() => props.onNavigate("/")}
          type="button"
        >
          <OrbitBrand />
        </button>

        <div className="orbit-app-header-account" ref={accountRef}>
          {props.isAuthenticated ? (
            <>
              <button
                aria-label={`계정 메뉴: ${props.userLabel || "사용자"}`}
                aria-controls={isMenuOpen ? "orbit-app-account-menu" : undefined}
                aria-expanded={isMenuOpen}
                aria-haspopup="menu"
                className="orbit-app-header-user"
                onClick={() => setIsMenuOpen((current) => !current)}
                type="button"
              >
                <span aria-hidden="true" className="orbit-app-header-avatar">
                  {avatarImageUrl ? (
                    <img
                      alt="프로필 이미지"
                      className="orbit-app-header-avatar-image"
                      src={avatarImageUrl}
                    />
                  ) : (
                    props.userInitial
                  )}
                </span>
                <span className="orbit-app-header-user-label">{props.userLabel}</span>
                <IconChevronDown aria-hidden="true" size={16} stroke={1.8} />
              </button>
              {isMenuOpen ? (
                <DropdownMenu
                  aria-label="계정 메뉴"
                  className="orbit-app-header-account-menu"
                  id="orbit-app-account-menu"
                  variant="white"
                >
                  <DropdownMenuAccount
                    avatarUrl={avatarImageUrl ?? undefined}
                    initial={props.userInitial}
                    label={props.userLabel || "사용자"}
                  />
                  <DropdownMenuItem
                    onClick={() => {
                      setIsMenuOpen(false);
                      props.onNavigate("/profile");
                    }}
                  >
                    프로필
                  </DropdownMenuItem>
                  <DropdownMenuItem disabled={isAvatarUpdating} onClick={openAvatarSettings}>
                    프로필 사진 설정
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    disabled={props.isLoggingOut}
                    icon={<IconLogout aria-hidden="true" size={16} stroke={1.8} />}
                    onClick={props.onLogout}
                  >
                    {props.isLoggingOut ? "로그아웃 중" : "로그아웃"}
                  </DropdownMenuItem>
                </DropdownMenu>
              ) : null}
              <input
                accept="image/jpeg,image/png,image/webp"
                className="orbit-app-header-avatar-input"
                disabled={isAvatarUpdating}
                onChange={handleAvatarUpload}
                ref={fileInputRef}
                type="file"
              />
              <OrbitDialog
                closeDisabled={isAvatarUpdating}
                description="공식 아바타를 고르거나 내 사진을 업로드하세요. JPG, PNG, WebP 파일은 최대 3MB까지 지원합니다."
                onClose={() => {
                  setAvatarError(null);
                  setIsAvatarDialogOpen(false);
                }}
                open={isAvatarDialogOpen}
                title="프로필 사진 설정"
              >
                <div className="orbit-avatar-settings">
                  <button
                    aria-expanded={isOfficialAvatarListOpen}
                    className="orbit-avatar-section-toggle"
                    onClick={() => setIsOfficialAvatarListOpen((current) => !current)}
                    type="button"
                  >
                    <span>기본 프로필 사진</span>
                    <IconChevronDown
                      aria-hidden="true"
                      className={isOfficialAvatarListOpen ? "open" : ""}
                      size={18}
                      stroke={2}
                    />
                  </button>
                  <div aria-label="공식 아바타 선택" className="orbit-avatar-settings-grid">
                    {visibleOfficialAvatarIds.map((avatarId) => (
                      <button
                        aria-label={`공식 아바타 ${avatarId.slice(-2)}`}
                        aria-pressed={selectedOfficialAvatarId === avatarId}
                        className={`orbit-avatar-choice${selectedOfficialAvatarId === avatarId ? " selected" : ""}`}
                        disabled={isAvatarUpdating}
                        key={avatarId}
                        onClick={() => void saveOfficialAvatar(avatarId)}
                        type="button"
                      >
                        <img alt="" src={`/avatars/${avatarId}.png`} />
                      </button>
                    ))}
                  </div>
                  <div className="orbit-avatar-settings-upload">
                    <OrbitButton
                      loading={isAvatarUpdating}
                      onClick={openAvatarPicker}
                      size="compact"
                      variant="secondary"
                    >
                      사진 업로드 하기
                    </OrbitButton>
                  </div>
                  {avatarError ? <p className="orbit-app-header-avatar-error" role="alert">{avatarError}</p> : null}
                </div>
              </OrbitDialog>
            </>
          ) : (
            <button
              className="orbit-app-header-login"
              onClick={() => props.onNavigate("/login")}
              type="button"
            >
              <IconLogin aria-hidden="true" size={18} stroke={1.8} />
              로그인
            </button>
          )}
        </div>
      </WorkspaceContainer>
    </header>
  );
}
