import type { RehearsalSemanticCueDecision, SemanticCue } from "@orbit/shared";

import {
  selectSemanticCueCandidates,
  type SemanticCueCandidate
} from "./semanticCueCandidateSelector";
import type { SemanticCueEmbeddingIndex } from "./semanticCueEmbeddingIndex";
import {
  createSemanticCueDebugEvent,
  type SemanticCueDebugEvent
} from "./semanticCueDebugEvents";
import { shouldRunSemanticCueNli } from "./semanticCueNliPolicy";
import type { SemanticCueNliProvider } from "./semanticCueNliProvider";
import { buildSemanticCueReportEvidence, normalizeBoundedText } from "./semanticCueReportEvidence";
import { combineSemanticCueScore } from "./semanticCueScoreCombiner";
import { semanticCueRuntimeConfig } from "./semanticCueRuntimeConfig";
import type { SemanticMatchDecisionReason } from "./semanticUtteranceDecision";

export type SemanticCueRuntime = {
  prepareSlide: (input: {
    slideId: string;
    cues: readonly SemanticCue[];
  }) => Promise<void>;
  evaluateFinalResult: (input: SemanticCueRuntimeInput) => Promise<SemanticCueRuntimeResult>;
};

export type SemanticCueRuntimeInput = {
  deckId: string;
  slideId: string;
  slideTitle?: string;
  transcript: string;
  isFinal: boolean;
  cues: readonly SemanticCue[];
  coveredCueIds: ReadonlySet<string>;
  phraseMatched: boolean;
  keywordCoverage: number;
  semanticDecisionReason: SemanticMatchDecisionReason | "no_match";
  semanticMatchingEnabled: boolean;
  generation: number;
  nowMs: number;
  evidenceStartMs?: number;
  evidenceEndMs?: number;
};

export type SemanticCueRuntimeResult = {
  decisions: RehearsalSemanticCueDecision[];
  debugEvent: SemanticCueDebugEvent;
};

export function createSemanticCueRuntime(options: {
  provider?: SemanticCueNliProvider;
  enabled: boolean;
  embeddingIndex?: SemanticCueEmbeddingIndex;
  now?: () => number;
  deckId?: string;
  maxCandidates?: number;
}): SemanticCueRuntime {
  const now = options.now ?? (() => Date.now());
  const deckId = options.deckId ?? "deck_unknown";
  let lastNliRunAtMs: number | null = null;
  const coveredCueIds = new Set<string>();

  return {
    async prepareSlide(input) {
      await options.embeddingIndex?.prepareSlide(input);
    },

    async evaluateFinalResult(input) {
      const stableWindow = normalizeBoundedText(input.transcript, 600);
      const retrievalScoresByCueId =
        (await options.embeddingIndex?.retrieveScores({
          slideId: input.slideId,
          transcript: stableWindow
        })) ?? new Map<string, number>();
      const allCoveredCueIds = new Set([
        ...Array.from(input.coveredCueIds),
        ...Array.from(coveredCueIds)
      ]);
      const candidates = selectSemanticCueCandidates({
        slideId: input.slideId,
        transcript: stableWindow,
        cues: input.cues,
        coveredCueIds: allCoveredCueIds,
        retrievalScoresByCueId,
        maxCandidates:
          options.maxCandidates ?? semanticCueRuntimeConfig.maxCandidates
      });
      const selectedCandidate = candidates.find((candidate) => candidate.selectedForNli);

      if (!selectedCandidate) {
        return {
          decisions: [],
          debugEvent: buildDebugEvent({
            input,
            deckId,
            stableWindow,
            candidates,
            reasonCodes: [candidates[0]?.nliSkippedReason ?? "no-candidate"]
          })
        };
      }

      const provider = options.provider;
      const policy = shouldRunSemanticCueNli({
        nliFeatureEnabled: options.enabled && provider !== undefined,
        semanticMatchingEnabled: input.semanticMatchingEnabled,
        isFinal: input.isFinal,
        phraseMatched: input.phraseMatched,
        keywordCoverage: input.keywordCoverage,
        semanticDecisionReason: input.semanticDecisionReason,
        cuePriority: selectedCandidate.cue.priority,
        cueRetrievalScore: selectedCandidate.retrievalScore,
        isRequired: selectedCandidate.cue.required,
        nowMs: input.nowMs,
        lastNliRunAtMs
      });

      if (!policy.run || !provider) {
        return {
          decisions: [],
          debugEvent: buildDebugEvent({
            input,
            deckId,
            stableWindow,
            candidates: candidates.map((candidate) =>
              candidate === selectedCandidate
                ? {
                    ...candidate,
                    selectedForNli: false,
                    nliSkippedReason: policy.reason
                  }
                : candidate
            ),
            reasonCodes: [policy.reason]
          })
        };
      }

      lastNliRunAtMs = input.nowMs;
      const hypotheses = selectedCandidate.cue.nliHypotheses
        .slice(0, selectedCandidate.cue.required && selectedCandidate.cue.priority === 1 ? 2 : 1)
        .map((hypothesis) => ({
          cueId: selectedCandidate.cue.cueId,
          hypothesis: normalizeBoundedText(hypothesis, 300)
        }));
      const nliDecisions = await provider.evaluate({
        premise: stableWindow,
        hypotheses
      });
      const bestNliDecision = nliDecisions.sort(
        (left, right) => right.entailmentScore - left.entailmentScore
      )[0];

      if (!bestNliDecision) {
        return {
          decisions: [],
          debugEvent: buildDebugEvent({
            input,
            deckId,
            stableWindow,
            candidates,
            reasonCodes: ["nli-empty-result"]
          })
        };
      }

      const combination = combineSemanticCueScore({
        lexicalScore: selectedCandidate.lexicalScore,
        conceptCoverage: selectedCandidate.conceptCoverage,
        embeddingScore: selectedCandidate.retrievalScore,
        nli: bestNliDecision
      });
      if (combination.label === "covered") {
        coveredCueIds.add(selectedCandidate.cue.cueId);
      }
      const evidence = buildSemanticCueReportEvidence({
        slideId: input.slideId,
        candidate: selectedCandidate,
        nliDecision: bestNliDecision,
        combination,
        premise: stableWindow,
        at: new Date(now()).toISOString()
      });

      return {
        decisions: [evidence],
        debugEvent: buildDebugEvent({
          input,
          deckId,
          stableWindow,
          candidates,
          selectedCandidate,
          nliDecisions,
          finalScore: combination.finalScore,
          label: combination.label,
          reasonCodes: combination.reasonCodes
        })
      };
    }
  };
}

function buildDebugEvent(options: {
  input: SemanticCueRuntimeInput;
  deckId: string;
  stableWindow: string;
  candidates: readonly SemanticCueCandidate[];
  selectedCandidate?: SemanticCueCandidate;
  nliDecisions?: readonly {
    cueId: string;
    hypothesis: string;
    entailmentScore: number;
    neutralScore: number;
    contradictionScore: number;
    provider: "mock" | "browser-transformersjs" | "browser-onnx";
    modelId?: string;
    latencyMs?: number;
  }[];
  finalScore?: number;
  label?: "covered" | "partial" | "not_covered" | "contradicted";
  reasonCodes: string[];
}) {
  const firstNli = options.nliDecisions?.[0];

  return createSemanticCueDebugEvent({
    eventId: `scue_dbg_${options.input.generation}_${Math.round(options.input.nowMs)}`,
    timestamp: options.input.nowMs,
    deckId: options.input.deckId || options.deckId,
    slideId: options.input.slideId,
    ...(options.input.slideTitle === undefined
      ? {}
      : { slideTitle: options.input.slideTitle }),
    transcript: {
      final: options.input.transcript,
      stableWindow: options.stableWindow
    },
    candidates: options.candidates.map((candidate) => ({
      cueId: candidate.cue.cueId,
      meaning: candidate.cue.meaning,
      lexicalScore: candidate.lexicalScore,
      conceptCoverage: candidate.conceptCoverage,
      embeddingScore: candidate.retrievalScore,
      selectedForNli: candidate.selectedForNli,
      ...(candidate.nliSkippedReason === undefined
        ? {}
        : { nliSkippedReason: candidate.nliSkippedReason })
    })),
    ...(firstNli === undefined
      ? {}
      : {
          nli: {
            provider: firstNli.provider,
            ...(firstNli.modelId === undefined ? {} : { modelId: firstNli.modelId }),
            premise: options.stableWindow,
            hypotheses: options.nliDecisions?.map((decision) => ({
              cueId: decision.cueId,
              hypothesis: decision.hypothesis,
              entailmentScore: decision.entailmentScore,
              neutralScore: decision.neutralScore,
              contradictionScore: decision.contradictionScore
            })) ?? [],
            latencyMs: firstNli.latencyMs ?? 0
          }
        }),
    decision: {
      ...(options.selectedCandidate === undefined
        ? {}
        : { cueId: options.selectedCandidate.cue.cueId }),
      finalScore: options.finalScore ?? 0,
      label: options.label ?? "no_candidate",
      reasonCodes: options.reasonCodes
    },
    actionGate: {
      allowed: false,
      blockedReasons: ["nli-cannot-advance-slide-alone"]
    }
  });
}
