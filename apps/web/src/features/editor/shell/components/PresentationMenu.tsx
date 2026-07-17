import {
  IconChevronDown,
  IconLink,
  IconMicrophone,
  IconPlayerPlay
} from "@tabler/icons-react";
import { useRef } from "react";

import { usePopupMenuKeyboard } from "./usePopupMenuKeyboard";

type PresentationMenuProps = {
  activeStartAction?: "presentation" | "rehearsal" | null;
  canCreatePresentationSession: boolean;
  canOpenAudienceLink: boolean;
  canStartPersonalRehearsal: boolean;
  isOpen: boolean;
  onOpenAudienceLink: () => void;
  onStartPresentation: () => void;
  onStartRehearsal: () => void;
  onToggle: () => void;
};

export function PresentationMenu(props: PresentationMenuProps) {
  const {
    activeStartAction = null,
    canCreatePresentationSession,
    canOpenAudienceLink,
    canStartPersonalRehearsal,
    isOpen,
    onOpenAudienceLink,
    onStartPresentation,
    onStartRehearsal,
    onToggle
  } = props;
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuKeyboard = usePopupMenuKeyboard({
    getTrigger: () => triggerRef.current,
    isOpen,
    onClose: onToggle,
  });

  return (
    <>
      <button
        aria-busy={activeStartAction === "rehearsal"}
        aria-live="polite"
        className="editor-rehearsal-button"
        disabled={!canStartPersonalRehearsal || activeStartAction !== null}
        type="button"
        onClick={onStartRehearsal}
      >
        <IconMicrophone aria-hidden="true" size={16} />
        {activeStartAction === "rehearsal" ? "준비 중" : "리허설"}
      </button>
      {canCreatePresentationSession ? <div className="top-action-menu">
        <div className={`editor-presentation-split ${isOpen ? "active" : ""}`}>
          <button
            className="editor-present-button"
            disabled={!canOpenAudienceLink || activeStartAction !== null}
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
            disabled={!canOpenAudienceLink}
            ref={triggerRef}
            type="button"
            onClick={onToggle}
          >
            <IconChevronDown aria-hidden="true" size={14} />
          </button>
        </div>
        {isOpen ? (
          <div
            className="file-menu-popover action-popover"
            data-editor-keyboard-scope="popup-menu"
            ref={menuKeyboard.menuRef}
            role="menu"
            onKeyDown={menuKeyboard.onKeyDown}
          >
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
      </div> : null}
    </>
  );
}
