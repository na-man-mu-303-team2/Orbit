import {
  IconAlertCircle as AlertCircle,
  IconChevronDown as ChevronDown,
  IconMaximize as Maximize2,
  IconDeviceDesktop as Monitor,
  IconRefresh as RefreshCcw,
  IconX as X,
} from "@tabler/icons-react";
import { useEffect, useRef, useState } from "react";
import type {
  DisplayManagerErrorCode,
  DisplayScreenDescriptor,
} from "./displayManager";
import type { PresentationChannelStatus } from "./usePresentationChannelPublisher";

export type SlideDisplayMode = "current-window" | "slide-window";

export type SlideDisplayOptions = {
  autoPlace: boolean;
  displayMode: SlideDisplayMode;
  fullscreen: boolean;
  presenterView: boolean;
  startFromBeginning: boolean;
  targetScreen?: DisplayScreenDescriptor | null;
};

export type OpenSlideDisplayResult = {
  autoPlaced?: boolean;
  displayMode: SlideDisplayMode;
  displayOpened: boolean;
  fullscreenStarted: boolean;
  placementCode?: DisplayManagerErrorCode;
  placementTargetLabel?: string;
};

export type RequestDisplayScreensResult =
  | { ok: true; screens: DisplayScreenDescriptor[] }
  | { code: DisplayManagerErrorCode; ok: false };

export type RequestSlideWindowFullscreenResult =
  | { ok: true }
  | { code: DisplayManagerErrorCode; ok: false };

type DisplayState = "idle" | "opening" | "manual-guide" | "failed";

type RemoteFullscreenState = "idle" | "available" | "requested" | "failed";

type ScreenRequestState = "idle" | "loading" | "ready" | "failed";

const SCREEN_REQUEST_TIMEOUT_MS = 10000;

const defaultSlideDisplayOptions: SlideDisplayOptions = {
  autoPlace: true,
  displayMode: "slide-window",
  fullscreen: true,
  presenterView: true,
  startFromBeginning: false,
};

export function DisplayControls(props: {
  channelStatus: PresentationChannelStatus;
  onOpenSlideDisplay: (
    options: SlideDisplayOptions,
  ) => Promise<OpenSlideDisplayResult>;
  onRequestDisplayScreens?: () => Promise<RequestDisplayScreensResult>;
  onRequestSlideWindowFullscreen?: () => Promise<RequestSlideWindowFullscreenResult>;
}) {
  const {
    channelStatus,
    onOpenSlideDisplay,
    onRequestDisplayScreens,
    onRequestSlideWindowFullscreen,
  } = props;
  const [displayState, setDisplayState] = useState<DisplayState>("idle");
  const [message, setMessage] = useState("");
  const [dismissedMessage, setDismissedMessage] = useState("");
  const [isOptionsOpen, setIsOptionsOpen] = useState(false);
  const [options, setOptions] = useState<SlideDisplayOptions>(
    defaultSlideDisplayOptions,
  );
  const [remoteFullscreenState, setRemoteFullscreenState] =
    useState<RemoteFullscreenState>("idle");
  const [screenRequestState, setScreenRequestState] =
    useState<ScreenRequestState>("idle");
  const [screenMessage, setScreenMessage] = useState("");
  const [screenOptions, setScreenOptions] = useState<DisplayScreenDescriptor[]>(
    [],
  );
  const [selectedScreenIndex, setSelectedScreenIndex] = useState<number | null>(
    null,
  );
  const mountedRef = useRef(true);
  const isRecoverable =
    shouldShowRecoverAction(channelStatus) || displayState === "failed";
  const canUseFullscreenDelegation = canDelegateSlideWindowFullscreen();
  const canStartRemoteFullscreen =
    channelStatus === "connected" &&
    remoteFullscreenState !== "idle" &&
    canUseFullscreenDelegation &&
    Boolean(onRequestSlideWindowFullscreen);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  async function openSlideWindow(launchOptions = options) {
    const resolvedLaunchOptions = resolveLaunchOptions(launchOptions);
    // Activation-consuming APIs must start inside the original click before timeout.
    const openSlideDisplayResult = onOpenSlideDisplay(resolvedLaunchOptions);

    setDisplayState("opening");
    setMessage("");
    setDismissedMessage("");
    setIsOptionsOpen(false);
    setRemoteFullscreenState("idle");

    const result = await openSlideDisplayResult;
    if (!mountedRef.current) {
      return;
    }

    if (!result.displayOpened) {
      setDisplayState("failed");
      setMessage(getDisplayControlMessage("popup-blocked"));
      return;
    }

    if (resolvedLaunchOptions.fullscreen && !result.fullscreenStarted) {
      const canRequestRemoteFullscreen =
        result.displayMode === "slide-window" &&
        canUseFullscreenDelegation &&
        Boolean(onRequestSlideWindowFullscreen);

      setRemoteFullscreenState(
        canRequestRemoteFullscreen ? "available" : "idle",
      );
      setDisplayState("manual-guide");
      setMessage(
        result.displayMode === "slide-window"
          ? canRequestRemoteFullscreen
            ? getSlideWindowRemoteFullscreenMessage(result)
            : getSlideWindowLaunchMessage(result)
          : "전체화면 전환이 차단되었습니다. 슬라이드 화면의 전체화면 버튼을 눌러주세요.",
      );
      return;
    }

    setDisplayState("manual-guide");
    setMessage(
      result.displayMode === "slide-window"
        ? getSlideWindowLaunchMessage(result)
        : "현재 창에서 슬라이드쇼를 시작했습니다.",
    );
  }

  async function requestSlideWindowFullscreen() {
    if (!onRequestSlideWindowFullscreen) {
      setRemoteFullscreenState("failed");
      setMessage(getDisplayControlMessage("fullscreen-blocked"));
      return;
    }

    const requestResult = onRequestSlideWindowFullscreen();
    setRemoteFullscreenState("requested");
    setMessage("슬라이드 창에 전체화면 요청을 보냈습니다.");
    setDismissedMessage("");

    const result = await requestResult;
    if (!mountedRef.current) {
      return;
    }

    if (!result.ok) {
      setRemoteFullscreenState("failed");
      setMessage(getDisplayControlMessage(result.code));
    }
  }

  function resolveLaunchOptions(
    launchOptions: SlideDisplayOptions,
  ): SlideDisplayOptions {
    const selectedScreen =
      screenOptions.find(
        (screen) => screen.screenIndex === selectedScreenIndex,
      ) ?? null;
    const targetScreen =
      launchOptions.targetScreen ??
      (selectedScreen && !selectedScreen.isCurrent ? selectedScreen : null);

    return {
      ...launchOptions,
      targetScreen: launchOptions.autoPlace ? targetScreen : null,
    };
  }

  async function requestDisplayScreens() {
    if (!onRequestDisplayScreens) {
      setScreenRequestState("failed");
      setScreenMessage(
        getDisplayControlMessage("window-management-unsupported"),
      );
      return;
    }

    // Window Management permission must be requested inside the original click activation.
    const requestScreensResult = onRequestDisplayScreens();

    setScreenRequestState("loading");
    setScreenMessage("브라우저 권한을 요청하는 중입니다.");

    const result = await withScreenRequestTimeout(requestScreensResult);
    if (!mountedRef.current) {
      return;
    }

    if (!result.ok) {
      setScreenOptions([]);
      setSelectedScreenIndex(null);
      setScreenRequestState("failed");
      setScreenMessage(getDisplayControlMessage(result.code));
      return;
    }

    setScreenOptions(result.screens);
    const defaultScreen = getDefaultAutoPlacementScreen(result.screens);
    setSelectedScreenIndex(defaultScreen?.screenIndex ?? null);
    setScreenRequestState("ready");
    setScreenMessage(
      defaultScreen
        ? `${defaultScreen?.label ?? "추가 화면"}으로 자동 배치합니다.`
        : "추가 디스플레이를 찾지 못했습니다. 열린 창을 직접 옮겨주세요.",
    );
  }

  function setPresenterView(enabled: boolean) {
    setOptions((current) => ({
      ...current,
      displayMode: enabled ? "slide-window" : current.displayMode,
      presenterView: enabled,
    }));
  }

  function setDisplayMode(displayMode: SlideDisplayMode) {
    setOptions((current) => ({
      ...current,
      displayMode,
      presenterView:
        displayMode === "current-window" ? false : current.presenterView,
    }));
  }

  return (
    <section
      className="presenter-display-controls"
      aria-label="슬라이드 창 표시 제어"
    >
      <div className="presenter-display-split">
        <button
          className="presenter-display-primary"
          type="button"
          onClick={() => void openSlideWindow()}
        >
          {isRecoverable ? <RefreshCcw size={16} /> : <Monitor size={16} />}
          {isRecoverable ? "슬라이드 창 다시 열기" : "슬라이드 창 열기"}
        </button>
        <button
          aria-expanded={isOptionsOpen}
          aria-label="프레젠테이션 옵션"
          className="presenter-display-options-toggle"
          title="프레젠테이션 옵션"
          type="button"
          onClick={() => setIsOptionsOpen((current) => !current)}
        >
          <ChevronDown size={15} />
        </button>
      </div>
      {canStartRemoteFullscreen ? (
        <button
          className="presenter-display-fullscreen-start"
          type="button"
          onClick={() => void requestSlideWindowFullscreen()}
        >
          <Maximize2 size={15} />
          {remoteFullscreenState === "available"
            ? "전체화면 시작"
            : "전체화면 다시 시작"}
        </button>
      ) : null}
      {isOptionsOpen ? (
        <div
          aria-label="프레젠테이션 디스플레이 옵션"
          className="presenter-display-options-popover"
          role="dialog"
        >
          <div className="presenter-display-options-header">
            <strong>프레젠테이션 디스플레이 옵션</strong>
            <button
              aria-label="옵션 닫기"
              title="옵션 닫기"
              type="button"
              onClick={() => setIsOptionsOpen(false)}
            >
              <X size={15} />
            </button>
          </div>
          <label className="presenter-display-option-row">
            <input
              checked={options.presenterView}
              type="checkbox"
              onChange={(event) =>
                setPresenterView(event.currentTarget.checked)
              }
            />
            <span>
              <strong>발표자 보기</strong>
              <small>
                현재 창에 발표자 도구를 유지하고 슬라이드 창을 별도로 엽니다.
              </small>
            </span>
          </label>
          <label className="presenter-display-option-row">
            <input
              checked={options.startFromBeginning}
              type="checkbox"
              onChange={(event) => {
                const checked = event.currentTarget.checked;
                setOptions((current) => ({
                  ...current,
                  startFromBeginning: checked,
                }));
              }}
            />
            <span>
              <strong>첫 슬라이드부터 표시</strong>
              <small>
                실행 전에 슬라이드와 애니메이션 단계를 처음으로 되돌립니다.
              </small>
            </span>
          </label>
          <label className="presenter-display-option-row">
            <input
              checked={options.autoPlace}
              type="checkbox"
              onChange={(event) => {
                const checked = event.currentTarget.checked;
                setOptions((current) => ({
                  ...current,
                  autoPlace: checked,
                }));
              }}
            />
            <span>
              <strong>발표 모니터 자동 배치</strong>
              <small>
                권한을 허용하면 추가 디스플레이로 슬라이드 창을 자동 이동합니다.
              </small>
            </span>
          </label>
          {options.displayMode === "slide-window" && options.autoPlace ? (
            <div className="presenter-display-screen-picker">
              <div className="presenter-display-screen-picker-header">
                <span>슬라이드쇼 표시</span>
                <button
                  type="button"
                  onClick={() => void requestDisplayScreens()}
                >
                  {screenRequestState === "loading"
                    ? "다시 요청"
                    : "화면 권한 요청"}
                </button>
              </div>
              {screenOptions.length > 0 ? (
                <div
                  className="presenter-display-screen-options"
                  role="radiogroup"
                  aria-label="발표 모니터 선택"
                >
                  {screenOptions.map((screen) => (
                    <label key={screen.screenIndex}>
                      <input
                        checked={selectedScreenIndex === screen.screenIndex}
                        name="presentation-target-screen"
                        type="radio"
                        onChange={() => {
                          setSelectedScreenIndex(screen.screenIndex);
                          setScreenMessage(
                            `${screen.label}으로 자동 배치합니다.`,
                          );
                        }}
                      />
                      <span>
                        <strong>{screen.label}</strong>
                        <small>
                          {screen.width} x {screen.height}
                        </small>
                      </span>
                    </label>
                  ))}
                </div>
              ) : null}
              {screenMessage ? <p>{screenMessage}</p> : null}
            </div>
          ) : null}
          <label className="presenter-display-option-row">
            <input
              checked={options.fullscreen}
              type="checkbox"
              onChange={(event) => {
                const checked = event.currentTarget.checked;
                setOptions((current) => ({
                  ...current,
                  fullscreen: checked,
                }));
              }}
            />
            <span>
              <strong>전체화면</strong>
              <small>현재 창 모드에서는 즉시 fullscreen을 요청합니다.</small>
            </span>
          </label>
          <div
            className="presenter-display-option-group"
            role="radiogroup"
            aria-label="슬라이드쇼 표시 방식"
          >
            <span>슬라이드쇼 표시</span>
            <label>
              <input
                checked={options.displayMode === "slide-window"}
                name="slide-display-mode"
                type="radio"
                onChange={() => setDisplayMode("slide-window")}
              />
              <span>별도 슬라이드 창</span>
            </label>
            <label>
              <input
                checked={options.displayMode === "current-window"}
                name="slide-display-mode"
                type="radio"
                onChange={() => setDisplayMode("current-window")}
              />
              <span>현재 창</span>
            </label>
          </div>
          <div className="presenter-display-options-actions">
            <button type="button" onClick={() => setIsOptionsOpen(false)}>
              취소
            </button>
            <button type="button" onClick={() => void openSlideWindow(options)}>
              슬라이드쇼 시작
            </button>
          </div>
        </div>
      ) : null}
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

export function getDefaultAutoPlacementScreen(
  screens: DisplayScreenDescriptor[],
) {
  return screens.find((screen) => !screen.isCurrent) ?? null;
}

export function canDelegateSlideWindowFullscreen(userAgent = readUserAgent()) {
  const edgeMajor = readBrowserMajor(userAgent, /\bEdg\/(\d+)/);
  if (edgeMajor !== null) {
    return edgeMajor >= 104;
  }

  const chromeMajor = readBrowserMajor(
    userAgent,
    /\b(?:Chrome|Chromium)\/(\d+)/,
  );
  return (
    chromeMajor !== null && chromeMajor >= 104 && !/\bOPR\//.test(userAgent)
  );
}

export function getDisplayControlMessage(code: DisplayManagerErrorCode) {
  const messages: Record<DisplayManagerErrorCode, string> = {
    "fullscreen-blocked":
      "슬라이드 창을 열었습니다. 열린 슬라이드 창의 전체화면 버튼을 눌러주세요.",
    "permission-denied":
      "화면 배치 권한이 거부되었습니다. 열린 창을 발표 모니터로 옮긴 뒤 전체화면으로 전환해주세요.",
    "placement-failed":
      "자동 배치에 실패했습니다. 열린 창을 발표 모니터로 직접 옮긴 뒤 전체화면으로 전환해주세요.",
    "popup-blocked":
      "팝업이 차단되었습니다. 브라우저 팝업 허용 후 다시 열어주세요.",
    "window-management-unsupported":
      "이 브라우저는 자동 화면 배치를 지원하지 않습니다. 열린 창을 발표 모니터로 직접 옮겨주세요.",
  };

  return messages[code];
}

function withScreenRequestTimeout(
  promise: Promise<RequestDisplayScreensResult>,
): Promise<RequestDisplayScreensResult> {
  return new Promise((resolve) => {
    const timeoutId = window.setTimeout(() => {
      resolve({ code: "placement-failed", ok: false });
    }, SCREEN_REQUEST_TIMEOUT_MS);

    promise.then(
      (value) => {
        window.clearTimeout(timeoutId);
        resolve(value);
      },
      () => {
        window.clearTimeout(timeoutId);
        resolve({ code: "placement-failed", ok: false });
      },
    );
  });
}

function getSlideWindowLaunchMessage(result: OpenSlideDisplayResult) {
  if (result.placementCode && result.placementCode !== "fullscreen-blocked") {
    return getDisplayControlMessage(result.placementCode);
  }

  if (result.autoPlaced && result.placementTargetLabel) {
    return `${result.placementTargetLabel}로 슬라이드 창을 옮겼습니다. 열린 슬라이드 창의 전체화면 버튼을 눌러주세요.`;
  }

  return getDisplayControlMessage("fullscreen-blocked");
}

function getSlideWindowRemoteFullscreenMessage(result: OpenSlideDisplayResult) {
  if (result.placementCode && result.placementCode !== "fullscreen-blocked") {
    return getDisplayControlMessage(result.placementCode);
  }

  if (result.autoPlaced && result.placementTargetLabel) {
    return `${result.placementTargetLabel}로 슬라이드 창을 옮겼습니다. 연결되면 이 화면에서 전체화면 시작을 누르세요.`;
  }

  return "슬라이드 창을 열었습니다. 연결되면 이 화면에서 전체화면 시작을 누르세요.";
}

function readBrowserMajor(userAgent: string, pattern: RegExp) {
  const match = userAgent.match(pattern);
  if (!match?.[1]) {
    return null;
  }

  const major = Number(match[1]);
  return Number.isFinite(major) ? major : null;
}

function readUserAgent() {
  return typeof navigator === "undefined" ? "" : navigator.userAgent;
}
