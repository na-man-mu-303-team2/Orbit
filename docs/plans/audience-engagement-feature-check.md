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

The audience engagement implementation now covers the Phase 1-7 functional scope from the completion plan across shared contracts, API behavior, Web presenter/audience flows, worker processing, and hardened Playwright smoke coverage.

Completed areas include Korean audience join failure copy, explicit per-question manual result exposure, `speed-bonus` quiz scoring contracts and API behavior, multi-question audience poll/quiz response UI, presenter setup/live controls, duplicate Q&A grouping, private AI answer WebSocket broadcast and REST recovery, deterministic slide snapshot generation with durable per-slide session freeze/reuse, pre-start slide-render job scheduling, current-slide sanitized Deck JSON fallback rendering, selected-reference AI Q&A grounding, dedicated slide-renderer/slide-render-worker packages, and regression coverage around those paths.

Residual risk is concentrated in environment-level verification rather than known implementation gaps: the local environment cannot run Python `uv`/`pytest`, and the full real worker-to-browser snapshot lifecycle has package/API/worker tests plus browser reconnect/fallback smoke but not a single integrated E2E run with live queue infrastructure.

## Verification Matrix

| Area | Status | Evidence | Notes |
| --- | --- | --- | --- |
| Shared contracts and migrations | Pass | `pnpm --filter @orbit/shared test`; API migration specs; local TypeORM run/revert. | Added manual result exposure contract, durable audience slide snapshot map, `timeLimitSeconds`, `audience-slide-snapshot` purpose, and `interaction.results.exposed` event type. |
| Korean audience join/session copy | Pass | API/Web tests; source inspection. | Missing live session errors are normalized to `입장 코드를 확인해 주세요.` for audience-facing flows. |
| Manual result visibility | Pass | API service tests; new exposure endpoint. | `manual` results stay hidden until the presenter exposes a specific question. |
| Presenter live controls | Pass | Web tests and audience Playwright smoke pass for presenter panel and audience setup controls. | Prepared interaction library selection/manual ordering, AI reference selection controls, ad hoc poll/quiz create, activate, close, result expose/hide, and queue summary exist. |
| Polls and quizzes | Pass | Shared/API/Web tests and audience Playwright smoke pass. | Multi-question response UI, choice/ranking/open text/scale inputs, speed-bonus scoring, and after-close quiz answer reveal are covered. |
| Q&A duplicate merge | Pass | API service tests. | Similar questions reuse a group id through conservative cosine similarity at `>= 0.88`. |
| Private AI answer delivery | Pass | API gateway tests, Web realtime tests, and audience Playwright smoke pass. | API broadcasts `audience:private-answer`; Web client parses it and updates the Q&A card while REST recovery remains. The audience smoke verifies a recovered answer is visible to the asker and not to a second audience page. |
| AI Q&A grounding/generation | Pass with environment caveat | Python syntax compile; API/shared tests pass; Python tests updated but not runnable locally; audience Playwright smoke covers recovery/privacy and timeout escalation UI. | API now sends current public slide title/text without speaker notes, worker searches only `selectedReferenceIds`, enforces `0.78` top-source grounding, calls the configured OpenAI chat model only when `OPENAI_API_KEY` exists, and returns source type/title citations. |
| Slide snapshots | Pass with integration caveat | API service tests, worker processor tests, shared/job-queue tests, migration specs/run-revert, `@orbit/slide-renderer` tests, `@orbit/slide-render-worker` tests/build, and audience Playwright smoke pass. | Draft session creation schedules `audience-slide-render` jobs for stale/missing slide snapshots, the worker stores rendered snapshots and merges the result into `audience_slide_snapshots_json`, session start refreshes/freezes URLs for all slides, and presenter slide updates reuse the frozen URL. Browser smoke covers reconnect snapshot restoration; a single live queue worker-to-browser E2E remains a residual verification gap. |
| Audience slide rendering fallback | Pass with visual caveat | API service tests, Web audience tests, and `tests/e2e/audience-engagement.spec.ts` pass. | Image-first rendering works when `slideSnapshotUrl` exists; snapshot storage failure persists an audience-safe current-slide `slideFallback` Deck payload without `speakerNotes`/presenter script, and Web renders it through `SlideshowRenderer`. The audience smoke verifies the missing-snapshot Deck JSON fallback path; pixel-level visual parity remains a manual QA risk. |
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
- API sends public slide title/text context to the Q&A worker without speaker notes or presenter script, and Python Q&A grounding searches only selected reference file ids.
- Python Q&A enforces the `0.78` grounding threshold, returns structured no-grounding/low-confidence failures, and uses the configured OpenAI chat model only when `OPENAI_API_KEY` exists.
- `packages/slide-renderer` renders deterministic SVG slide snapshots without speaker notes/raw transcript/raw audio/presenter script/file base64.
- `apps/slide-render-worker` handles a slide-render job shape and writes the generated snapshot using purpose `audience-slide-snapshot`.
- `packages/shared` and `@orbit/job-queue` include the `audience-slide-render` job type and BullMQ enqueue contract, and API draft session creation schedules per-slide render jobs when snapshots are missing or stale.
- `apps/worker` consumes `audience-slide-render` jobs, writes snapshots through `StoragePort`, and merges each completed slide URL/content hash into the durable session snapshot map.
- API session start generates all slide snapshots when storage/deck data are available, stores the frozen per-slide URL map in `presentation_sessions.audience_slide_snapshots_json`, and initializes the first public slide state with its frozen `slideSnapshotUrl`.
- API presenter slide-state updates reuse the frozen per-slide `slideSnapshotUrl` and `slideSnapshotContentHash` from the session map, keeping effect state separate for reconnect recovery.
- If snapshot storage fails during a presenter slide update, API persists a current-slide `slideFallback` Deck payload with presenter-only fields removed, and the audience Web shell renders it through `SlideshowRenderer` instead of the placeholder.
- Python Q&A worker returns structured no-grounding failures when grounding/API key is absent and keeps citations to source type/title style.
- Audience Playwright smoke covers join/session copy, Q&A fallback/escalation action, AI answer REST recovery/privacy, AI timeout escalation UI, scale and multi-question poll responses, reaction send, quiz submit, after-close quiz answer reveal, frozen snapshot reconnect recovery, post-session survey, presenter prepared interaction selection/order, AI reference selection excluding slide snapshots, presenter results summary/CSV link, per-question manual result exposure, and Deck JSON slide fallback rendering when snapshots are unavailable.

## Residual Risks

- **Live queue worker-to-browser E2E was not run.** Snapshot jobs are queued during draft session preparation, worker completion is persisted into the durable session map, URLs are frozen at session start, and reconnect browser smoke restores a frozen snapshot URL. The remaining gap is a single integrated E2E with live queue infrastructure.
- **Pixel-level Deck JSON fallback parity remains a manual QA risk.** Snapshot storage failure falls back to a sanitized current-slide Deck payload rendered through the shared slideshow renderer, and the audience smoke covers the missing-snapshot path. Automated visual diffing is not present.
- **Python pytest remains environment-limited.** Selected-reference retrieval, public slide context, `0.78` thresholding, OpenAI-key-gated chat generation, asker-only recovery, and timeout escalation UI are implemented and covered outside the unavailable `uv run pytest` command.
- **Survey edge coverage is narrower than poll/quiz coverage.** Contact-consented survey submission and CSV export are covered; richer survey variants should be covered before broadening the survey feature surface.

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
- `pnpm --filter @orbit/shared test -- src/jobs/job.schema.test.ts`
- `pnpm --filter @orbit/job-queue test -- src/index.spec.ts`
- `pnpm --filter @orbit/shared lint`
- `pnpm --filter @orbit/job-queue lint`
- `pnpm --filter @orbit/shared test -- src/interactions/interaction.schema.test.ts`
- `pnpm --filter @orbit/worker test -- src/audience-slide-render.processor.spec.ts`
- `pnpm --filter @orbit/worker lint`
- `pnpm --filter @orbit/slide-render-worker lint`
- `PLAYWRIGHT_BASE_URL=http://127.0.0.1:5174 pnpm exec playwright test tests/e2e/audience-engagement.spec.ts --reporter=list` (13 passed)
- `PYTHONPYCACHEPREFIX=/private/tmp/orbit-pycache python3 -m py_compile services/python-worker/app/main.py services/python-worker/app/references.py services/python-worker/tests/test_qna.py services/python-worker/tests/test_references.py`
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

### Blocked By Local Tooling

- `cd services/python-worker && uv run pytest tests/test_qna.py tests/test_references.py`: `uv` is not installed in this environment.
- `python3 -m pytest services/python-worker/tests/test_qna.py services/python-worker/tests/test_references.py`: `pytest` is not installed in the available Python environments.
