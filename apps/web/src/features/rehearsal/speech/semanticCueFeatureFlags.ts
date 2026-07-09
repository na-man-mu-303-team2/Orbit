import type { SemanticCueNliProviderId } from "./semanticCueNliProvider";

export type SemanticCueRuntimeFlags = {
  nliEnabled: boolean;
  provider: SemanticCueNliProviderId | "off";
  modelId: string;
  debugPanelEnabled: boolean;
};

export function getSemanticCueRuntimeFlags(env: Record<string, string | boolean | undefined>): SemanticCueRuntimeFlags {
  return {
    nliEnabled: booleanFlag(env.VITE_SEMANTIC_CUE_NLI_ENABLED),
    provider: providerFlag(env.VITE_SEMANTIC_CUE_NLI_PROVIDER),
    modelId:
      stringFlag(env.VITE_SEMANTIC_CUE_NLI_MODEL_ID) ??
      "MoritzLaurer/multilingual-MiniLMv2-L6-mnli-xnli",
    debugPanelEnabled: booleanFlag(env.VITE_SEMANTIC_CUE_DEBUG_PANEL)
  };
}

function booleanFlag(value: string | boolean | undefined) {
  return value === true || value === "true" || value === "1";
}

function stringFlag(value: string | boolean | undefined) {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function providerFlag(
  value: string | boolean | undefined
): SemanticCueRuntimeFlags["provider"] {
  if (
    value === "mock" ||
    value === "browser-transformersjs" ||
    value === "browser-onnx" ||
    value === "off"
  ) {
    return value;
  }

  return "off";
}
