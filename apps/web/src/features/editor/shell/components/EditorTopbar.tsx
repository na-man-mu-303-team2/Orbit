import type { Deck, DeckExportFormat } from "@orbit/shared";
import {
  IconChevronDown as ChevronDown,
  IconCloud as Cloud,
  IconDownload as Download,
  IconFileText as FileText,
  IconFolderPlus as FolderPlus,
  IconHistory as History,
  IconHome as Home,
  IconPencil as PenLine,
  IconRefresh as RefreshCw,
  IconShare as Share2,
  IconUpload as Upload
} from "@tabler/icons-react";
import { useEffect, useRef, useState } from "react";

import orbitLogo from "../../../../assets/orbit-logo.png";
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
  onOpenExport: (format: DeckExportFormat) => void;
  onImportPptx: () => void;
  onOpenAudienceLink: () => void;
  onOpenPresenceDebug: () => void;
  onOpenShare: () => void;
  onRefresh: () => void;
  onRenameDeckTitle: (title: string) => void;
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
  const titleEditCancelledRef = useRef(false);
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
    onOpenExport,
    onImportPptx,
    onOpenAudienceLink,
    onOpenPresenceDebug,
    onOpenShare,
    onRefresh,
    onRenameDeckTitle,
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
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState(deckTitle);

  useEffect(() => {
    if (!isEditingTitle) setTitleDraft(deckTitle);
  }, [deckTitle, isEditingTitle]);

  function finishTitleEditing() {
    if (titleEditCancelledRef.current) {
      titleEditCancelledRef.current = false;
      setTitleDraft(deckTitle);
      setIsEditingTitle(false);
      return;
    }
    const title = titleDraft.trim();
    if (title && title !== deckTitle) onRenameDeckTitle(title);
    if (!title) setTitleDraft(deckTitle);
    setIsEditingTitle(false);
  }

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
    { action: "new", icon: FolderPlus, label: "새 프레젠테이션", meta: "빈 덱" },
    { action: "import", icon: Upload, label: "PPTX 가져오기", meta: pptxImportMeta },
    {
      action: "save",
      icon: Cloud,
      label: saving ? "저장 중..." : "저장",
      meta: saveMenuMeta
    }
  ];
  const exportMenuItems: Array<{
    disabled: boolean;
    format?: DeckExportFormat;
    icon: typeof Download;
    label: string;
    meta: string;
  }> = [
    {
      disabled: isPptxExporting,
      format: "pptx",
      icon: Download,
      label: isPptxExporting ? "PPTX 내보내는 중..." : "PPTX 내보내기",
      meta: pptxExportMessage
    },
    {
      disabled: isPptxExporting,
      format: "png",
      icon: Download,
      label: isPptxExporting ? "PNG ZIP 내보내는 중..." : "PNG ZIP 내보내기",
      meta: pptxExportMessage || "모든 장표 PNG"
    },
    { disabled: true, icon: Download, label: "PDF 내보내기", meta: "준비 중" },
    { disabled: true, icon: Download, label: "JSON 백업 내보내기", meta: "준비 중" }
  ];
  const editModeItems = [
    { active: true, label: "편집 중", meta: "텍스트와 오브젝트 수정" },
    { label: "보기 전용", meta: "슬라이드 탐색만" },
    { label: "검토", meta: "코멘트 중심" }
  ];
  return (
    <header className="app-topbar" ref={topbarRef}>
      <div className="topbar-left">
        <div className="menu-stack">
          <div className="editor-document-title">
            <button aria-label="ORBIT 홈으로 이동" onClick={onExitToHome} type="button">
              <img alt="ORBIT" src={orbitLogo} />
            </button>
            <span className="editor-document-title-content">
              {isEditingTitle ? (
                <input
                  aria-label="프레젠테이션 제목"
                  autoFocus
                  className="editor-document-title-input"
                  maxLength={200}
                  onBlur={finishTitleEditing}
                  onChange={(event) => setTitleDraft(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") event.currentTarget.blur();
                    if (event.key === "Escape") {
                      titleEditCancelledRef.current = true;
                      setTitleDraft(deckTitle);
                      setIsEditingTitle(false);
                    }
                  }}
                  value={titleDraft}
                />
              ) : <strong>{deckTitle}</strong>}
              <button
                aria-label="프레젠테이션 제목 수정"
                className="editor-title-edit-button"
                title="제목 수정"
                type="button"
                onClick={() => {
                  titleEditCancelledRef.current = false;
                  setTitleDraft(deckTitle);
                  setIsEditingTitle(true);
                  setActiveTopMenu(null);
                }}
              >
                <PenLine size={14} />
              </button>
              <small>{saveStatusLabel}</small>
            </span>
          </div>
          <div className="menu-row">
            <button aria-label="ORBIT 홈으로 이동" className="top-icon-button" title="홈으로 이동" type="button" onClick={onExitToHome}>
              <Home size={15} />
            </button>
            <TopMenuButton activeTopMenu={activeTopMenu} label="파일" menu="file" setActiveTopMenu={setActiveTopMenu} />
            <TopMenuButton activeTopMenu={activeTopMenu} label="편집 중" menu="editMode" setActiveTopMenu={setActiveTopMenu} />
          </div>

          {activeTopMenu === "file" ? (
            <div className="file-menu-popover" role="menu">
              <div className="file-menu-header">
                <div>
                  <strong>{deckTitle}</strong>
                  <span>프레젠테이션 · {canvas.width} × {canvas.height}px</span>
                </div>
                <button aria-label="문서 이름 변경" className="menu-ghost-button" title="Rename" type="button">
                  <PenLine size={15} />
                </button>
              </div>
              <div className="file-menu-list">
                {fileMenuItems.map(({ action, icon: Icon, label, meta }) => (
                  <button
                    className="file-menu-item"
                    key={action}
                    role="menuitem"
                    type="button"
                    onClick={() => action === "import" ? onImportPptx() : action === "save" ? onSave() : undefined}
                  >
                    <span className="file-menu-label"><Icon size={16} />{label}</span>
                    <span className="file-menu-meta">{meta ? <small>{meta}</small> : null}</span>
                  </button>
                ))}
                <span className="menu-section-label">내보내기</span>
                {exportMenuItems.map(({ disabled, format, icon: Icon, label, meta }) => (
                  <button className="file-menu-item" disabled={disabled} key={label} role="menuitem" type="button" onClick={() => format ? onOpenExport(format) : undefined}>
                    <span className="file-menu-label"><Icon size={16} />{label}</span>
                    <span className="file-menu-meta">{meta ? <small>{meta}</small> : null}</span>
                  </button>
                ))}
              </div>
            </div>
          ) : null}

          {activeTopMenu === "editMode" ? <SimpleMenu items={editModeItems} radio /> : null}
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
        <button className="editor-context-top-button" onClick={() => { window.location.href = `/project/${encodeURIComponent(projectId)}/brief`; }} type="button"><FileText size={15} /><span>브리프</span></button>
        <button className="editor-context-top-button" onClick={() => { window.location.href = `/project/${encodeURIComponent(projectId)}/history`; }} type="button"><History size={15} /><span>버전</span></button>
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
        ><Share2 size={15} />공유</button>
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

function SimpleMenu(props: {
  items: Array<{ active?: boolean; label: string; meta: string }>;
  radio?: boolean;
}) {
  return (
    <div className="file-menu-popover compact-popover" role="menu">
      <div className="file-menu-list">
        {props.items.map((item) => (
          <button className={`file-menu-item ${item.active ? "selected" : ""}`} key={item.label} role={props.radio ? "menuitemradio" : "menuitem"} type="button">
            <span className="file-menu-label">{item.label}</span>
            <span className="file-menu-meta"><small>{item.meta}</small></span>
          </button>
        ))}
      </div>
    </div>
  );
}
