import {
  ChevronDown,
  MonitorPlay,
  Share2,
  Sparkles,
  type LucideIcon
} from "lucide-react";

type PresentationMenuAction = "presentation" | "rehearsal" | "audience-link";

type PresentationMenuItem = {
  action: PresentationMenuAction;
  icon: LucideIcon;
  label: string;
  meta: string;
};

type PresentationMenuProps = {
  activeStartAction?: "presentation" | "rehearsal" | null;
  canStartPresentation: boolean;
  isOpen: boolean;
  onOpenAudienceLink: () => void;
  onStartPresentation: () => void;
  onStartRehearsal: () => void;
  onToggle: () => void;
};

const presentationItems: PresentationMenuItem[] = [
  {
    action: "presentation",
    icon: MonitorPlay,
    label: "발표 시작",
    meta: "발표용 화면 열기"
  },
  {
    action: "rehearsal",
    icon: Sparkles,
    label: "리허설 시작",
    meta: "발표 흐름 점검"
  },
  {
    action: "audience-link",
    icon: Share2,
    label: "청중 링크·QR",
    meta: "QR 코드 발급"
  }
];

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

  function handleSelect(action: PresentationMenuAction) {
    if (action === "presentation") {
      onStartPresentation();
      return;
    }

    if (action === "rehearsal") {
      onStartRehearsal();
      return;
    }

    if (action === "audience-link") {
      onOpenAudienceLink();
    }
  }

  return (
    <div className="top-action-menu">
      <button
        aria-expanded={isOpen}
        aria-haspopup="menu"
        className={`header-chip-button ${isOpen ? "active" : ""}`}
        type="button"
        onClick={onToggle}
      >
        프레젠테이션 <ChevronDown size={14} />
      </button>
      {isOpen ? (
        <div className="file-menu-popover action-popover" role="menu">
          <div className="file-menu-list">
            {presentationItems.map(({ action, icon: Icon, label, meta }) => {
              const isStartAction =
                action === "presentation" || action === "rehearsal";
              const busyLabel =
                action === "presentation"
                  ? "발표 화면 준비 중..."
                  : "리허설 준비 중...";

              return (
                <button
                  className="file-menu-item"
                  disabled={isStartAction && !canStartPresentation}
                  key={label}
                  role="menuitem"
                  type="button"
                  onClick={() => handleSelect(action)}
                >
                  <span className="file-menu-label">
                    <Icon size={16} />
                    {label}
                  </span>
                  <span className="file-menu-meta">
                    <small>
                      {activeStartAction === action ? busyLabel : meta}
                    </small>
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      ) : null}
    </div>
  );
}
