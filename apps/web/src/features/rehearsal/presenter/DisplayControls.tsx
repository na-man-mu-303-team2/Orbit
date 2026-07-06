import { AlertCircle, Monitor, RefreshCcw, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { DisplayManagerErrorCode } from "./displayManager";
import type { PresentationChannelStatus } from "./usePresentationChannelPublisher";

export type OpenSlideDisplayResult = {
  fullscreenStarted: boolean;
  presenterWindowOpened: boolean;
};

type DisplayState = "idle" | "opening" | "manual-guide" | "failed";

export function DisplayControls(props: {
  channelStatus: PresentationChannelStatus;
  onOpenSlideDisplay: () => Promise<OpenSlideDisplayResult>;
}) {
  const { channelStatus, onOpenSlideDisplay } = props;
  const [displayState, setDisplayState] = useState<DisplayState>("idle");
  const [message, setMessage] = useState("");
  const [dismissedMessage, setDismissedMessage] = useState("");
  const mountedRef = useRef(true);
  const isRecoverable = shouldShowRecoverAction(channelStatus) || displayState === "failed";

  useEffect(
    () => () => {
      mountedRef.current = false;
    },
    []
  );

  async function openSlideWindow() {
    setDisplayState("opening");
    setMessage("");
    setDismissedMessage("");

    const result = await onOpenSlideDisplay();
    if (!mountedRef.current) {
      return;
    }

    if (!result.presenterWindowOpened) {
      setDisplayState("failed");
      setMessage(getDisplayControlMessage("popup-blocked"));
      return;
    }

    if (!result.fullscreenStarted) {
      setDisplayState("manual-guide");
      setMessage(getDisplayControlMessage("fullscreen-blocked"));
      return;
    }

    setDisplayState("manual-guide");
    setMessage("현재 창은 슬라이드 전체화면으로 전환했고 새 창에 발표자 도구를 열었습니다.");
  }

  return (
    <section className="presenter-display-controls" aria-label="슬라이드 창 표시 제어">
      <button
        className="presenter-display-primary"
        type="button"
        onClick={() => void openSlideWindow()}
      >
        {isRecoverable ? <RefreshCcw size={16} /> : <Monitor size={16} />}
        {isRecoverable ? "슬라이드 창 다시 열기" : "슬라이드 창 열기"}
      </button>
      <span className="presenter-display-status">
        {getDisplayStatusLabel(channelStatus, displayState)}
      </span>
      {message && message !== dismissedMessage ? (
        <p className="presenter-display-message">
          <AlertCircle size={15} />
          <span>{message}</span>
          <button
            type="button"
            aria-label="안내 닫기"
            title="안내 닫기"
            onClick={() => setDismissedMessage(message)}
          >
            <X size={14} />
          </button>
        </p>
      ) : null}
    </section>
  );
}

export function shouldShowRecoverAction(status: PresentationChannelStatus) {
  return status === "closed" || status === "stale" || status === "failed";
}

export function getDisplayControlMessage(code: DisplayManagerErrorCode) {
  const messages: Record<DisplayManagerErrorCode, string> = {
    "fullscreen-blocked":
      "현재 창 전체화면을 자동으로 시작하지 못했습니다. 슬라이드 화면의 전체화면 버튼을 눌러주세요.",
    "permission-denied":
      "화면 배치 권한이 거부되었습니다. 열린 창을 발표 모니터로 옮긴 뒤 전체화면으로 전환해주세요.",
    "placement-failed":
      "자동 배치에 실패했습니다. 열린 창을 발표 모니터로 직접 옮긴 뒤 전체화면으로 전환해주세요.",
    "popup-blocked": "팝업이 차단되었습니다. 브라우저 팝업 허용 후 다시 열어주세요.",
    "window-management-unsupported":
      "이 브라우저는 자동 화면 배치를 지원하지 않습니다. 열린 창을 발표 모니터로 직접 옮겨주세요."
  };

  return messages[code];
}

export function getDisplayStatusLabel(
  channelStatus: PresentationChannelStatus,
  displayState: DisplayState
) {
  if (displayState === "opening") return "발표자 창 여는 중";
  if (channelStatus === "connected") return "슬라이드 화면 연결됨";
  if (channelStatus === "stale") return "슬라이드 화면 응답 없음";
  if (channelStatus === "closed") return "슬라이드 화면 닫힘";
  if (channelStatus === "unsupported") return "동기화 미지원";
  if (displayState === "manual-guide") return "전환 안내";
  if (displayState === "failed") return "확인 필요";
  return "대기";
}
