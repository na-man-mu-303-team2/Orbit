export type SemanticCueNliProviderId =
  | "mock"
  | "browser-transformersjs"
  | "browser-onnx";

export type SemanticCueNliProviderInfo = {
  provider: SemanticCueNliProviderId;
  status: "ready" | "disabled-low-capability" | "failed";
  modelId?: string;
  loadedAtMs?: number;
  error?: string;
};

export type SemanticCueNliHypothesisInput = {
  cueId: string;
  hypothesis: string;
};

export type SemanticCueNliDecision = {
  cueId: string;
  hypothesis: string;
  entailmentScore: number;
  neutralScore: number;
  contradictionScore: number;
  provider: SemanticCueNliProviderId;
  modelId?: string;
  latencyMs?: number;
};

export type SemanticCueNliProvider = {
  load: () => Promise<SemanticCueNliProviderInfo>;
  evaluate: (input: {
    premise: string;
    hypotheses: readonly SemanticCueNliHypothesisInput[];
    signal?: AbortSignal;
  }) => Promise<SemanticCueNliDecision[]>;
};
