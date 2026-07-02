import type { PresentationChannelIdentity } from "./presentationChannel";

export type DisplayManagerErrorCode =
  | "fullscreen-blocked"
  | "permission-denied"
  | "placement-failed"
  | "popup-blocked"
  | "window-management-unsupported";

export type DisplayManagerResult<T> =
  | { ok: true; value: T }
  | { code: DisplayManagerErrorCode; message: string; ok: false };

export type DisplayScreenDescriptor = {
  height: number;
  isPrimary: boolean;
  label: string;
  left: number;
  screenIndex: number;
  top: number;
  width: number;
};

type ScreenLike = {
  availHeight?: number;
  availWidth?: number;
  height: number;
  isPrimary?: boolean;
  label?: string;
  left: number;
  top: number;
  width: number;
};

type ScreenDetailsLike = {
  currentScreen?: ScreenLike;
  screens: ScreenLike[];
};

export type SlideWindowRef = {
  closed?: boolean;
  document?: {
    documentElement?: {
      requestFullscreen?: () => Promise<void>;
    };
  };
  focus?: () => void;
  moveTo?: (x: number, y: number) => void;
  resizeTo?: (width: number, height: number) => void;
};

export type DisplayBrowserPort = {
  getScreenDetails?: () => Promise<ScreenDetailsLike>;
  open: (url: string, target: string, features?: string) => SlideWindowRef | null;
};

export function createDisplayManager(port: DisplayBrowserPort = createBrowserDisplayPort()) {
  return {
    getCapabilities: () => ({
      canOpenWindow: typeof port.open === "function",
      canRequestFullscreen: true,
      canUseWindowManagement: typeof port.getScreenDetails === "function"
    }),
    listExternalScreens: async (): Promise<DisplayManagerResult<DisplayScreenDescriptor[]>> => {
      if (typeof port.getScreenDetails !== "function") {
        return createDisplayError(
          "window-management-unsupported",
          "이 브라우저는 화면 자동 배치를 지원하지 않습니다."
        );
      }

      try {
        const details = await port.getScreenDetails();
        const currentScreen = details.currentScreen;
        const screens = details.screens
          .map((screen, screenIndex) => ({
            descriptor: toScreenDescriptor(screen, screenIndex, currentScreen),
            screen
          }))
          .filter(({ descriptor, screen }) =>
            currentScreen ? !isSameScreen(screen, currentScreen) : !descriptor.isPrimary
          )
          .map(({ descriptor }) => descriptor);

        return {
          ok: true,
          value: screens
        };
      } catch (cause) {
        return createDisplayError(
          isPermissionDenied(cause) ? "permission-denied" : "placement-failed",
          "화면 정보를 가져오지 못했습니다."
        );
      }
    },
    openSlideWindow: (
      identity: PresentationChannelIdentity
    ): DisplayManagerResult<SlideWindowRef> => {
      const windowRef = port.open(
        buildPresentWindowUrl(identity),
        "orbit-present-window",
        "popup=yes,width=1280,height=720"
      );

      if (!windowRef) {
        return createDisplayError(
          "popup-blocked",
          "브라우저가 슬라이드 창 팝업을 차단했습니다."
        );
      }

      windowRef.focus?.();
      return { ok: true, value: windowRef };
    },
    placeOnScreen: (
      windowRef: SlideWindowRef,
      screen: DisplayScreenDescriptor
    ): DisplayManagerResult<void> => {
      try {
        windowRef.moveTo?.(screen.left, screen.top);
        windowRef.resizeTo?.(screen.width, screen.height);
        windowRef.focus?.();
        return { ok: true, value: undefined };
      } catch {
        return createDisplayError(
          "placement-failed",
          "슬라이드 창을 선택한 화면으로 이동하지 못했습니다."
        );
      }
    },
    requestSlideWindowFullscreen: async (
      windowRef: SlideWindowRef
    ): Promise<DisplayManagerResult<void>> => {
      try {
        const requestFullscreen = windowRef.document?.documentElement?.requestFullscreen;
        if (typeof requestFullscreen !== "function") {
          return createDisplayError(
            "fullscreen-blocked",
            "슬라이드 창 전체화면을 자동으로 시작하지 못했습니다."
          );
        }

        await requestFullscreen.call(windowRef.document?.documentElement);
        return { ok: true, value: undefined };
      } catch {
        return createDisplayError(
          "fullscreen-blocked",
          "슬라이드 창 전체화면을 자동으로 시작하지 못했습니다."
        );
      }
    }
  };
}

export function buildPresentWindowUrl(identity: PresentationChannelIdentity) {
  return `/present/${encodeURIComponent(identity.deckId)}?sessionId=${encodeURIComponent(
    identity.sessionId
  )}`;
}

function toScreenDescriptor(
  screen: ScreenLike,
  screenIndex: number,
  currentScreen?: ScreenLike
): DisplayScreenDescriptor {
  const isPrimary = Boolean(screen.isPrimary) || (!currentScreen && screenIndex === 0);

  return {
    height: screen.availHeight ?? screen.height,
    isPrimary,
    label: screen.label || `화면 ${screenIndex + 1}`,
    left: screen.left,
    screenIndex,
    top: screen.top,
    width: screen.availWidth ?? screen.width
  };
}

function isSameScreen(screen: ScreenLike, currentScreen?: ScreenLike) {
  if (!currentScreen) {
    return false;
  }

  return (
    screen.left === currentScreen.left &&
    screen.top === currentScreen.top &&
    screen.width === currentScreen.width &&
    screen.height === currentScreen.height
  );
}

function createDisplayError(
  code: DisplayManagerErrorCode,
  message: string
): DisplayManagerResult<never> {
  return { code, message, ok: false };
}

function isPermissionDenied(cause: unknown) {
  return (
    typeof DOMException !== "undefined" &&
    cause instanceof DOMException &&
    (cause.name === "NotAllowedError" || cause.name === "SecurityError")
  );
}

function createBrowserDisplayPort(): DisplayBrowserPort {
  return {
    getScreenDetails:
      typeof window !== "undefined" && "getScreenDetails" in window
        ? () =>
            (
              window as unknown as Window & {
                getScreenDetails: () => Promise<ScreenDetailsLike>;
              }
            ).getScreenDetails()
        : undefined,
    open: (url, target, features) =>
      typeof window === "undefined" ? null : window.open(url, target, features)
  };
}
