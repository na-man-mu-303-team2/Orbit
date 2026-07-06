import { describe, expect, it, vi } from "vitest";
import {
  buildSlideWindowFeatures,
  buildPresentWindowUrl,
  createDisplayManager,
  type DisplayBrowserPort,
  type SlideWindowRef
} from "./displayManager";

const identity = {
  deckId: "deck_p0_animation",
  sessionId: "session-presenter-1"
};

describe("displayManager", () => {
  it("builds the presenter slide-window url with encoded identity", () => {
    expect(buildPresentWindowUrl(identity)).toBe(
      "/present/deck_p0_animation?sessionId=session-presenter-1"
    );
    expect(
      buildPresentWindowUrl({
        deckId: "deck a",
        sessionId: "session/a"
      })
    ).toBe("/present/deck%20a?sessionId=session%2Fa");
  });

  it("opens the slide window and focuses it", () => {
    const focus = vi.fn();
    const port: DisplayBrowserPort = {
      open: vi.fn(() => ({ focus }))
    };
    const manager = createDisplayManager(port);

    const result = manager.openSlideWindow(identity);

    expect(result.ok).toBe(true);
    expect(port.open).toHaveBeenCalledWith(
      "/present/deck_p0_animation?sessionId=session-presenter-1",
      "orbit-present-window",
      "popup=yes,width=1280,height=720"
    );
    expect(focus).toHaveBeenCalled();
  });

  it("opens the slide window on a selected screen when screen bounds are provided", () => {
    const focus = vi.fn();
    const port: DisplayBrowserPort = {
      open: vi.fn(() => ({ focus }))
    };
    const manager = createDisplayManager(port);

    const result = manager.openSlideWindow(identity, {
      screen: {
        height: 1080,
        isCurrent: false,
        isPrimary: false,
        label: "HDMI",
        left: 1440,
        screenIndex: 1,
        top: 0,
        width: 1920
      },
      target: "orbit-slide-session-presenter-1"
    });

    expect(result.ok).toBe(true);
    expect(port.open).toHaveBeenCalledWith(
      "/present/deck_p0_animation?sessionId=session-presenter-1",
      "orbit-slide-session-presenter-1",
      "popup=yes,width=1920,height=1080,left=1440,top=0"
    );
  });

  it("builds popup features from default and selected screen bounds", () => {
    expect(buildSlideWindowFeatures()).toBe("popup=yes,width=1280,height=720");
    expect(
      buildSlideWindowFeatures({
        height: 1080,
        isCurrent: false,
        isPrimary: false,
        label: "HDMI",
        left: 1440,
        screenIndex: 1,
        top: 0,
        width: 1920
      })
    ).toBe("popup=yes,width=1920,height=1080,left=1440,top=0");
  });

  it("returns a popup-blocked error when the window cannot be opened", () => {
    const manager = createDisplayManager({
      open: () => null
    });

    expect(manager.openSlideWindow(identity)).toEqual({
      code: "popup-blocked",
      message: "브라우저가 슬라이드 창 팝업을 차단했습니다.",
      ok: false
    });
  });

  it("lists all screens from Window Management details and marks the current screen", async () => {
    const manager = createDisplayManager({
      getScreenDetails: async () => ({
        currentScreen: {
          height: 900,
          isPrimary: true,
          label: "내장 화면",
          left: 0,
          top: 0,
          width: 1440
        },
        screens: [
          {
            height: 900,
            isPrimary: true,
            label: "내장 화면",
            left: 0,
            top: 0,
            width: 1440
          },
          {
            availHeight: 1080,
            availWidth: 1920,
            height: 1080,
            isPrimary: false,
            label: "HDMI",
            left: 1440,
            top: 0,
            width: 1920
          }
        ]
      }),
      open: () => null
    });

    await expect(manager.listExternalScreens()).resolves.toEqual({
      ok: true,
      value: [
        {
          height: 900,
          isCurrent: true,
          isPrimary: true,
          label: "내장 화면(현재)",
          left: 0,
          screenIndex: 0,
          top: 0,
          width: 1440
        },
        {
          height: 1080,
          isCurrent: false,
          isPrimary: false,
          label: "HDMI",
          left: 1440,
          screenIndex: 1,
          top: 0,
          width: 1920
        }
      ]
    });
  });

  it("keeps a primary target screen when the presenter is on another screen", async () => {
    const manager = createDisplayManager({
      getScreenDetails: async () => ({
        currentScreen: {
          height: 900,
          isPrimary: false,
          label: "노트북",
          left: 0,
          top: 0,
          width: 1440
        },
        screens: [
          {
            height: 900,
            isPrimary: false,
            label: "노트북",
            left: 0,
            top: 0,
            width: 1440
          },
          {
            availHeight: 1080,
            availWidth: 1920,
            height: 1080,
            isPrimary: true,
            label: "HDMI",
            left: 1440,
            top: 0,
            width: 1920
          }
        ]
      }),
      open: () => null
    });

    await expect(manager.listExternalScreens()).resolves.toEqual({
      ok: true,
      value: [
        {
          height: 900,
          isCurrent: true,
          isPrimary: false,
          label: "노트북(현재)",
          left: 0,
          screenIndex: 0,
          top: 0,
          width: 1440
        },
        {
          height: 1080,
          isCurrent: false,
          isPrimary: true,
          label: "HDMI",
          left: 1440,
          screenIndex: 1,
          top: 0,
          width: 1920
        }
      ]
    });
  });

  it("keeps the current screen when it is the only screen", async () => {
    const manager = createDisplayManager({
      getScreenDetails: async () => ({
        currentScreen: {
          height: 900,
          isPrimary: false,
          label: "노트북",
          left: 0,
          top: 0,
          width: 1440
        },
        screens: [
          {
            height: 900,
            isPrimary: false,
            label: "노트북",
            left: 0,
            top: 0,
            width: 1440
          }
        ]
      }),
      open: () => null
    });

    await expect(manager.listExternalScreens()).resolves.toEqual({
      ok: true,
      value: [
        {
          height: 900,
          isCurrent: true,
          isPrimary: false,
          label: "노트북(현재)",
          left: 0,
          screenIndex: 0,
          top: 0,
          width: 1440
        }
      ]
    });
  });

  it("marks the first screen as primary when current screen is unavailable", async () => {
    const manager = createDisplayManager({
      getScreenDetails: async () => ({
        screens: [
          {
            height: 900,
            isPrimary: true,
            label: "Primary",
            left: 0,
            top: 0,
            width: 1440
          },
          {
            height: 1080,
            isPrimary: false,
            label: "HDMI",
            left: 1440,
            top: 0,
            width: 1920
          }
        ]
      }),
      open: () => null
    });

    await expect(manager.listExternalScreens()).resolves.toEqual({
      ok: true,
      value: [
        {
          height: 900,
          isCurrent: false,
          isPrimary: true,
          label: "Primary",
          left: 0,
          screenIndex: 0,
          top: 0,
          width: 1440
        },
        {
          height: 1080,
          isCurrent: false,
          isPrimary: false,
          label: "HDMI",
          left: 1440,
          screenIndex: 1,
          top: 0,
          width: 1920
        }
      ]
    });
  });

  it("reports unsupported Window Management separately", async () => {
    const manager = createDisplayManager({
      open: () => null
    });

    await expect(manager.listExternalScreens()).resolves.toMatchObject({
      code: "window-management-unsupported",
      ok: false
    });
  });

  it("times out when Window Management details never resolve", async () => {
    vi.useFakeTimers();
    const manager = createDisplayManager({
      getScreenDetails: () => new Promise(() => {}),
      open: () => null
    });

    const result = manager.listExternalScreens();
    await vi.advanceTimersByTimeAsync(8000);

    await expect(result).resolves.toMatchObject({
      code: "placement-failed",
      ok: false
    });
    vi.useRealTimers();
  });

  it("places a slide window on the selected screen", () => {
    const windowRef: SlideWindowRef = {
      focus: vi.fn(),
      moveTo: vi.fn(),
      resizeTo: vi.fn()
    };
    const manager = createDisplayManager({
      open: () => windowRef
    });

    expect(
      manager.placeOnScreen(windowRef, {
        height: 1080,
        isCurrent: false,
        isPrimary: false,
        label: "HDMI",
        left: 1440,
        screenIndex: 1,
        top: 0,
        width: 1920
      })
    ).toEqual({ ok: true, value: undefined });
    expect(windowRef.moveTo).toHaveBeenCalledWith(1440, 0);
    expect(windowRef.resizeTo).toHaveBeenCalledWith(1920, 1080);
    expect(windowRef.focus).toHaveBeenCalled();
  });

  it("reports fullscreen-blocked when fullscreen cannot be requested", async () => {
    const manager = createDisplayManager({
      open: () => ({})
    });

    await expect(manager.requestSlideWindowFullscreen({})).resolves.toMatchObject({
      code: "fullscreen-blocked",
      ok: false
    });
  });

  it("requests fullscreen on the slide window document element when available", async () => {
    const requestFullscreen = vi.fn().mockResolvedValue(undefined);
    const manager = createDisplayManager({
      open: () => ({})
    });

    await expect(
      manager.requestSlideWindowFullscreen({
        document: {
          documentElement: {
            requestFullscreen
          }
        }
      })
    ).resolves.toEqual({ ok: true, value: undefined });
    expect(requestFullscreen).toHaveBeenCalled();
  });
});
