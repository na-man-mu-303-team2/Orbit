import {
  IconChevronDown,
  IconLogin,
  IconLogout
} from "@tabler/icons-react";
import { useEffect, useRef, useState } from "react";
import "../styles/tokens.css";
import { WorkspaceContainer } from "./patterns";
import {
  DropdownMenu,
  DropdownMenuAccount,
  DropdownMenuItem,
  OrbitBrand
} from "./ui";
import "./orbit-app-header.css";

export type OrbitAppNavigationItem = "home" | "project" | "rehearsal" | "reports";

type OrbitAppHeaderProps = {
  activeItem: OrbitAppNavigationItem;
  isAuthenticated: boolean;
  isLoggingOut: boolean;
  onLogout: () => void;
  onNavigate: (path: string) => void;
  userInitial: string;
  userLabel: string;
};

const navigationItems: ReadonlyArray<{
  id: OrbitAppNavigationItem;
  label: string;
  path: string;
}> = [
  { id: "home", label: "홈", path: "/" },
  { id: "project", label: "프로젝트", path: "/project" },
  { id: "rehearsal", label: "리허설", path: "/project?intent=rehearsal" },
  { id: "reports", label: "리포트", path: "/reports" }
];

export function OrbitAppHeader(props: OrbitAppHeaderProps) {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const accountRef = useRef<HTMLDivElement>(null);

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

        <nav aria-label="주요 메뉴" className="orbit-app-header-nav">
          {navigationItems.map((item) => (
            <button
              aria-current={props.activeItem === item.id ? "page" : undefined}
              className={props.activeItem === item.id ? "active" : ""}
              key={item.id}
              onClick={() => props.onNavigate(item.path)}
              type="button"
            >
              {item.label}
            </button>
          ))}
        </nav>

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
                  {props.userInitial}
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
                    initial={props.userInitial}
                    label={props.userLabel}
                  />
                  <DropdownMenuItem
                    disabled={props.isLoggingOut}
                    icon={<IconLogout aria-hidden="true" size={16} stroke={1.8} />}
                    onClick={props.onLogout}
                  >
                    {props.isLoggingOut ? "로그아웃 중" : "로그아웃"}
                  </DropdownMenuItem>
                </DropdownMenu>
              ) : null}
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
