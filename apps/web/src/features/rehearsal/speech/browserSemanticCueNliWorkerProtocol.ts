import type { SemanticCueNliHypothesisInput } from "./semanticCueNliProvider";

export type BrowserSemanticCueNliDevice = "webgpu" | "wasm";

export type BrowserSemanticCueNliLoadMessage = {
  type: "load";
  requestId: string;
  modelId: string;
  device: BrowserSemanticCueNliDevice;
};

export type BrowserSemanticCueNliInferMessage = {
  type: "infer";
  requestId: string;
  jobId: number;
  premise: string;
  hypotheses: readonly SemanticCueNliHypothesisInput[];
};

export type BrowserSemanticCueNliDisposeMessage = {
  type: "dispose";
};

export type BrowserSemanticCueNliWorkerRequest =
  | BrowserSemanticCueNliLoadMessage
  | BrowserSemanticCueNliInferMessage
  | BrowserSemanticCueNliDisposeMessage;

export type BrowserSemanticCueNliWorkerResponse =
  | {
      type: "loaded";
      requestId: string;
      provider: "browser-transformersjs";
      modelId: string;
      device: BrowserSemanticCueNliDevice;
      loadedAtMs: number;
    }
  | {
      type: "result";
      requestId: string;
      jobId: number;
      decisions: Array<{
        cueId: string;
        hypothesis: string;
        entailmentScore: number;
        neutralScore: number;
        contradictionScore: number;
        latencyMs: number;
      }>;
    }
  | {
      type: "error";
      requestId: string;
      message: string;
    };
