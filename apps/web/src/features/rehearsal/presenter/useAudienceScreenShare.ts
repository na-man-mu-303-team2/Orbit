import { useEffect, useRef, useState } from "react";
import {
  attachAudienceStreamToWindow,
  detachAudienceStreamFromWindow,
  type AudienceStreamBridgeWindow,
} from "./audienceStreamBridge";
import type { AudienceOutputMode } from "./presenterStateStore";
import type { PresentationChannelIdentity } from "./presentationChannel";
import {
  ScreenShareCaptureError,
  createScreenShareCapturePort,
  type ScreenShareCapture,
  type ScreenShareCapturePort,
  type ScreenShareSourceIntent,
} from "./screenShareCapture";

export type AudienceScreenShareStatus =
  | "idle"
  | "selecting"
  | "sharing"
  | "failed";

export type AudienceScreenShareController = ReturnType<
  typeof createAudienceScreenShareController
>;

export function createAudienceScreenShareController(args: {
  capturePort: ScreenShareCapturePort;
  getConnected: () => boolean;
  getTargetWindow: () => AudienceStreamBridgeWindow | null;
  identity: PresentationChannelIdentity;
  onOutputModeChange: (mode: AudienceOutputMode) => void;
  onStatusChange?: (state: {
    error: string;
    status: AudienceScreenShareStatus;
  }) => void;
}) {
  let active:
    | {
        capture: ScreenShareCapture;
        targetWindow: AudienceStreamBridgeWindow;
        unsubscribeEnded: () => void;
      }
    | undefined;
  let operationId = 0;
  let disposed = false;

  const setStatus = (status: AudienceScreenShareStatus, error = "") => {
    if (!disposed) args.onStatusChange?.({ error, status });
  };

  const stopSharing = (options: { returnToSlide: boolean }) => {
    operationId += 1;
    const current = active;
    active = undefined;
    if (current) {
      current.unsubscribeEnded();
      current.capture.stop();
      detachAudienceStreamFromWindow({
        identity: args.identity,
        targetWindow: current.targetWindow,
      });
    }
    setStatus("idle");
    if (options.returnToSlide) args.onOutputModeChange("slide");
  };

  const start = async (intent: ScreenShareSourceIntent) => {
    disposed = false;
    if (!args.getConnected()) {
      setStatus(
        "failed",
        "청중 화면을 먼저 연결한 뒤 웹·실습 공유를 시작해주세요.",
      );
      return false;
    }

    stopSharing({ returnToSlide: false });
    const currentOperationId = ++operationId;
    const capturePromise = args.capturePort.start(intent);
    setStatus("selecting");

    let capture: ScreenShareCapture;
    try {
      capture = await capturePromise;
    } catch (cause) {
      setStatus("failed", getCaptureErrorMessage(cause));
      return false;
    }

    if (disposed || currentOperationId !== operationId) {
      capture.stop();
      return false;
    }

    const targetWindow = args.getTargetWindow();
    const attachResult = attachAudienceStreamToWindow({
      identity: args.identity,
      stream: capture.stream,
      targetWindow,
    });
    if (!attachResult.ok || !targetWindow) {
      capture.stop();
      setStatus(
        "failed",
        "청중 화면 연결을 확인한 뒤 다시 시도해주세요.",
      );
      return false;
    }

    active = {
      capture,
      targetWindow,
      unsubscribeEnded: () => undefined,
    };
    active.unsubscribeEnded = capture.subscribeEnded(() => {
      if (active?.capture !== capture) return;
      stopSharing({ returnToSlide: true });
    });
    if (active?.capture !== capture) return false;

    capture.focusCapturedSurface();
    args.onOutputModeChange("screen-share");
    setStatus("sharing");
    return true;
  };

  return {
    dispose: (
      options: { returnToSlide: boolean } = { returnToSlide: true },
    ) => {
      if (disposed) return;
      operationId += 1;
      disposed = true;
      const current = active;
      active = undefined;
      if (current) {
        current.unsubscribeEnded();
        current.capture.stop();
        detachAudienceStreamFromWindow({
          identity: args.identity,
          targetWindow: current.targetWindow,
        });
      }
      if (options.returnToSlide) args.onOutputModeChange("slide");
    },
    getActiveStream: () => active?.capture.stream ?? null,
    handleExternalOutputMode: (mode: AudienceOutputMode) => {
      if (mode !== "screen-share" && active) {
        stopSharing({ returnToSlide: false });
      }
    },
    handlePeerUnavailable: () => {
      if (active) stopSharing({ returnToSlide: true });
    },
    reattach: () => {
      if (!active) return true;
      const nextTargetWindow = args.getTargetWindow();
      const previousTargetWindow = active.targetWindow;
      const result = attachAudienceStreamToWindow({
        identity: args.identity,
        stream: active.capture.stream,
        targetWindow: nextTargetWindow,
      });
      if (!result.ok || !nextTargetWindow) {
        stopSharing({ returnToSlide: true });
        setStatus(
          "failed",
          "청중 화면 연결을 확인한 뒤 다시 시도해주세요.",
        );
        return false;
      }
      if (previousTargetWindow !== nextTargetWindow) {
        detachAudienceStreamFromWindow({
          identity: args.identity,
          targetWindow: previousTargetWindow,
        });
      }
      active.targetWindow = nextTargetWindow;
      return true;
    },
    returnToSlide: () => stopSharing({ returnToSlide: true }),
    showBlack: () => {
      stopSharing({ returnToSlide: false });
      args.onOutputModeChange("black");
    },
    start,
    stopSharing,
  };
}

export function useAudienceScreenShare(args: {
  capturePort?: ScreenShareCapturePort;
  connected: boolean;
  getTargetWindow: () => AudienceStreamBridgeWindow | null;
  identity: PresentationChannelIdentity;
  onOutputModeChange: (mode: AudienceOutputMode) => void;
  outputMode: AudienceOutputMode;
}) {
  const { connected, getTargetWindow, identity, onOutputModeChange, outputMode } =
    args;
  const defaultCapturePortRef = useRef<ScreenShareCapturePort | null>(null);
  if (!defaultCapturePortRef.current) {
    defaultCapturePortRef.current = createScreenShareCapturePort();
  }
  const capturePort = args.capturePort ?? defaultCapturePortRef.current;
  const [viewState, setViewState] = useState<{
    error: string;
    status: AudienceScreenShareStatus;
  }>({ error: "", status: "idle" });
  const latestRef = useRef({ connected, getTargetWindow, onOutputModeChange });
  latestRef.current = { connected, getTargetWindow, onOutputModeChange };
  const controllerKey = `${identity.deckId}\u0000${identity.sessionId}`;
  const createControllerEntry = () => ({
    capturePort,
    controller: createAudienceScreenShareController({
        capturePort,
        getConnected: () => latestRef.current.connected,
        getTargetWindow: () => latestRef.current.getTargetWindow(),
        identity,
        onOutputModeChange: (mode) =>
          latestRef.current.onOutputModeChange(mode),
        onStatusChange: setViewState,
      }),
    key: controllerKey,
  });
  const [controllerEntry, setControllerEntry] = useState(createControllerEntry);
  const controller = controllerEntry.controller;

  useEffect(() => {
    if (
      controllerEntry.capturePort === capturePort &&
      controllerEntry.key === controllerKey
    ) {
      return;
    }
    controllerEntry.controller.dispose({ returnToSlide: true });
    setControllerEntry(createControllerEntry());
  }, [capturePort, controllerEntry, controllerKey]);

  useEffect(() => {
    controller.handleExternalOutputMode(outputMode);
  }, [controller, outputMode]);

  useEffect(() => {
    const stopForPageExit = () => controller.dispose({ returnToSlide: true });
    window.addEventListener("pagehide", stopForPageExit);
    return () => {
      window.removeEventListener("pagehide", stopForPageExit);
      controller.dispose({ returnToSlide: true });
    };
  }, [controller]);

  return {
    ...viewState,
    handlePeerUnavailable: controller.handlePeerUnavailable,
    reattach: controller.reattach,
    returnToSlide: controller.returnToSlide,
    showBlack: controller.showBlack,
    startMonitor: () => controller.start("monitor"),
    startTabOrWindow: () => controller.start("tab-or-window"),
    stopSharing: controller.stopSharing,
  };
}

function getCaptureErrorMessage(cause: unknown) {
  return cause instanceof ScreenShareCaptureError
    ? cause.message
    : "웹·실습 공유를 시작하지 못했습니다.";
}
