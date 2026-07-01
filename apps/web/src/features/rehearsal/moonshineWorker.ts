type MoonshineWorkerInboundMessage =
  | {
      type: "load";
      modelId: string;
      dtype: Record<string, string>;
      preferredDevice: "webgpu" | "wasm";
    }
  | {
      type: "start";
      sessionId: string;
      sampleRate: number;
      debugStatsEnabled: boolean;
    }
  | {
      type: "audio-segment";
      sessionId: string;
      sequenceId: number;
      sampleRate: number;
      samples: Float32Array;
      maxLength: number;
    }
  | { type: "stop"; sessionId: string }
  | { type: "dispose" };

type MoonshineWorkerOutboundMessage =
  | { type: "loaded"; modelId: string; device: "webgpu" | "wasm" }
  | { type: "started"; sessionId: string }
  | { type: "stopped"; sessionId: string }
  | {
      type: "error";
      code: "LIVE_STT_MODEL_UNAVAILABLE" | "LIVE_STT_START_FAILED";
      message: string;
      sessionId?: string;
    };

type WorkerScope = typeof globalThis & {
  onmessage:
    | ((event: MessageEvent<MoonshineWorkerInboundMessage>) => void)
    | null;
  postMessage: (message: MoonshineWorkerOutboundMessage) => void;
  close: () => void;
};

const workerScope = globalThis as unknown as WorkerScope;
let loadedModelId = "";
let activeSessionId: string | null = null;

workerScope.onmessage = (event: MessageEvent<MoonshineWorkerInboundMessage>) => {
  const message = event.data;

  switch (message.type) {
    case "load":
      loadedModelId = message.modelId;
      post({
        type: "loaded",
        modelId: message.modelId,
        device: message.preferredDevice
      });
      return;
    case "start":
      if (!loadedModelId) {
        post({
          type: "error",
          code: "LIVE_STT_MODEL_UNAVAILABLE",
          message: "Moonshine Live STT model has not been loaded.",
          sessionId: message.sessionId
        });
        return;
      }
      activeSessionId = message.sessionId;
      post({ type: "started", sessionId: message.sessionId });
      return;
    case "audio-segment":
      post({
        type: "error",
        code: "LIVE_STT_START_FAILED",
        message: "Moonshine Live STT inference is not available yet.",
        sessionId: message.sessionId
      });
      return;
    case "stop":
      if (activeSessionId === message.sessionId) {
        activeSessionId = null;
        post({ type: "stopped", sessionId: message.sessionId });
      }
      return;
    case "dispose":
      activeSessionId = null;
      workerScope.close();
      return;
  }
};

function post(message: MoonshineWorkerOutboundMessage) {
  workerScope.postMessage(message);
}
