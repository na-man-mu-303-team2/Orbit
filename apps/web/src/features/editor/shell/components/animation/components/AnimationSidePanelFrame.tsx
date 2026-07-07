import type { PointerEvent as ReactPointerEvent, ReactNode } from "react";
import { Sparkles, X } from "lucide-react";

type AnimationSidePanelFrameProps = {
  children: ReactNode;
  footer?: ReactNode;
  onClose: () => void;
  onResizeStart: (event: ReactPointerEvent<HTMLButtonElement>) => void;
};

export function AnimationSidePanelFrame(props: AnimationSidePanelFrameProps) {
  const { children, footer, onClose, onResizeStart } = props;

  return (
    <aside aria-label="애니메이션 패널" className="animation-side-pane">
      <button
        aria-label="애니메이션 패널 크기 조정"
        className="animation-side-pane-resizer"
        type="button"
        onPointerDown={onResizeStart}
      />
      <div className="animation-side-pane-content">
        <div className="animation-side-pane-header">
          <div className="animation-side-pane-title">
            <Sparkles size={16} />
            <div>
              <strong>애니메이션</strong>
            </div>
          </div>
          <button
            aria-label="애니메이션 패널 닫기"
            className="collapse-right-pane-button"
            type="button"
            onClick={onClose}
          >
            <X size={16} />
          </button>
        </div>

        <div className="animation-side-pane-body">
          <div className="animation-side-pane-scroll">{children}</div>
        </div>
        {footer ? footer : null}
      </div>
    </aside>
  );
}
