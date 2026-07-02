import { AlertCircle, Monitor, RefreshCcw } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  createDisplayManager,
  type DisplayManagerErrorCode,
  type DisplayScreenDescriptor,
  type SlideWindowRef
} from "./displayManager";
import type { PresentationChannelStatus } from "./usePresentationChannelPublisher";

type DisplayManagerLike = ReturnType<typeof createDisplayManager>;

export function DisplayControls(props: {
  channelStatus: PresentationChannelStatus;
  deckId: string;
  displayManager?: DisplayManagerLike;
  onPublishSnapshot: () => void;
  sessionId: string;
}) {
  const {
    channelStatus,
    deckId,
    displayManager = createDisplayManager(),
    onPublishSnapshot,
    sessionId
  } = props;
  const [displayState, setDisplayState] = useState<
    "idle" | "opening" | "screen-picker" | "manual-guide" | "failed"
  >("idle");
  const [message, setMessage] = useState("");
  const [screens, setScreens] = useState<DisplayScreenDescriptor[]>([]);
  const windowRef = useRef<SlideWindowRef | null>(null);
  const identity = useMemo(() => ({ deckId, sessionId }), [deckId, sessionId]);
  const isRecoverable = shouldShowRecoverAction(channelStatus) || displayState === "failed";

  useEffect(() => {
    const timer = window.setInterval(() => {
      if (windowRef.current?.closed) {
        setMessage("슬라이드 창이 닫혔습니다. 다시 열 수 있습니다.");
        setDisplayState("failed");
      }
    }, 1000);

    return () => window.clearInterval(timer);
  }, []);

  async function openSlideWindow() {
    setDisplayState("opening");
    setMessage("");

    const opened = displayManager.openSlideWindow(identity);
    if (!opened.ok) {
      setDisplayState("failed");
      setMessage(getDisplayControlMessage(opened.code));
      return;
    }

    windowRef.current = opened.value;
    onPublishSnapshot();

    const externalScreens = await displayManager.listExternalScreens();
    if (!externalScreens.ok) {
      setDisplayState("manual-guide");
      setMessage(getDisplayControlMessage(externalScreens.code));
      return;
    }

    if (externalScreens.value.length === 0) {
      setDisplayState("manual-guide");
      setMessage("외부 화면을 찾지 못했습니다. 열린 창을 발표 화면으로 직접 옮겨주세요.");
      return;
    }

    if (externalScreens.value.length > 1) {
      setScreens(externalScreens.value);
      setDisplayState("screen-picker");
      setMessage("슬라이드 창을 띄울 화면을 선택하세요.");
      return;
    }

    await placeWindowOnScreen(externalScreens.value[0]);
  }

  async function placeWindowOnScreen(screen: DisplayScreenDescriptor) {
    const slideWindow = windowRef.current;
    if (!slideWindow) {
      setDisplayState("failed");
      setMessage("슬라이드 창을 찾지 못했습니다. 다시 열어주세요.");
      return;
    }

    const placed = displayManager.placeOnScreen(slideWindow, screen);
    if (!placed.ok) {
      setDisplayState("manual-guide");
      setMessage(getDisplayControlMessage(placed.code));
      return;
    }

    const fullscreen = await displayManager.requestSlideWindowFullscreen(slideWindow);
    setDisplayState("manual-guide");
    setMessage(
      fullscreen.ok
        ? `${screen.label} 화면에 슬라이드 창을 배치했습니다.`
        : getDisplayControlMessage(fullscreen.code)
    );
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
      {message ? (
        <p className="presenter-display-message">
          <AlertCircle size={15} />
          {message}
        </p>
      ) : null}
      {displayState === "screen-picker" ? (
        <div className="presenter-display-screen-list" role="list">
          {screens.map((screen) => (
            <button
              key={`${screen.screenIndex}-${screen.left}-${screen.top}`}
              type="button"
              onClick={() => void placeWindowOnScreen(screen)}
            >
              {screen.label}
              <span>
                {screen.width} x {screen.height}
              </span>
            </button>
          ))}
        </div>
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
      "전체화면을 자동으로 시작하지 못했습니다. 슬라이드 창의 전체화면 버튼을 눌러주세요.",
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
  displayState: "idle" | "opening" | "screen-picker" | "manual-guide" | "failed"
) {
  if (displayState === "opening") return "창 여는 중";
  if (displayState === "screen-picker") return "화면 선택 필요";
  if (channelStatus === "connected") return "슬라이드 창 연결됨";
  if (channelStatus === "stale") return "슬라이드 창 응답 없음";
  if (channelStatus === "closed") return "슬라이드 창 닫힘";
  if (channelStatus === "unsupported") return "동기화 미지원";
  if (displayState === "manual-guide") return "수동 배치 안내";
  if (displayState === "failed") return "확인 필요";
  return "대기";
}
