# Audience Engagement Feature Check

## Status

- Created: 2026-07-05
- Last updated: 2026-07-05
- Source documents:
  - `docs/plans/audience-engagement-product-plan.md`
  - `docs/plans/audience-engagement-implementation-plan.md`
  - `docs/plans/audience-engagement-completion-implementation-plan.md`
- Scope: Verify whether audience engagement now matches the approved completion plan.
- Method:
  - Source inspection
  - Contract/API/Web/Python worker tests
  - Typecheck/build/lint
  - Docker Compose config and TypeORM migration run/revert

## Summary

The audience engagement implementation is materially more complete than the previous check, but it is still not a full match for the completion plan.

Completed or substantially covered areas now include Korean audience join failure copy, explicit per-question manual result exposure, `speed-bonus` quiz scoring contracts and API behavior, multi-question audience poll/quiz response UI, presenter ad hoc interaction controls, duplicate Q&A grouping, private AI answer WebSocket broadcast and Web client receive handling, deterministic slide snapshot generation with durable per-slide session freeze/reuse, current-slide sanitized Deck JSON fallback rendering, a dedicated slide-renderer package/worker skeleton, and regression coverage around those paths.

Remaining partial areas are concentrated in the highest-fidelity items from the completion plan: full session-preparation job pre-generation before start, broader fallback parity/E2E verification beyond the current slide, true selected-reference retrieval plus OpenAI-backed grounded answer generation, and new E2E scenarios for the completed flows.

## Verification Matrix

| Area | Status | Evidence | Notes |
| --- | --- | --- | --- |
| Shared contracts and migrations | Pass | `pnpm --filter @orbit/shared test`; API migration specs; local TypeORM run/revert. | Added manual result exposure contract, durable audience slide snapshot map, `timeLimitSeconds`, `audience-slide-snapshot` purpose, and `interaction.results.exposed` event type. |
| Korean audience join/session copy | Pass | API/Web tests; source inspection. | Missing live session errors are normalized to `입장 코드를 확인해 주세요.` for audience-facing flows. |
| Manual result visibility | Pass | API service tests; new exposure endpoint. | `manual` results stay hidden until the presenter exposes a specific question. |
| Presenter live controls | Pass | Web tests pass for presenter panel and audience setup controls. | Prepared interaction library selection/manual ordering, AI reference selection controls, ad hoc poll/quiz create, activate, close, result expose/hide, and queue summary exist. |
| Polls and quizzes | Pass | Shared/API/Web tests pass. | Multi-question response UI, speed-bonus scoring, and after-close quiz answer reveal are covered. |
| Q&A duplicate merge | Pass | API service tests. | Similar questions reuse a group id through conservative cosine similarity at `>= 0.88`. |
| Private AI answer delivery | Pass | API gateway tests and Web realtime tests. | API broadcasts `audience:private-answer`; Web client parses it and updates the Q&A card while REST recovery remains. |
| AI Q&A grounding/generation | Partial | Python syntax compile; Python tests updated but not runnable locally. | Worker now fails closed without grounding/API key and formats source refs, but true selected-reference retrieval and OpenAI chat generation are not complete. |
| Slide snapshots | Partial | API service tests, migration specs/run-revert, `@orbit/slide-renderer` tests, and `@orbit/slide-render-worker` tests/build pass. | Session start freezes generated snapshot URLs for all slides in a durable per-slide map, and presenter slide updates reuse the frozen URL. Pre-start session-preparation job scheduling and full-fidelity rendering are not complete. |
| Audience slide rendering fallback | Partial | API service tests and Web audience tests pass. | Image-first rendering works when `slideSnapshotUrl` exists; snapshot storage failure now persists an audience-safe current-slide `slideFallback` Deck payload without `speakerNotes`/presenter script, and Web renders it through `SlideshowRenderer`. Pre-start fallback coverage and full E2E parity remain pending. |
| Reactions | Pass | Existing API/gateway/Web tests pass. | No new gap found in this pass. |
| Survey and contact collection | Pass | Existing API/Web tests pass. | No survey-specific regression found. |
| Results and reporting | Partial | Existing presenter/API tests pass. | Presenter can view aggregate summaries; richer charting remains outside current completion. |
| Privacy/security boundaries | Pass | Shared audience-safe schema tests pass. | Audience payload schemas continue rejecting presenter-only and secret-like fields. |

## Verified Working

- `packages/shared` now carries the audience interaction result exposure and speed-bonus contract changes.
- `apps/api` exposes `PATCH /api/v1/presentation-sessions/:sessionId/interactions/:interactionId/results/exposure` for presenter-controlled manual result visibility.
- API aggregation hides `manual` results unless the question is explicitly exposed.
- API scoring rejects late `speed-bonus` responses and awards `round(500 + 500 * remainingTimeRatio)` for correct answers.
- Audience poll/quiz UI renders all configured questions for choice, quiz multiple choice, scale, ranking, true/false, and open text inputs.
- After-close quizzes remain visible to the submitting audience member and show the correct answer, their submitted answer, correctness state, and score.
- Presenter audience route `/presentations/:sessionId/audience` is wired, with legacy project route retained.
- Presenter panel can select prepared library interactions, preserve manual order, create ad hoc poll/quiz sessions, activate/close interactions, expose/hide manual results, and display a Q&A queue summary.
- Session interaction responses include nullable `libraryInteractionId`, allowing the setup UI to recover prepared selections after refresh.
- Presenter setup can list project `reference-material` assets, recover selected AI reference ids, and update the session AI reference selection without exposing snapshot/internal assets as selectable references.
- Q&A submission now conservatively merges duplicate/similar questions into the existing question group.
- API broadcasts private AI answers to the audience private room when an answer exists.
- Web realtime client parses `audience:private-answer`, and the Q&A card updates from that private push.
- `packages/slide-renderer` renders deterministic SVG slide snapshots without speaker notes/raw transcript/raw audio/presenter script/file base64.
- `apps/slide-render-worker` handles a slide-render job shape and writes the generated snapshot using purpose `audience-slide-snapshot`.
- API session start generates all slide snapshots when storage/deck data are available, stores the frozen per-slide URL map in `presentation_sessions.audience_slide_snapshots_json`, and initializes the first public slide state with its frozen `slideSnapshotUrl`.
- API presenter slide-state updates reuse the frozen per-slide `slideSnapshotUrl` and `slideSnapshotContentHash` from the session map, keeping effect state separate for reconnect recovery.
- If snapshot storage fails during a presenter slide update, API persists a current-slide `slideFallback` Deck payload with presenter-only fields removed, and the audience Web shell renders it through `SlideshowRenderer` instead of the placeholder.
- Python Q&A worker returns structured no-grounding failures when grounding/API key is absent and keeps citations to source type/title style.

## Remaining Gaps

- **Slide snapshot lifecycle is not complete.** Snapshot URLs are now frozen in a durable per-slide session map at session start, but snapshot jobs are not yet queued during pre-start session preparation.
- **Deck JSON fallback still needs broader parity verification.** Snapshot storage failure now falls back to a sanitized current-slide Deck payload rendered through the shared slideshow renderer, but pre-start fallback generation, manual browser parity checks, and E2E coverage for missing snapshots are still pending.
- **AI Q&A is not true retrieval plus model generation.** Selected-reference chunk retrieval, public deck chunk search, thresholded grounding at `0.78`, and OpenAI chat completion are still partial/stubbed.
- **Prepared presenter setup remains partial.** Core controls are wired, including prepared interaction selection/order and AI reference selection; remaining setup polish is E2E coverage and any richer asset metadata UX.
- **E2E coverage was not added in this pass.** Unit/integration coverage is broad, but the completion-plan Playwright scenarios for presenter preparing/running interactions and audience reveal/recovery are still pending.
- **Python pytest could not run locally.** `uv` is not installed, and available Python environments do not have `pytest`; syntax compilation passed instead.

## Commands Run

### Passed

- `pnpm --filter @orbit/shared test`
- `pnpm --filter @orbit/realtime test`
- `pnpm --filter @orbit/slide-renderer test`
- `pnpm --filter @orbit/slide-render-worker test`
- `pnpm --filter @orbit/api test`
- `pnpm --filter @orbit/web test`
- `pnpm --filter @orbit/web lint`
- `pnpm --filter @orbit/api lint`
- `pnpm --filter @orbit/api test -- src/presentation-sessions/presentation-sessions.service.spec.ts`
- `pnpm --filter @orbit/web test -- src/features/audience/AudienceEntrance.test.tsx`
- `pnpm lint`
- `pnpm build`
- `pnpm test`
- `pnpm audience:checkpoint`
- `docker compose config --quiet`
- `docker compose up -d postgres`
- `DATABASE_URL=postgres://orbit:orbit@localhost:5432/orbit NODE_ENV=development pnpm db:migration:run`
- `DATABASE_URL=postgres://orbit:orbit@localhost:5432/orbit NODE_ENV=development pnpm db:migration:revert`
- `PYTHONPYCACHEPREFIX=/private/tmp/orbit-pycache python3 -m py_compile services/python-worker/app/main.py services/python-worker/tests/test_qna.py services/python-worker/tests/test_references.py`

### Passed After Fix

- `pnpm --filter @orbit/slide-render-worker test` initially failed when `@orbit/slide-renderer` `dist` was absent. Added `apps/slide-render-worker/vitest.config.ts` to alias tests to the renderer source.
- `pnpm lint` initially failed because two Web audience test fixtures omitted `exposedResultQuestionIds`. Added the new contract field.
- `pnpm db:migration:run` initially targeted a non-local DB from the ambient environment. Re-ran with local `DATABASE_URL`; sandbox then blocked local port access, so the verified run/revert used approved escalation.

### Not Run

- `cd services/python-worker && uv run pytest`: `uv` is not installed in this environment.
- `python3 -m pytest ...`: `pytest` is not installed in the available Python environments.
