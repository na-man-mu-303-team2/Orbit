import {
  FolderOpen,
  Home,
  LogIn,
  LogOut,
  Monitor,
  PanelLeftClose,
  PanelLeftOpen,
  Sparkles,
} from "lucide-react";
import type { ReactNode } from "react";
import orbitLogo from "../assets/orbit-logo.png";

type AppSidebarProps = {
  isAuthenticated: boolean;
  isCollapsed: boolean;
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
  onRehearsalClick: () => void;
  onToggleCollapse: () => void;
  userInitial: string;
  userLabel: string;
};

export function AppSidebar(props: AppSidebarProps) {
  const {
    isAuthenticated,
    isCollapsed,
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
    onToggleCollapse,
    userInitial,
    userLabel,
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
      <button
        aria-label={isCollapsed ? "사이드바 펼치기" : "사이드바 접기"}
        aria-pressed={isCollapsed}
        className="orbit-product-nav-toggle"
        title={isCollapsed ? "사이드바 펼치기" : "사이드바 접기"}
        type="button"
        onClick={onToggleCollapse}
      >
        {isCollapsed ? (
          <PanelLeftOpen size={17} />
        ) : (
          <PanelLeftClose size={17} />
        )}
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
        onClick={onRehearsalClick}
      />
      <div className="orbit-product-nav-account">
        {isAuthenticated ? (
          <>
            <div aria-label="현재 사용자" className="report-user-trigger">
              <span aria-hidden="true" className="report-avatar">
                {userInitial}
              </span>
              <span>{userLabel}</span>
            </div>
            <button
              className="orbit-product-nav-logout"
              disabled={isLoggingOut}
              title={isLoggingOut ? "로그아웃 중" : "로그아웃"}
              type="button"
              onClick={onLogoutClick}
            >
              <LogOut size={16} />
              <span>{isLoggingOut ? "로그아웃 중" : "로그아웃"}</span>
            </button>
          </>
        ) : (
          <button
            className="orbit-product-nav-logout"
            title="로그인"
            type="button"
            onClick={onLoginClick}
          >
            <LogIn size={16} />
            <span>로그인</span>
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
      className={
        props.active
          ? "rehearsal-report-nav-item active"
          : "rehearsal-report-nav-item"
      }
      title={props.label}
      type="button"
      onClick={props.onClick}
    >
      <strong>
        {props.icon}
        <span>{props.label}</span>
      </strong>
      {props.detail ? <span>{props.detail}</span> : null}
    </button>
  );
}
