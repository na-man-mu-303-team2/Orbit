import type {
  BrowserSemanticCueNliDevice,
  BrowserSemanticCueNliInferMessage,
  BrowserSemanticCueNliLoadMessage,
  BrowserSemanticCueNliWorkerRequest,
  BrowserSemanticCueNliWorkerResponse
} from "./browserSemanticCueNliWorkerProtocol";

type ZeroShotPipeline = (
  premise: string,
  labels: string[],
  options?: { multi_label?: boolean }
) => Promise<unknown>;

let classifierPromise: Promise<ZeroShotPipeline> | null = null;
let loadedModelId: string | null = null;
let loadedDevice: BrowserSemanticCueNliDevice | null = null;

const workerScope = globalThis as unknown as {
  onmessage: ((event: MessageEvent<BrowserSemanticCueNliWorkerRequest>) => void) | null;
  postMessage: (message: BrowserSemanticCueNliWorkerResponse) => void;
  close: () => void;
};

workerScope.onmessage = (event) => {
  const message = event.data;
  if (message.type === "dispose") {
    workerScope.close();
    return;
  }

  if (message.type === "load") {
    void handleLoad(message);
    return;
  }

  void handleInfer(message);
};

async function handleLoad(message: BrowserSemanticCueNliLoadMessage) {
  const startedAt = performance.now();
  try {
    await loadClassifier(message.modelId, message.device);
    post({
      type: "loaded",
      requestId: message.requestId,
      provider: "browser-transformersjs",
      modelId: message.modelId,
      device: message.device,
      loadedAtMs: Math.round(performance.now() - startedAt)
    });
  } catch (error) {
    postError(message.requestId, error);
  }
}

async function handleInfer(message: BrowserSemanticCueNliInferMessage) {
  const startedAt = performance.now();
  try {
    const classifier = await requireClassifier();
    const labels = message.hypotheses.map((hypothesis) => hypothesis.hypothesis);
    const output = await classifier(message.premise, labels, {
      multi_label: true
    });
    const scoresByLabel = readZeroShotScores(output);
    const latencyMs = Math.round(performance.now() - startedAt);

    post({
      type: "result",
      requestId: message.requestId,
      jobId: message.jobId,
      decisions: message.hypotheses.map((hypothesis) => {
        const entailmentScore = clampScore(
          scoresByLabel.get(hypothesis.hypothesis) ?? 0
        );
        const unresolvedScore = 1 - entailmentScore;
        return {
          cueId: hypothesis.cueId,
          hypothesis: hypothesis.hypothesis,
          entailmentScore,
          neutralScore: clampScore(unresolvedScore * 0.65),
          contradictionScore: clampScore(unresolvedScore * 0.35),
          latencyMs
        };
      })
    });
  } catch (error) {
    postError(message.requestId, error);
  }
}

async function loadClassifier(
  modelId: string,
  device: BrowserSemanticCueNliDevice
): Promise<ZeroShotPipeline> {
  if (classifierPromise && loadedModelId === modelId && loadedDevice === device) {
    return classifierPromise;
  }

  loadedModelId = modelId;
  loadedDevice = device;
  classifierPromise = import("@huggingface/transformers").then(
    async ({ env, pipeline }) => {
      env.useBrowserCache = true;
      env.allowLocalModels = false;
      return pipeline("zero-shot-classification", modelId, {
        device
      }) as Promise<ZeroShotPipeline>;
    }
  );
  return classifierPromise;
}

async function requireClassifier() {
  if (!classifierPromise) {
    throw new Error("Semantic cue NLI model is not loaded.");
  }

  return classifierPromise;
}

function readZeroShotScores(output: unknown): Map<string, number> {
  const result = Array.isArray(output) ? output[0] : output;
  if (!result || typeof result !== "object") {
    return new Map();
  }

  const record = result as { labels?: unknown; scores?: unknown };
  if (!Array.isArray(record.labels) || !Array.isArray(record.scores)) {
    return new Map();
  }

  const scoresList = record.scores as unknown[];
  const scores = new Map<string, number>();
  record.labels.forEach((label, index) => {
    const score = scoresList[index];
    if (typeof label === "string" && typeof score === "number") {
      scores.set(label, clampScore(score));
    }
  });
  return scores;
}

function post(message: BrowserSemanticCueNliWorkerResponse) {
  workerScope.postMessage(message);
}

function postError(requestId: string, error: unknown) {
  post({
    type: "error",
    requestId,
    message: error instanceof Error ? error.message : String(error)
  });
}

function clampScore(score: number) {
  if (!Number.isFinite(score)) {
    return 0;
  }

  return Math.max(0, Math.min(1, score));
}
