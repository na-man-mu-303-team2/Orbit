import type { Deck } from "@orbit/shared";
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
  IconUpload as Upload,
  IconWand as Wand2
} from "@tabler/icons-react";
import { useEffect, useRef, type Ref } from "react";

import orbitLogo from "../../../../assets/orbit-logo.png";
import type { EditorShellUiUpdater, TopMenu } from "../editorShellUiStore";
import {
  getPresenceUserInitial,
  getPresenceUserLabel,
  type ProjectPresenceUser
} from "../hooks/useProjectPresence";
import { EditorSaveControl } from "./EditorSaveControl";
import { PresentationMenu } from "./PresentationMenu";
import { usePopupMenuKeyboard } from "./usePopupMenuKeyboard";

type EditorTopbarProps = {
  activePresentationAction: "presentation" | "rehearsal" | null;
  activeTopMenu: TopMenu | null;
  canCreatePresentationSession: boolean;
  canExportDeck: boolean;
  canManageShare: boolean;
  canMutateDeck: boolean;
  canOpenAudienceLink: boolean;
  canStartPersonalRehearsal: boolean;
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
  onOpenJourney: () => void;
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
  const fileMenuTriggerRef = useRef<HTMLButtonElement | null>(null);
  const {
    activePresentationAction,
    activeTopMenu,
    canCreatePresentationSession,
    canExportDeck,
    canManageShare,
    canMutateDeck,
    canOpenAudienceLink,
    canStartPersonalRehearsal,
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
    onOpenJourney,
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
  const fileMenuKeyboard = usePopupMenuKeyboard({
    getTrigger: () => fileMenuTriggerRef.current,
    isOpen: activeTopMenu === "file",
    onClose: () => setActiveTopMenu(null),
  });

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
    { action: "new", disabled: !canMutateDeck, icon: FolderPlus, label: "새 프레젠테이션", meta: "빈 덱" },
    { action: "import", disabled: !canMutateDeck, icon: Upload, label: "PPTX 가져오기", meta: pptxImportMeta },
    {
      action: "save",
      disabled: !canMutateDeck,
      icon: Cloud,
      label: saving ? "저장 중..." : "저장",
      meta: saveMenuMeta
    }
  ];
  const exportMenuItems = ["PPTX 내보내기", "PDF 내보내기", "PNG 내보내기", "JSON 백업 내보내기"].map(
    (label, index) => ({
      action: index === 0 ? "pptx" : "pending",
      disabled: index === 0 ? !canExportDeck || isPptxExporting : true,
      icon: Download,
      label: index === 0 && isPptxExporting ? "PPTX 내보내는 중..." : label,
      meta: index === 0 ? pptxExportMessage : "준비 중"
    })
  );
  const resizeMenuItems = [
    { active: canvas.preset === "wide-16-9", label: "와이드 16:9", meta: "1920 × 1080" },
    { active: canvas.preset === "standard-4-3", label: "표준 4:3", meta: "1024 × 768" }
  ];
  const editModeItems = [
    { active: true, label: "편집 중", meta: "텍스트와 오브젝트 수정" },
    { label: "보기 전용", meta: "슬라이드 탐색만" },
    { label: "검토", meta: "코멘트 중심" }
  ];
  const quickEditItems = [
    { icon: PenLine, label: "슬라이드 제목 수정" },
    { icon: FileText, label: "발표 메모 편집" },
    { icon: Wand2, label: "선택 요소 속성" }
  ];

  return (
    <header className="app-topbar" ref={topbarRef}>
      <div className="topbar-left">
        <div className="menu-stack">
          <div className="editor-document-title">
            <button aria-label="ORBIT 홈으로 이동" onClick={onExitToHome} type="button">
              <img alt="ORBIT" src={orbitLogo} />
            </button>
            <span>
              <strong>{deckTitle}</strong>
              <small>{saveStatusLabel}</small>
            </span>
          </div>
          <div className="menu-row">
            <button aria-label="ORBIT 홈으로 이동" className="top-icon-button" title="홈으로 이동" type="button" onClick={onExitToHome}>
              <Home size={15} />
            </button>
            <TopMenuButton activeTopMenu={activeTopMenu} buttonRef={fileMenuTriggerRef} label="파일" menu="file" setActiveTopMenu={setActiveTopMenu} />
            <TopMenuButton activeTopMenu={activeTopMenu} label="크기 조정" menu="resize" setActiveTopMenu={setActiveTopMenu} />
            <TopMenuButton activeTopMenu={activeTopMenu} label="편집 중" menu="editMode" setActiveTopMenu={setActiveTopMenu} />
            <button
              aria-expanded={activeTopMenu === "quickEdit"}
              aria-haspopup="menu"
              className={`top-icon-button ${activeTopMenu === "quickEdit" ? "active" : ""}`}
              title="Quick edit"
              type="button"
              onClick={() => setActiveTopMenu((current) => current === "quickEdit" ? null : "quickEdit")}
            >
              <PenLine size={15} />
            </button>
          </div>

          {activeTopMenu === "file" ? (
            <div
              className="file-menu-popover"
              data-editor-keyboard-scope="popup-menu"
              ref={fileMenuKeyboard.menuRef}
              role="menu"
              onKeyDown={fileMenuKeyboard.onKeyDown}
            >
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
                {fileMenuItems.map(({ action, disabled, icon: Icon, label, meta }) => (
                  <button
                    className="file-menu-item"
                    disabled={disabled}
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
                {exportMenuItems.map(({ action, disabled, icon: Icon, label, meta }) => (
                  <button className="file-menu-item" disabled={disabled} key={label} role="menuitem" type="button" onClick={() => action === "pptx" ? onExportPptx() : undefined}>
                    <span className="file-menu-label"><Icon size={16} />{label}</span>
                    <span className="file-menu-meta">{meta ? <small>{meta}</small> : null}</span>
                  </button>
                ))}
              </div>
            </div>
          ) : null}

          {activeTopMenu === "resize" ? <SimpleMenu items={resizeMenuItems} radio /> : null}
          {activeTopMenu === "editMode" ? <SimpleMenu items={editModeItems} radio /> : null}
          {activeTopMenu === "quickEdit" ? (
            <div className="file-menu-popover compact-popover" role="menu">
              <div className="file-menu-list">
                {quickEditItems.map(({ icon: Icon, label }) => (
                  <button className="file-menu-item" key={label} role="menuitem" type="button">
                    <span className="file-menu-label"><Icon size={16} />{label}</span>
                  </button>
                ))}
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
        {canMutateDeck ? (
          <EditorSaveControl
            disabled={isDeckLoading || isUsingFallbackDeck}
            emptyStateLabel={showLoadedFileLabel ? "불러온 파일" : "저장 기록 없음"}
            isSaving={saving}
            lastSavedAtLabel={lastSavedAtLabel}
            onSave={onSave}
            recoveryHint={recoveryHint}
            statusLabel={saveStatusLabel}
          />
        ) : null}
        {ooxmlSyncStatus ? <span className={`ooxml-sync-pill ${ooxmlSyncStatus.kind}`} title={ooxmlSyncStatus.detail}>{ooxmlSyncStatus.label}</span> : null}
        <button aria-label="발표 준비 경로 열기" className="editor-context-top-button" onClick={onOpenJourney} type="button"><Wand2 size={15} /><span>준비 경로</span></button>
        <button aria-label="브리프 열기" className="editor-context-top-button" onClick={() => { window.location.href = `/project/${encodeURIComponent(projectId)}/brief`; }} type="button"><FileText aria-hidden="true" size={15} /><span>브리프</span></button>
        <button aria-label="버전 기록 열기" className="editor-context-top-button" onClick={() => { window.location.href = `/project/${encodeURIComponent(projectId)}/history`; }} type="button"><History aria-hidden="true" size={15} /><span>버전</span></button>
        <PresentationMenu
          activeStartAction={activePresentationAction}
          canCreatePresentationSession={canCreatePresentationSession}
          canOpenAudienceLink={canOpenAudienceLink}
          canStartPersonalRehearsal={canStartPersonalRehearsal}
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
  buttonRef?: Ref<HTMLButtonElement>;
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
      ref={props.buttonRef}
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
