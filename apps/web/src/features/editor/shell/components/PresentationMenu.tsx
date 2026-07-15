import {
  IconChevronDown,
  IconLink,
  IconMicrophone,
  IconPlayerPlay
} from "@tabler/icons-react";

type PresentationMenuProps = {
  activeStartAction?: "presentation" | "rehearsal" | null;
  canStartPresentation: boolean;
  isOpen: boolean;
  onOpenAudienceLink: () => void;
  onStartPresentation: () => void;
  onStartRehearsal: () => void;
  onToggle: () => void;
};

export function PresentationMenu(props: PresentationMenuProps) {
  const {
    activeStartAction = null,
    canStartPresentation,
    isOpen,
    onOpenAudienceLink,
    onStartPresentation,
    onStartRehearsal,
    onToggle
  } = props;

  return (
    <>
      <button
        className="editor-rehearsal-button"
        disabled={!canStartPresentation}
        type="button"
        onClick={onStartRehearsal}
      >
        <IconMicrophone aria-hidden="true" size={16} />
        {activeStartAction === "rehearsal" ? "준비 중" : "리허설"}
      </button>
      <div className="top-action-menu">
        <div className={`editor-presentation-split ${isOpen ? "active" : ""}`}>
          <button
            className="editor-present-button"
            disabled={!canStartPresentation}
            type="button"
            onClick={onStartPresentation}
          >
            <IconPlayerPlay aria-hidden="true" size={16} />
            {activeStartAction === "presentation" ? "준비 중" : "발표하기"}
          </button>
          <button
            aria-expanded={isOpen}
            aria-haspopup="menu"
            aria-label="발표 메뉴 열기"
            className="editor-present-menu-button"
            disabled={!canStartPresentation}
            type="button"
            onClick={onToggle}
          >
            <IconChevronDown aria-hidden="true" size={14} />
          </button>
        </div>
        {isOpen ? (
          <div className="file-menu-popover action-popover" role="menu">
            <div className="file-menu-list">
              <button
                className="file-menu-item"
                role="menuitem"
                type="button"
                onClick={onOpenAudienceLink}
              >
                <span className="file-menu-label">
                  <IconLink aria-hidden="true" size={16} />
                  청중 링크·QR
                </span>
                <span className="file-menu-meta">
                  <small>QR 코드 발급</small>
                </span>
              </button>
            </div>
          </div>
        ) : null}
      </div>
    </>
  );
}
