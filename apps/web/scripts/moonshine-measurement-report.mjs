export function buildMoonshineMeasurementReport(options) {
  const audioInput = buildMoonshineMeasurementAudioInput(options);
  return {
    generatedAt: new Date().toISOString(),
    modelId: options.modelId,
    dtype: options.dtype,
    fixturePath: relativeToRoot(options.fixturePath, options.repoRoot),
    fixtureSet: options.fixtureSet,
    audioSource: audioInput.source,
    audioInput,
    results: options.results
  };
}

export function resolveMoonshineMeasurementAudioSource(options) {
  return buildMoonshineMeasurementAudioInput(options).source;
}

export function buildMoonshineMeasurementAudioInput(options) {
  const explicitAudioSource = normalizeOptionalString(options.audioSource);
  if (explicitAudioSource && !options.audioDir) {
    throw new Error("--audio-source requires --audio-dir.");
  }

  if (options.audioDir) {
    const directory = relativeToRoot(options.audioDir, options.repoRoot);
    return {
      kind: "human-wav",
      source: explicitAudioSource ?? directory,
      directory
    };
  }

  const source = `macOS say voice ${options.voice}`;
  return {
    kind: "synthetic-tts",
    source,
    voice: options.voice
  };
}

export function summarizeMoonshineMeasurementReport(report) {
  return {
    modelId: report.modelId,
    audioSource: report.audioSource,
    results: report.results.map((result) =>
      result.status === "succeeded"
        ? {
            device: result.device,
            status: result.status,
            modelLoadMs: result.modelLoadMs,
            averageCer: result.summary.averageCer,
            keywordRecall: result.summary.keywordRecall,
            falseTriggerRate: result.summary.falseTriggerRate,
            averageLatencyMs: result.summary.averageLatencyMs
          }
        : {
            device: result.device,
            status: result.status,
            error: result.error
          }
    )
  };
}

function normalizeOptionalString(value) {
  const normalized = String(value ?? "").trim();
  return normalized.length === 0 ? null : normalized;
}

function relativeToRoot(path, root) {
  return path.startsWith(root) ? path.slice(root.length + 1) : path;
}
