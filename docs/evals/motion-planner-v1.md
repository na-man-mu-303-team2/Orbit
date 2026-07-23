# Semantic Motion Planner v1 평가와 출시 gate

## 평가 자산

- golden manifest: `tests/fixtures/motion-golden/slide-types.json`
- pinned eval manifest: `tests/fixtures/motion-golden/eval-manifest.json`
- v3 복합 process fixture: `tests/fixtures/motion-golden/semantic-process-v3.json`
- 사람 평가 입력 template: `tests/fixtures/motion-golden/human-eval-scorecard.csv`
- 자동 검증: `services/python-worker/tests/test_motion_golden.py`
- bounded eval runner: `services/python-worker/scripts/run_motion_planner_eval.py`

golden은 `cover`, `title`, `problem`, `solution`, `feature-grid`, `process`, `architecture`, `data`, `chart`, `comparison`, `quote`, `summary` authored fixture를 각각 하나 이상 포함한다. 각 case는 classified type와 narrative intent, eligible/excluded target, fallback Narrative Motion Plan, compiled operations, candidate animation/action graph, canonical root와 총 시간, compiler version과 stable animation ID를 고정한다. 원문 speaker notes 대신 합성 sentinel만 transient input으로 사용한다.

golden 변경은 model snapshot 변경과 compiler 변경을 같은 commit에 섞지 않는다. `slide-types.json` diff에서 target, beat, effect, start mode, stable ID, duration과 root 변화가 의도한 것인지 사람이 검토한다.

## 자동 안전 평가

offline 평가는 provider를 호출하지 않고 pinned manifest와 같은 12 fixture를 각각 5회 deterministic fallback으로 실행한다.

```bash
cd services/python-worker
PYTHONPATH=. uv run python scripts/run_motion_planner_eval.py --mode offline
uv run pytest tests/test_motion_golden.py tests/test_motion_merge.py tests/test_design_agent.py -q
```

출력은 model/fixture version, 실행 수, fallback 수, invariant별 위반 건수만 포함한다. plan, element text, notes, prompt, provider response는 출력하거나 저장하지 않는다. 다음 invariant는 모두 0이어야 한다.

- `invalidTarget`
- `unsafeSlideProposal`
- `excludedTarget`
- `danglingAction`
- `unsupportedGeneratedEffect`
- `capViolation`
- `speakerNotesArtifact`
- `compileFailure`
- `partialCompositeTarget`
- `skippedSequentialUnit`
- `patternMismatch`

live 평가는 승인된 test credential과 예산이 있는 격리 환경에서만 실행한다. runner는 `gpt-4.1-mini-2025-04-14` snapshot을 fixture당 5회 호출하고 같은 bounded aggregate만 stdout에 기록한다.

```bash
cd services/python-worker
PYTHONPATH=. uv run python scripts/run_motion_planner_eval.py --mode live
```

credential 값, raw plan, notes와 provider response는 QA 문서나 shell output에 복사하지 않는다. live 결과에서 violation이 하나라도 있으면 `on` rollout을 중단하고 `shadow`로 유지한다.

## export와 playback parity

`test_motion_golden.py`는 compiler animation을 OOXML main sequence로 serialize한 뒤 다시 parse해 다음 semantic tuple을 12 fixture에서 비교한다.

- target `elementId`
- `appear | fade-in | zoom-in`
- `on-slide-enter | on-click | with-previous | after-previous`
- duration과 delay

binary byte equality는 요구하지 않는다. presenter preview는 Web의 `createAnimationTimeline()`과 `createSlideshowAnimationPlan()` root 순서 parity test를 사용한다. 명시적 group은 generic PPTX export에서 child shape로 flatten하되 첫 shape의 semantic tuple을 보존하고 나머지는 `with-previous`로 동기화한다. apply→undo→redo의 animation/action deep equality는 editor-core Motion proposal validator 회귀 test를 사용한다.

## 사람 blind 평가

출시 판정에는 내부 평가자 3명 이상과 12종 × 최소 2변형이 필요하다. 각 평가자는 현재 heuristic과 semantic planner 결과의 arm을 모르는 상태로 scorecard template의 별도 사본을 작성한다. `notes`에는 사용자 원문, speaker notes, prompt를 적지 않고 bounded reason만 기록한다.

| 지표 | 출시 기준 |
| --- | ---: |
| narrative fit | 평균 4.0/5 이상 |
| hierarchy preservation | 90% 이상 pass |
| click appropriateness | 평균 4.0/5 이상 |
| distraction | 10% 미만 |
| structure correctness | 95% 이상 |
| preview confidence | 평균 4.0/5 이상 |
| export fidelity | 100% |

평가 완료 전에는 5% production rollout을 승인하지 않는다. 현재 저장소에는 평가자 점수를 임의로 채운 결과를 커밋하지 않으며, 실제 서명된 aggregate와 실행 날짜, fixture/model/compiler version만 별도 QA 기록에 남긴다.

## rollout과 중단 조건

1. `AI_MOTION_PLANNER_MODE=shadow`: authored와 imported 결과를 저장하지 않고 bounded count/reason/safety만 확인한다.
2. internal/demo: authored content만 `on`으로 운영한다.
3. 사람 평가와 live 5회 안전 평가 통과 후 authored 5%로 시작한다.
4. authored 25% → 100%는 safety invariant와 신고율을 확인하며 단계적으로 진행한다.
5. imported editable은 export parity 100% 확인 후 5% → 100%로 분리한다.
6. imported hybrid는 stable target/export parity 100%를 다시 확인한 뒤 별도 5%부터 시작한다.
7. snapshot, activity/activity-results, `partial | unknown` coverage는 영구 거부한다.

다음 중 하나라도 발생하면 즉시 중단한다.

- dangling action 또는 animation ID 유실 1건
- snapshot/partial/unknown proposal 1건
- unsupported generated effect 1건
- raw speaker notes artifact 1건
- presenter/PPTX semantic mismatch 1건
- apply/undo corruption 1건

rollback은 `AI_MOTION_PLANNER_MODE=off`로 semantic routing을 끄고 해당 배포 checkpoint를 되돌린다. eligibility, notes sanitization과 apply validator는 유지한다. Motion preview를 내리면 recommendation quick action도 함께 숨겨 검토할 수 없는 proposal이 노출되지 않게 한다. schema/DB migration은 없으며 이미 적용된 animation은 정상 Deck history와 undo로 되돌린다.
