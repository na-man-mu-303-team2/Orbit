import type { LiveSttPort, LiveSttResult } from "./liveSttPort";

export type LiveSttHarnessScenario = {
  id: string;
  expectedPhrases: string[];
  expectedKeywords: string[];
};

export type LiveSttHarnessMetrics = {
  scenarioId: string;
  phraseRecall: number;
  keywordHitRate: number;
  firstPartialLatencyMs: number | null;
  firstFinalLatencyMs: number | null;
  resultCount: number;
};

export async function runLiveSttHarness(options: {
  scenario: LiveSttHarnessScenario;
  createPort: () => LiveSttPort;
  audioSource: MediaStream;
  drive: (port: LiveSttPort) => Promise<void> | void;
}) {
  const port = options.createPort();
  const results: LiveSttResult[] = [];
  const unsubscribe = port.onResult((result) => results.push(result));

  try {
    await port.start({
      language: "ko",
      audioSource: options.audioSource,
      biasPhrases: [
        ...options.scenario.expectedPhrases,
        ...options.scenario.expectedKeywords
      ]
    });
    await options.drive(port);
    await port.stop();
    return scoreLiveSttResults(options.scenario, results);
  } finally {
    unsubscribe();
    await port.dispose();
  }
}

export function scoreLiveSttResults(
  scenario: LiveSttHarnessScenario,
  results: readonly LiveSttResult[]
): LiveSttHarnessMetrics {
  const transcript = normalizeHarnessText(
    results.map((result) => result.text).join(" ")
  );
  const firstPartial = results.find((result) => !result.isFinal);
  const firstFinal = results.find((result) => result.isFinal);

  return {
    scenarioId: scenario.id,
    phraseRecall: scoreHits(scenario.expectedPhrases, transcript),
    keywordHitRate: scoreHits(scenario.expectedKeywords, transcript),
    firstPartialLatencyMs: firstPartial?.timestampMs[0] ?? null,
    firstFinalLatencyMs: firstFinal?.timestampMs[0] ?? null,
    resultCount: results.length
  };
}

export function normalizeHarnessText(text: string) {
  return text
    .trim()
    .toLocaleLowerCase("ko-KR")
    .replace(/[^\p{Letter}\p{Number}\s]/gu, " ")
    .replace(/\s+/g, " ");
}

function scoreHits(expected: readonly string[], normalizedTranscript: string) {
  if (expected.length === 0) {
    return 1;
  }

  const hits = expected.filter((phrase) =>
    normalizedTranscript.includes(normalizeHarnessText(phrase))
  );
  return hits.length / expected.length;
}
