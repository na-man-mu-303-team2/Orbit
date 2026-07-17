import type { Deck } from "@orbit/shared";
import {
  IconChevronDown as ChevronDown,
  IconCloud as Cloud,
  IconDownload as Download,
  IconFileText as FileText,
  IconHistory as History,
  IconHome as Home,
  IconRefresh as RefreshCw,
  IconShare as Share2,
  IconUpload as Upload
} from "@tabler/icons-react";
import { useEffect, useRef } from "react";

import type { EditorShellUiUpdater, TopMenu } from "../editorShellUiStore";
import {
  getPresenceUserInitial,
  getPresenceUserLabel,
  type ProjectPresenceUser
} from "../hooks/useProjectPresence";
import { EditorSaveControl } from "./EditorSaveControl";
import { PresentationMenu } from "./PresentationMenu";

type EditorTopbarProps = {
  activePresentationAction: "presentation" | "rehearsal" | null;
  activeTopMenu: TopMenu | null;
  canManageShare: boolean;
  canOpenAudienceLink: boolean;
  canStartPresentation: boolean;
  canvas: Deck["canvas"];
  deckTitle: string;
  isDeckLoading: boolean;
  isPptxExporting: boolean;
  isSharePanelOpen: boolean;
  isSharePermissionLoading: boolean;
  isUsingFallbackDeck: boolean;
  lastSavedAtLabel: string | null;
  ooxmlSyncStatus: { detail: string; kind: string; label: string } | null;
  onExitToHome: () => void;
  onExportPptx: () => void;
  onImportPptx: () => void;
  onOpenAudienceLink: () => void;
  onOpenPresenceDebug: () => void;
  onOpenShare: () => void;
  onRefresh: () => void;
  onSave: () => void;
  onStartPresentation: () => void;
  onStartRehearsal: () => void;
  projectId: string;
  projectPresenceUsers: ProjectPresenceUser[];
  pptxExportMessage: string;
  pptxImportMeta: string;
  recoveryHint: string | null;
  saveMenuMeta: string;
  saveStatusLabel: string;
  setActiveTopMenu: (updater: EditorShellUiUpdater<TopMenu | null>) => void;
  showLoadedFileLabel: boolean;
  saving: boolean;
};

export function EditorTopbar(props: EditorTopbarProps) {
  const topbarRef = useRef<HTMLElement | null>(null);
  const {
    activePresentationAction,
    activeTopMenu,
    canManageShare,
    canOpenAudienceLink,
    canStartPresentation,
    canvas,
    deckTitle,
    isDeckLoading,
    isPptxExporting,
    isSharePanelOpen,
    isSharePermissionLoading,
    isUsingFallbackDeck,
    lastSavedAtLabel,
    ooxmlSyncStatus,
    onExitToHome,
    onExportPptx,
    onImportPptx,
    onOpenAudienceLink,
    onOpenPresenceDebug,
    onOpenShare,
    onRefresh,
    onSave,
    onStartPresentation,
    onStartRehearsal,
    projectId,
    projectPresenceUsers,
    pptxExportMessage,
    pptxImportMeta,
    recoveryHint,
    saveMenuMeta,
    saveStatusLabel,
    setActiveTopMenu,
    showLoadedFileLabel,
    saving
  } = props;

  useEffect(() => {
    if (!activeTopMenu) return;

    function handlePointerDown(event: MouseEvent) {
      if (!topbarRef.current?.contains(event.target as Node)) {
        setActiveTopMenu(null);
      }
    }

    function handleEscape(event: KeyboardEvent) {
      if (event.key === "Escape") setActiveTopMenu(null);
    }

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [activeTopMenu, setActiveTopMenu]);

  const fileMenuItems = [
    { action: "import", icon: Upload, label: "PPTX 가져오기", meta: pptxImportMeta },
    {
      action: "save",
      icon: Cloud,
      label: saving ? "저장 중..." : "저장",
      meta: saveMenuMeta
    }
  ];
  const exportMenuItem = {
    action: "pptx",
    disabled: isPptxExporting,
    icon: Download,
    label: isPptxExporting ? "PPTX 내보내는 중..." : "PPTX 내보내기",
    meta: pptxExportMessage
  };
  const ExportIcon = exportMenuItem.icon;

  return (
    <header className="app-topbar" ref={topbarRef}>
      <div className="topbar-left">
        <div className="menu-stack">
          <div className="editor-document-title">
            <span>
              <strong>{deckTitle}</strong>
              <small>{saveStatusLabel}</small>
            </span>
          </div>
          <div className="menu-row">
            <button aria-label="ORBIT 홈으로 이동" className="top-icon-button" title="홈으로 이동" type="button" onClick={onExitToHome}>
              <Home size={15} />
            </button>
            <TopMenuButton activeTopMenu={activeTopMenu} label="파일" menu="file" setActiveTopMenu={setActiveTopMenu} />
          </div>

          {activeTopMenu === "file" ? (
            <div className="file-menu-popover" role="menu">
              <div className="file-menu-header">
                <div>
                  <strong>{deckTitle}</strong>
                  <span>프레젠테이션 · {canvas.width} × {canvas.height}px</span>
                </div>
              </div>
              <div className="file-menu-list">
                {fileMenuItems.map(({ action, icon: Icon, label, meta }) => (
                  <button
                    className="file-menu-item"
                    key={action}
                    role="menuitem"
                    type="button"
                    onClick={() => action === "import" ? onImportPptx() : onSave()}
                  >
                    <span className="file-menu-label"><Icon size={16} />{label}</span>
                    <span className="file-menu-meta">{meta ? <small>{meta}</small> : null}</span>
                  </button>
                ))}
                <span className="menu-section-label">내보내기</span>
                <button className="file-menu-item" disabled={exportMenuItem.disabled} role="menuitem" type="button" onClick={onExportPptx}>
                  <span className="file-menu-label"><ExportIcon size={16} />{exportMenuItem.label}</span>
                  <span className="file-menu-meta">{exportMenuItem.meta ? <small>{exportMenuItem.meta}</small> : null}</span>
                </button>
              </div>
            </div>
          ) : null}
        </div>
      </div>

      <div className="top-actions">
        {projectPresenceUsers.length > 0 ? (
          <button aria-label="소켓 접속 상태 보기" className="presence-avatar-trigger" type="button" onClick={onOpenPresenceDebug}>
            {projectPresenceUsers.slice(0, 4).map((user) => (
              <span className="avatar" key={`${user.id}-${user.connectedAt}`} title={getPresenceUserLabel(user)}>{getPresenceUserInitial(user)}</span>
            ))}
            {projectPresenceUsers.length > 4 ? <span className="avatar presence-avatar-more">+{projectPresenceUsers.length - 4}</span> : null}
          </button>
        ) : null}
        <EditorSaveControl
          disabled={isDeckLoading || isUsingFallbackDeck}
          emptyStateLabel={showLoadedFileLabel ? "불러온 파일" : "저장 기록 없음"}
          isSaving={saving}
          lastSavedAtLabel={lastSavedAtLabel}
          onSave={onSave}
          recoveryHint={recoveryHint}
          statusLabel={saveStatusLabel}
        />
        {ooxmlSyncStatus ? <span className={`ooxml-sync-pill ${ooxmlSyncStatus.kind}`} title={ooxmlSyncStatus.detail}>{ooxmlSyncStatus.label}</span> : null}
        <button aria-label="브리프" className="editor-context-top-button" title="브리프" onClick={() => { window.location.href = `/project/${encodeURIComponent(projectId)}/brief`; }} type="button"><FileText size={17} /></button>
        <button aria-label="버전 기록" className="editor-context-top-button" title="버전 기록" onClick={() => { window.location.href = `/project/${encodeURIComponent(projectId)}/history`; }} type="button"><History size={17} /></button>
        <PresentationMenu
          activeStartAction={activePresentationAction}
          canOpenAudienceLink={canOpenAudienceLink}
          canStartPresentation={canStartPresentation}
          isOpen={activeTopMenu === "presentation"}
          onOpenAudienceLink={onOpenAudienceLink}
          onStartPresentation={onStartPresentation}
          onStartRehearsal={onStartRehearsal}
          onToggle={() => setActiveTopMenu((current) => current === "presentation" ? null : "presentation")}
        />
        <button
          aria-expanded={isSharePanelOpen}
          aria-haspopup="dialog"
          className="share-top-button"
          disabled={!canManageShare || isSharePermissionLoading}
          title={canManageShare ? "프로젝트 공유" : "프로젝트 owner만 공유 설정을 변경할 수 있습니다."}
          type="button"
          onClick={() => {
            if (!canManageShare) return;
            onOpenShare();
            setActiveTopMenu(null);
          }}
        ><Share2 size={17} /><span className="visually-hidden">공유</span></button>
        <button aria-label="에디터 새로고침" className="refresh-top-button" type="button" onClick={onRefresh}><RefreshCw size={15} /></button>
      </div>
    </header>
  );
}

function TopMenuButton(props: {
  activeTopMenu: TopMenu | null;
  label: string;
  menu: TopMenu;
  setActiveTopMenu: (updater: EditorShellUiUpdater<TopMenu | null>) => void;
}) {
  const active = props.activeTopMenu === props.menu;
  return (
    <button
      aria-expanded={active}
      aria-haspopup="menu"
      className={`top-menu-button ${active ? "active" : ""}`}
      type="button"
      onClick={() => props.setActiveTopMenu((current) => current === props.menu ? null : props.menu)}
    >
      {props.label} <ChevronDown size={14} />
    </button>
  );
}
