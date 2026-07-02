import { describe, expect, it, vi } from "vitest";
import {
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

  it("lists non-primary external screens from Window Management details", async () => {
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
          height: 1080,
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

  it("keeps a primary external screen when the presenter is on another screen", async () => {
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
          height: 1080,
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

  it("excludes the current screen even when it is non-primary", async () => {
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
      value: []
    });
  });

  it("falls back to primary filtering when current screen is unavailable", async () => {
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
          height: 1080,
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
