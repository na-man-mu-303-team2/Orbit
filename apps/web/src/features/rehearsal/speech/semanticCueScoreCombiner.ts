export type SemanticCueCombinedLabel =
  | "covered"
  | "partial"
  | "not_covered"
  | "contradicted";

export type SemanticCueScoreCombination = {
  label: SemanticCueCombinedLabel;
  finalScore: number;
  reasonCodes: string[];
};

export function combineSemanticCueScore(options: {
  lexicalScore?: number;
  conceptCoverage?: number;
  embeddingScore?: number;
  nli?: {
    entailmentScore: number;
    neutralScore: number;
    contradictionScore: number;
  };
}): SemanticCueScoreCombination {
  const lexicalScore = clamp01(options.lexicalScore ?? 0);
  const conceptCoverage = clamp01(options.conceptCoverage ?? 0);
  const embeddingScore = clamp01(options.embeddingScore ?? 0);
  const entailmentScore = clamp01(options.nli?.entailmentScore ?? 0);
  const contradictionScore = clamp01(options.nli?.contradictionScore ?? 0);
  const reasonCodes: string[] = [];

  if (contradictionScore >= 0.7) {
    return {
      label: "contradicted",
      finalScore: roundScore(Math.max(0, 1 - contradictionScore)),
      reasonCodes: ["nli-contradiction"]
    };
  }

  if (entailmentScore >= 0.78) {
    reasonCodes.push("nli-entailment");
  }

  if (conceptCoverage >= 0.5) {
    reasonCodes.push("concept-coverage");
  }

  if (lexicalScore >= 0.5) {
    reasonCodes.push("lexical-support");
  }

  if (embeddingScore >= 0.7) {
    reasonCodes.push("embedding-support");
  }

  const finalScore = roundScore(
    lexicalScore * 0.1 +
      conceptCoverage * 0.2 +
      embeddingScore * 0.25 +
      entailmentScore * 0.45
  );
  const effectiveFinalScore =
    entailmentScore >= 0.9 ? Math.max(finalScore, 0.75) : finalScore;

  if (effectiveFinalScore >= 0.7 && entailmentScore >= 0.78) {
    return {
      label: "covered",
      finalScore: roundScore(effectiveFinalScore),
      reasonCodes
    };
  }

  if (effectiveFinalScore >= 0.45) {
    return {
      label: "partial",
      finalScore: roundScore(effectiveFinalScore),
      reasonCodes: reasonCodes.length > 0 ? reasonCodes : ["partial-support"]
    };
  }

  return {
    label: "not_covered",
    finalScore,
    reasonCodes: reasonCodes.length > 0 ? reasonCodes : ["insufficient-support"]
  };
}

function clamp01(value: number) {
  return Math.min(Math.max(value, 0), 1);
}

function roundScore(value: number) {
  return Math.round(value * 1000) / 1000;
}
