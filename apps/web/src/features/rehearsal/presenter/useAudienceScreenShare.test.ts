import { describe, expect, it, vi } from "vitest";
import { audienceStreamBridgeKey } from "./audienceStreamBridge";
import { createAudienceScreenShareController } from "./useAudienceScreenShare";

const identity = { deckId: "deck_1", sessionId: "session_1" };

describe("useAudienceScreenShare controller", () => {
  it("does not open the picker before the audience is connected", async () => {
    const start = vi.fn();
    const states: unknown[] = [];
    const controller = createAudienceScreenShareController({
      capturePort: { isSupported: () => true, start },
      getConnected: () => false,
      getTargetWindow: () => null,
      identity,
      onOutputModeChange: vi.fn(),
      onStatusChange: (state) => states.push(state),
    });

    await expect(controller.start("tab-or-window")).resolves.toBe(false);
    expect(start).not.toHaveBeenCalled();
    expect(states).toContainEqual({
      error: "청중 화면을 먼저 연결한 뒤 웹·실습 공유를 시작해주세요.",
      status: "failed",
    });
  });

  it("starts capture before selecting state and switches mode after attach", async () => {
    const order: string[] = [];
    const capture = createCapture(order);
    const targetWindow = createTargetWindow(order);
    const controller = createAudienceScreenShareController({
      capturePort: {
        isSupported: () => true,
        start: async () => {
          order.push("capture-start");
          return capture;
        },
      },
      getConnected: () => true,
      getTargetWindow: () => targetWindow,
      identity,
      onOutputModeChange: (mode) => order.push(`mode-${mode}`),
      onStatusChange: ({ status }) => order.push(`status-${status}`),
    });

    await expect(controller.start("tab-or-window")).resolves.toBe(true);

    expect(order.indexOf("capture-start")).toBeLessThan(
      order.indexOf("status-selecting"),
    );
    expect(order.indexOf("bridge-attach")).toBeLessThan(
      order.indexOf("mode-screen-share"),
    );
  });

  it("stops capture and keeps slide mode when bridge attach fails", async () => {
    const capture = createCapture([]);
    const onOutputModeChange = vi.fn();
    const controller = createAudienceScreenShareController({
      capturePort: { isSupported: () => true, start: async () => capture },
      getConnected: () => true,
      getTargetWindow: () => ({}),
      identity,
      onOutputModeChange,
    });

    await expect(controller.start("tab-or-window")).resolves.toBe(false);
    expect(capture.stop).toHaveBeenCalledTimes(1);
    expect(onOutputModeChange).not.toHaveBeenCalledWith("screen-share");
  });

  it("uses one idempotent cleanup path for ended, black, and return", async () => {
    const order: string[] = [];
    const capture = createCapture(order);
    const targetWindow = createTargetWindow(order);
    const modes: string[] = [];
    const controller = createAudienceScreenShareController({
      capturePort: { isSupported: () => true, start: async () => capture },
      getConnected: () => true,
      getTargetWindow: () => targetWindow,
      identity,
      onOutputModeChange: (mode) => modes.push(mode),
    });
    await controller.start("tab-or-window");

    controller.showBlack();
    controller.showBlack();

    expect(capture.unsubscribe).toHaveBeenCalledTimes(1);
    expect(capture.stop).toHaveBeenCalledTimes(1);
    expect(order.indexOf("capture-stop")).toBeLessThan(
      order.indexOf("bridge-detach"),
    );
    expect(modes).toEqual(["screen-share", "black", "black"]);
  });

  it("reattaches a live stream when a popup receiver becomes ready again", async () => {
    const firstWindow = createTargetWindow([]);
    const secondWindow = createTargetWindow([]);
    let currentWindow = firstWindow;
    const capture = createCapture([]);
    const controller = createAudienceScreenShareController({
      capturePort: { isSupported: () => true, start: async () => capture },
      getConnected: () => true,
      getTargetWindow: () => currentWindow,
      identity,
      onOutputModeChange: vi.fn(),
    });
    await controller.start("tab-or-window");
    currentWindow = secondWindow;

    expect(controller.reattach()).toBe(true);
    expect(firstWindow.attach).toHaveBeenCalledTimes(1);
    expect(firstWindow.detach).toHaveBeenCalledTimes(1);
    expect(secondWindow.attach).toHaveBeenCalledTimes(1);
  });

  it("returns to the latest slide mode when capture ends or the peer disappears", async () => {
    const capture = createCapture([]);
    const modes: string[] = [];
    const controller = createAudienceScreenShareController({
      capturePort: { isSupported: () => true, start: async () => capture },
      getConnected: () => true,
      getTargetWindow: () => createTargetWindow([]),
      identity,
      onOutputModeChange: (mode) => modes.push(mode),
    });
    await controller.start("tab-or-window");

    capture.triggerEnded();
    controller.handlePeerUnavailable();

    expect(capture.stop).toHaveBeenCalledTimes(1);
    expect(modes).toEqual(["screen-share", "slide"]);
  });

  it("disposes an active stream without publishing a mode during unmount", async () => {
    const capture = createCapture([]);
    const modes: string[] = [];
    const controller = createAudienceScreenShareController({
      capturePort: { isSupported: () => true, start: async () => capture },
      getConnected: () => true,
      getTargetWindow: () => createTargetWindow([]),
      identity,
      onOutputModeChange: (mode) => modes.push(mode),
    });
    await controller.start("tab-or-window");

    controller.dispose();
    controller.dispose();

    expect(capture.stop).toHaveBeenCalledTimes(1);
    expect(modes).toEqual(["screen-share"]);
  });
});

function createCapture(order: string[]) {
  let endedListener: (() => void) | undefined;
  const unsubscribe = vi.fn(() => order.push("capture-unsubscribe"));
  return {
    displaySurface: "browser" as const,
    focusCapturedSurface: vi.fn(() => order.push("capture-focus")),
    stream: {} as MediaStream,
    stop: vi.fn(() => order.push("capture-stop")),
    subscribeEnded: vi.fn((listener: () => void) => {
      endedListener = listener;
      return unsubscribe;
    }),
    triggerEnded: () => endedListener?.(),
    unsubscribe,
  };
}

function createTargetWindow(order: string[]) {
  const attach = vi.fn(() => {
    order.push("bridge-attach");
    return { ok: true } as const;
  });
  const detach = vi.fn(() => {
    order.push("bridge-detach");
    return { ok: true } as const;
  });
  return {
    attach,
    detach,
    [audienceStreamBridgeKey]: { attach, detach, version: 1 },
  };
}
