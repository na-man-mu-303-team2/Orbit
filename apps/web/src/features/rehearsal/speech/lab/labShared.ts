import type { SemanticCueEmbeddingIndex } from "../semanticCueEmbeddingIndex";
import type { SemanticCueNliProvider } from "../semanticCueNliProvider";

export const LAB_STORAGE_PREFIX = "orbit.semanticCueLab.v1";

export const LAB_NLI_MODEL_ID = "MoritzLaurer/multilingual-MiniLMv2-L6-mnli-xnli";

export type ManualCueScores = {
  retrieval: number;
  entailment: number;
  contradiction: number;
};

export const defaultManualCueScores: ManualCueScores = {
  retrieval: 0,
  entailment: 0.1,
  contradiction: 0.1
};

export function createManualEmbeddingIndex(
  getScores: () => Record<string, ManualCueScores>
): SemanticCueEmbeddingIndex {
  return {
    async prepareSlide(input) {
      return {
        slideId: input.slideId,
        signature: "manual",
        cueCount: input.cues.length,
        vectorCount: 0
      };
    },
    async retrieveScores() {
      return new Map(
        Object.entries(getScores()).map(([cueId, scores]) => [
          cueId,
          clamp01(scores.retrieval)
        ])
      );
    }
  };
}

export function createManualNliProvider(
  getScores: () => Record<string, ManualCueScores>
): SemanticCueNliProvider {
  return {
    async load() {
      return { provider: "mock", status: "ready", modelId: "manual-lab" };
    },
    async evaluate(input) {
      return input.hypotheses.map((hypothesis) => {
        const scores = getScores()[hypothesis.cueId];
        const entailmentScore = clamp01(
          scores?.entailment ?? defaultManualCueScores.entailment
        );
        const contradictionScore = clamp01(
          scores?.contradiction ?? defaultManualCueScores.contradiction
        );
        return {
          cueId: hypothesis.cueId,
          hypothesis: hypothesis.hypothesis,
          provider: "mock" as const,
          modelId: "manual-lab",
          latencyMs: 0,
          entailmentScore,
          contradictionScore,
          neutralScore: clamp01(1 - entailmentScore - contradictionScore)
        };
      });
    }
  };
}

export function loadLabString(key: string, fallback: string) {
  try {
    return (
      window.localStorage.getItem(`${LAB_STORAGE_PREFIX}.${key}`) ?? fallback
    );
  } catch {
    return fallback;
  }
}

export function saveLabString(key: string, value: string) {
  try {
    window.localStorage.setItem(`${LAB_STORAGE_PREFIX}.${key}`, value);
  } catch {
    // ignore
  }
}

export function loadLabJson<T>(key: string, fallback: T): T {
  try {
    const raw = window.localStorage.getItem(`${LAB_STORAGE_PREFIX}.${key}`);
    if (!raw) {
      return structuredClone(fallback);
    }
    return { ...structuredClone(fallback), ...(JSON.parse(raw) as T) };
  } catch {
    return structuredClone(fallback);
  }
}

export function clamp01(value: number) {
  return Math.min(Math.max(value, 0), 1);
}

export function round3(value: number) {
  return Math.round(value * 1000) / 1000;
}

export function describeError(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}
