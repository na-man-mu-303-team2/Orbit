# Spike: E5 Prefix Mode and Threshold Calibration

**Date:** 2026-07-09
**Status:** Completed
**Owner:** Web rehearsal
**Related implementation plan:** [semantic-utterance-outcome-classification.md](../plans/semantic-utterance-outcome-classification.md)

## Purpose

Determine how `Xenova/multilingual-e5-small` should be used for rehearsal utterance matching before implementing outcome classification. The spike must decide:

- whether script sentences should be embedded as `passage: ...` or `query: ...`;
- which semantic similarity threshold should reject unrelated `ad-lib` speech;
- which top-1 vs top-2 margin should reject ambiguous matches;
- which lexical overlap boundary should label an accepted utterance as `covered` vs `paraphrased`.

This is a spike because E5 top-k retrieval always returns a nearest script sentence, and the E5 model card warns that cosine scores commonly cluster around `0.7` to `1.0`. Prefix mode and threshold policy must be measured on Orbit-style Korean presentation fixtures instead of guessed during feature implementation.

## Research Basis

- E5 model card says inputs should use `query: ` / `passage: ` according to task type, and that symmetric tasks such as semantic similarity and paraphrase retrieval can use `query: ` prefix. It also notes that scores often distribute around `0.7` to `1.0`, so relative order is more important than raw absolute score. Source: <https://huggingface.co/intfloat/multilingual-e5-small>
- Sentence Transformers describes semantic search as ranking corpus embeddings by closeness to an embedded query. This means top-k is ranking, not acceptance. Source: <https://www.sbert.net/examples/sentence_transformer/applications/semantic-search/README.html>
- Out-of-scope intent detection research frames the same failure mode: not every utterance belongs to a known class. Source: <https://arxiv.org/abs/1909.02027>
- Transformers.js supports browser-side `feature-extraction`, which is the runtime used by the existing semantic matcher. Sources: <https://huggingface.co/docs/transformers.js/index>, <https://huggingface.co/docs/transformers.js/en/api/pipelines>

## Hypotheses

1. `query:`/`passage:` may work better for asymmetric retrieval, but may not be optimal for utterance-to-script sentence semantic similarity.
2. `query:`/`query:` may improve paraphrase matching because both sides are short sentence-like text.
3. A single similarity threshold is insufficient unless paired with a top-1 margin and lexical overlap check.
4. False positive `ad-lib` coverage is more damaging than a missed paraphrase, because it advances the script incorrectly.

## Compared Modes

| Mode | Transcript prefix | Script sentence prefix | Existing behavior |
| --- | --- | --- | --- |
| `query-passage` | `query: ` | `passage: ` | Yes |
| `query-query` | `query: ` | `query: ` | No |

No other prefix mode is in scope for this spike unless these two modes both fail the acceptance criteria.

## Fixture Set

Create a deterministic fixture file for manual and automated calibration. Each fixture should include:

- `fixtureId`
- slide script sentences
- final STT segment text
- expected outcome: `covered`, `paraphrased`, `ad-lib`, or `missed`
- expected sentence ID when applicable
- whether coverage should mutate
- notes describing why the fixture matters

Required fixture groups:

- Exact Korean script readings.
- Slightly noisy STT variants of exact script readings.
- Korean paraphrases with same meaning and different wording.
- Adjacent-sentence paraphrases that could be ambiguous.
- Completely unrelated ad-lib sentences.
- Mixed utterances containing one script sentence plus extra ad-lib clause.
- Already-covered sentence repeated.
- Short filler/common phrases that must not cover a sentence.

## Measurement Output

For each fixture and prefix mode, record:

- top 3 script candidates;
- top 1 similarity;
- top 2 similarity;
- margin: `top1 - top2`;
- lexical overlap with top 1;
- predicted decision under candidate thresholds;
- expected decision;
- pass/fail.

Recommended output shape:

```json
{
  "modelId": "Xenova/multilingual-e5-small",
  "mode": "query-query",
  "fixtureId": "ko-paraphrase-001",
  "expectedOutcome": "paraphrased",
  "topMatches": [
    {
      "sentenceId": "sentence_2",
      "similarity": 0.8421,
      "marginToNext": 0.0712,
      "lexicalOverlap": 0.28
    }
  ],
  "predictedOutcome": "paraphrased",
  "passed": true
}
```

## Acceptance Criteria

The spike is complete only when it produces a written decision with:

- chosen prefix mode: `query-passage` or `query-query`;
- recommended `adLibRejectThreshold`;
- recommended `ambiguousMargin`;
- recommended `exactLexicalThreshold`;
- fixture table showing false positive and false negative behavior;
- documented known failure cases, especially mixed utterances;
- implementation notes for `e5EmbeddingService` and `semanticUtteranceMatcher`.

Decision priority:

1. Minimize unrelated `ad-lib` false positives that cover a script sentence.
2. Keep exact script readings accepted.
3. Keep high-quality paraphrases accepted.
4. Prefer simpler policy if two modes are equivalent.

## Implementation Tasks

### Task 1: Define Calibration Fixtures

**Description:** Add a fixture dataset that represents Orbit rehearsal utterance outcomes.

**Acceptance criteria:**

- Fixture groups listed above are represented.
- Each fixture has an expected outcome and expected sentence ID where applicable.
- Fixtures do not contain private user data.

**Verification:**

- Fixture schema/unit test parses every case.

**Files likely touched:**

- `apps/web/src/features/rehearsal/speech/e5PrefixCalibrationFixtures.ts`
- `apps/web/src/features/rehearsal/speech/e5PrefixCalibrationFixtures.test.ts`

### Task 2: Add Prefix Mode Measurement Harness

**Description:** Build a small browser/dev harness or test helper that runs both prefix modes against the same fixtures using `Xenova/multilingual-e5-small`.

**Acceptance criteria:**

- Outputs top 3, similarity, margin, lexical overlap, and predicted decision per fixture.
- Can run without changing production behavior.
- Does not persist transcript text outside local spike output.

**Verification:**

- Manual Chrome run records results for both prefix modes.
- Focused unit tests cover decision math with fake vectors.

**Files likely touched:**

- `apps/web/src/features/rehearsal/speech/e5PrefixCalibrationHarness.ts`
- `apps/web/src/features/rehearsal/speech/e5PrefixCalibrationHarness.test.ts`

### Task 3: Analyze Threshold Candidates

**Description:** Evaluate candidate threshold/margin/lexical-overlap values against the fixture output.

**Acceptance criteria:**

- At least two threshold candidates are compared.
- False positive ad-lib coverage cases are explicitly listed.
- The selected policy explains tradeoffs.

**Verification:**

- Spike document is updated with measurement table and final recommendation.

**Files likely touched:**

- `docs/spikes/e5-prefix-mode-calibration.md`

### Task 4: Publish Spike Decision

**Description:** Convert the spike from proposed to completed and hand off concrete constants to the implementation plan.

**Acceptance criteria:**

- `Status` changes to `Completed`.
- `Decision` section names the chosen prefix mode and thresholds.
- The implementation plan references the completed spike instead of comparing prefix modes itself.

**Verification:**

- Documentation review confirms no unresolved calibration questions remain.

**Files likely touched:**

- `docs/spikes/e5-prefix-mode-calibration.md`
- `docs/plans/semantic-utterance-outcome-classification.md`

### Decision

- Prefix mode: `query-query`
- `adLibRejectThreshold`: `0.89`
- `ambiguousMargin`: `0.04`
- `exactLexicalThreshold`: `0.55`

Use `query:` for both final transcript segments and script sentence embeddings when implementing utterance outcome classification. The measured fixture set is short-sentence semantic similarity rather than asymmetric document retrieval, and the `query-query` run preserved all exact, noisy, paraphrased, mixed, already-covered, and ad-lib expectations with the selected policy.

The selected policy is intentionally conservative about false positive ad-lib coverage:

1. Reject when top-1 similarity is below `0.89`.
2. Reject when `top1 - top2 < 0.04`, even if top-1 similarity is high.
3. Reject when top-1 sentence is already covered.
4. For accepted utterances, label as `covered` when lexical overlap is at least `0.55`; otherwise label as `paraphrased`.

Rationale:

- `query-query` passed `16/16` fixtures under the selected policy.
- `query-passage` passed `14/16`; it missed two paraphrases because one top-1 score was below `0.89` and another margin was below `0.04`.
- The highest unrelated ad-lib top-1 score in `query-query` was `0.881916`, so `0.89` rejects the measured ad-lib set by similarity alone. The margin check still protects clustered nearest-neighbor cases.
- The tightest accepted paraphrase margin in `query-query` was `0.040095`, while the nearest adjacent ambiguous case was `0.039509`. This keeps the boundary narrow but aligned with the priority to avoid ambiguous false coverage.
- Mixed exact script plus ad-lib utterances had lexical overlap `0.615385` and `0.571429`; `0.55` treats these as `covered` without converting measured paraphrases with overlap `0.100000` to `0.222222` into exact coverage.

### Measurement Environment

- Runtime: Chrome via Playwright against Vite dev server at `http://localhost:5173/e5-prefix-calibration.html`.
- Model path: `@huggingface/transformers` `feature-extraction` pipeline with `Xenova/multilingual-e5-small`, mean pooling, normalized embeddings.
- Candidate policy used for final run: `adLibRejectThreshold=0.89`, `ambiguousMargin=0.04`, `exactLexicalThreshold=0.55`.
- Raw measurement output was not committed. The committed document keeps only aggregate and fixture-level calibration metrics needed for the decision.

### Summary Table

| Fixture group | `query-passage` result | `query-query` result | Selected behavior |
| --- | --- | --- | --- |
| Exact readings | `2/2` pass, top1 `0.951445`-`0.970778`, margin `0.097226`-`0.100770` | `2/2` pass, top1 `0.996329`-`0.996820`, margin `0.118992`-`0.120712` | Accept as `covered` |
| Noisy STT variants | `2/2` pass, top1 `0.947867`-`0.950650`, lexical `0.666667`-`0.900000` | `2/2` pass, top1 `0.985462`-`0.991401`, lexical `0.666667`-`0.900000` | Accept as `covered` |
| Paraphrases | `1/3` pass; misses at top1/margin `0.916227/0.038337` and top1 `0.881915` | `3/3` pass; top1 `0.906550`-`0.957576`, margin `0.040095`-`0.083423` | Accept as `paraphrased` |
| Ambiguous adjacent sentences | `2/2` pass as rejected; margins `0.029106`, `0.004334` | `2/2` pass as rejected; margins `0.039509`, `0.009903` | Reject as `missed` |
| Unrelated ad-lib | `3/3` pass as rejected; top1 max `0.875410`, lexical `0` | `3/3` pass as rejected; top1 max `0.881916`, lexical `0` | Reject as `ad-lib` |
| Mixed script + ad-lib | `2/2` pass; lexical `0.571429`-`0.615385` | `2/2` pass; lexical `0.571429`-`0.615385` | Accept as `covered` when sentence id matches |
| Already-covered repeat | `1/1` pass as rejected; top1 `0.961763`, covered sentence id blocks mutation | `1/1` pass as rejected; top1 `0.995275`, covered sentence id blocks mutation | Reject as `missed` |
| Short filler/common phrase | `1/1` pass as rejected; top1 `0.854401`, lexical `0` | `1/1` pass as rejected; top1 `0.867288`, lexical `0` | Reject as `ad-lib` |

### Fixture-Level Final Results

| Fixture | Group | Expected | `query-passage` | `query-query` selected |
| --- | --- | --- | --- | --- |
| `ko-exact-001` | Exact | `covered sentence_1` | Pass, top1 `0.951445`, margin `0.100770` | Pass, top1 `0.996329`, margin `0.118992` |
| `ko-exact-002` | Exact | `covered sentence_5` | Pass, top1 `0.970778`, margin `0.097226` | Pass, top1 `0.996820`, margin `0.120712` |
| `ko-noisy-stt-001` | Noisy STT | `covered sentence_1` | Pass, top1 `0.947867`, lexical `0.900000` | Pass, top1 `0.991401`, lexical `0.900000` |
| `ko-noisy-stt-002` | Noisy STT | `covered sentence_3` | Pass, top1 `0.950650`, lexical `0.666667` | Pass, top1 `0.985462`, lexical `0.666667` |
| `ko-paraphrase-001` | Paraphrase | `paraphrased sentence_1` | Fail as `missed`, margin `0.038337` | Pass, top1 `0.938342`, margin `0.040095` |
| `ko-paraphrase-002` | Paraphrase | `paraphrased sentence_2` | Fail as `missed`, top1 `0.881915` | Pass, top1 `0.906550`, margin `0.058245` |
| `ko-paraphrase-003` | Paraphrase | `paraphrased sentence_5` | Pass, top1 `0.924020`, margin `0.059866` | Pass, top1 `0.957576`, margin `0.083423` |
| `ko-adjacent-ambiguous-001` | Ambiguous | `missed` | Pass as rejected, margin `0.029106` | Pass as rejected, margin `0.039509` |
| `ko-adjacent-ambiguous-002` | Ambiguous | `missed` | Pass as rejected, margin `0.004334` | Pass as rejected, margin `0.009903` |
| `ko-adlib-001` | Ad-lib | `ad-lib` | Pass as rejected, top1 `0.875410` | Pass as rejected, top1 `0.881916` |
| `ko-adlib-002` | Ad-lib | `ad-lib` | Pass as rejected, top1 `0.856506` | Pass as rejected, top1 `0.869207` |
| `ko-adlib-003` | Ad-lib | `ad-lib` | Pass as rejected, top1 `0.869152` | Pass as rejected, top1 `0.870351` |
| `ko-mixed-001` | Mixed | `covered sentence_2` | Pass, top1 `0.952903`, lexical `0.615385` | Pass, top1 `0.969233`, lexical `0.615385` |
| `ko-mixed-002` | Mixed | `covered sentence_4` | Pass, top1 `0.941721`, lexical `0.571429` | Pass, top1 `0.962533`, lexical `0.571429` |
| `ko-repeat-001` | Already covered | `missed` | Pass as rejected, top1 `0.961763` | Pass as rejected, top1 `0.995275` |
| `ko-filler-001` | Short filler | `ad-lib` | Pass as rejected, top1 `0.854401` | Pass as rejected, top1 `0.867288` |

### Known Limits

- The accepted paraphrase and rejected adjacent ambiguous boundary is narrow: `0.040095` vs `0.039509`. Keep `ambiguousMargin=0.04` conservative and revisit with a larger fixture set before broadening paraphrase acceptance.
- The Korean lexical overlap helper is token-based, not morphological. Particles and inflections can lower overlap; the threshold should be treated as an outcome label boundary, not as semantic acceptance.
- Mixed utterances are accepted as `covered` only when the matching script sentence remains top-1 with enough margin. This spike does not solve partial extraction of the ad-lib clause.
- Fixture text is synthetic and covers one slide-sized script. It does not prove cross-slide behavior, long transcripts, domain jargon, or real STT diarization noise.
- The spike did not update production `e5EmbeddingService` or `semanticUtteranceMatcher` constants. The production change belongs to the later `semantic-utterance-outcome-classification` implementation.
