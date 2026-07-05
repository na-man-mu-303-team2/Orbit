import {
  FolderOpen,
  Home,
  LogIn,
  LogOut,
  Monitor,
  Sparkles
} from "lucide-react";
import type { ReactNode } from "react";
import orbitLogo from "../assets/orbit-logo.png";

type AppSidebarProps = {
  activeProjectId: string;
  isAuthenticated: boolean;
  isCreateDeckActive: boolean;
  isHomeActive: boolean;
  isLoggingOut: boolean;
  isProjectActive: boolean;
  isRehearsalActive: boolean;
  onCreateDeckClick: () => void;
  onHomeClick: () => void;
  onLoginClick: () => void;
  onLogoutClick: () => void;
  onProjectListClick: () => void;
  onRehearsalClick: (projectId: string) => void;
  userInitial: string;
  userLabel: string;
};

export function AppSidebar(props: AppSidebarProps) {
  const {
    activeProjectId,
    isAuthenticated,
    isCreateDeckActive,
    isHomeActive,
    isLoggingOut,
    isProjectActive,
    isRehearsalActive,
    onCreateDeckClick,
    onHomeClick,
    onLoginClick,
    onLogoutClick,
    onProjectListClick,
    onRehearsalClick,
    userInitial,
    userLabel
  } = props;

  return (
    <aside className="orbit-product-nav" aria-label="Orbit navigation">
      <button
        aria-label="Orbit AI 홈"
        className="orbit-product-nav-brand"
        type="button"
        onClick={onHomeClick}
      >
        <img alt="Orbit" className="brand-mark" src={orbitLogo} />
      </button>
      <SidebarButton
        active={isHomeActive}
        icon={<Home size={15} />}
        label="홈"
        onClick={onHomeClick}
      />
      <SidebarButton
        active={isProjectActive}
        icon={<FolderOpen size={15} />}
        label="프로젝트 목록"
        onClick={onProjectListClick}
      />
      <SidebarButton
        active={isCreateDeckActive}
        icon={<Sparkles size={15} />}
        label="AI 덱 생성"
        onClick={onCreateDeckClick}
      />
      <SidebarButton
        active={isRehearsalActive}
        icon={<Monitor size={15} />}
        label="리허설 시작"
        onClick={() => onRehearsalClick(activeProjectId)}
      />
      <div className="orbit-product-nav-account">
        {isAuthenticated ? (
          <>
            <div aria-label="현재 사용자" className="report-user-trigger">
              <span aria-hidden="true" className="report-avatar">{userInitial}</span>
              <span>{userLabel}</span>
            </div>
            <button
              className="orbit-product-nav-logout"
              disabled={isLoggingOut}
              type="button"
              onClick={onLogoutClick}
            >
              <LogOut size={16} />
              {isLoggingOut ? "로그아웃 중" : "로그아웃"}
            </button>
          </>
        ) : (
          <button
            className="orbit-product-nav-logout"
            type="button"
            onClick={onLoginClick}
          >
            <LogIn size={16} />
            로그인
          </button>
        )}
      </div>
    </aside>
  );
}

function SidebarButton(props: {
  active: boolean;
  icon: ReactNode;
  detail?: string;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      className={props.active ? "rehearsal-report-nav-item active" : "rehearsal-report-nav-item"}
      type="button"
      onClick={props.onClick}
    >
      <strong>
        {props.icon}
        {props.label}
      </strong>
      {props.detail ? <span>{props.detail}</span> : null}
    </button>
  );
}
