import {
  IconChevronDown,
  IconEdit,
  IconLink,
  IconMicrophone,
  IconPlayerPlay
} from "@tabler/icons-react";

import { EditorIconButton } from "./EditorIconButton";

type PresentationMenuProps = {
  activeStartAction?: "presentation" | "rehearsal" | null;
  canOpenAudienceLink: boolean;
  canStartPresentation: boolean;
  isSlideRehearsalActive?: boolean;
  isOpen: boolean;
  onOpenAudienceLink: () => void;
  onStartPresentation: () => void;
  onStartRehearsal: () => void;
  onToggle: () => void;
};

export function PresentationMenu(props: PresentationMenuProps) {
  const {
    activeStartAction = null,
    canOpenAudienceLink,
    canStartPresentation,
    isSlideRehearsalActive = false,
    isOpen,
    onOpenAudienceLink,
    onStartPresentation,
    onStartRehearsal,
    onToggle
  } = props;

  return (
    <>
      <EditorIconButton
        aria-pressed={isSlideRehearsalActive}
        className={`editor-rehearsal-button ${isSlideRehearsalActive ? "active" : ""}`}
        disabled={!canStartPresentation && !isSlideRehearsalActive}
        icon={
          isSlideRehearsalActive ? (
            <IconEdit size={16} />
          ) : (
            <IconMicrophone size={16} />
          )
        }
        label={
          isSlideRehearsalActive
            ? "에디터로 돌아가기"
            : activeStartAction === "rehearsal"
              ? "리허설 준비 중"
              : "슬라이드 한 장 리허설"
        }
        title={
          isSlideRehearsalActive
            ? "에디터로 돌아가기"
            : "슬라이드 한 장 리허설"
        }
        onClick={onStartRehearsal}
      />
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
            disabled={!canOpenAudienceLink}
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
