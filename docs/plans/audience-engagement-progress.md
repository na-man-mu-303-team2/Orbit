# Audience Engagement Progress

## Purpose

This file is the durable checkpoint log for Audience Engagement Milestones 1-11. Codex must update this file at each milestone start, each milestone completion, and any blocker.

The top-level `## Current State` and `## Resume Checkpoint` sections are the source of truth after context compaction, thread restart, or interruption. Keep one top-level resume checkpoint and update it in place; append detailed milestone logs below.

## Current State

- Last completed milestone: 10
- Next milestone: 11
- Integration branch: `feature/audience`
- Current expected branch: `feature/audience-m11-hardening`
- Goal status: in progress

## Resume Checkpoint

- Current branch: `feature/audience-m11-hardening`
- Next milestone: 11
- Resume first checks:
  - Run `git status --short --branch`.
  - Read `docs/plans/audience-engagement-execution-protocol.md`.
  - Read Milestone 11 in `docs/plans/audience-engagement-implementation-plan.md`.
  - Read relevant product-plan sections for final hardening, accessibility, browser smoke, and launch readiness.
  - Verify final hardening tests, security regression coverage, accessibility text/labels, and docs updates.
- Blocked: no
- Notes: Milestone 11 hardening is active.

## Milestone Log

## Milestone 1 Start - 2026-07-05

- Branch: `feature/audience-m01-contracts`
- Scope: shared audience/presentation/realtime/interaction contracts and destructive foundational presentation session migration.
- Acceptance criteria: exported schemas, audience-safe payload rejection, join-code contracts replacing passcode, foundational tables only, active join code/project uniqueness, join-code API tests.
- Likely files: `packages/shared/src/presentation/presentation.schema.ts`, `packages/shared/src/audience/audience.schema.ts`, `packages/shared/src/interactions/interaction.schema.ts`, `packages/shared/src/realtime/websocket.schema.ts`, `apps/api/src/database/migrations/2026070201000-CreatePresentationSessions.ts`, `apps/api/src/database/migrations/2026070202000-AddUniqueOpenPresentationSession.ts`, `apps/api/src/presentation-sessions/*`.
- Verification plan: `pnpm --filter @orbit/shared test`, `pnpm --filter @orbit/api test`, `pnpm db:migration:run`, `pnpm db:migration:revert`, `pnpm audience:checkpoint`.
- Major risks: migration run/revert requires a running local Postgres; audience payload schemas must keep presenter-only fields unrepresentable.
- Resume checkpoint snapshot:
  - Current branch: `feature/audience-m01-contracts`
  - Next milestone: 1
  - Resume first checks: verify shared contracts, migration constraints, and presentation session API tests before merge.

## Milestone 1 Complete - 2026-07-05

- Milestone branch: `feature/audience-m01-contracts`
- Local commits:
  - `38eb465` `feat: add audience engagement foundation contracts`
  - `85edaed` `merge: audience milestone 1 contracts`
- Merged into `feature/audience`: yes
- Change summary: replaced passcode-oriented session contracts with 6-digit `joinCode`, nickname audience identity, audience-safe payload validation, foundational audience tables, active join-code/project uniqueness indexes, and join-code API tests.
- Acceptance criteria evidence: `packages/shared/src/index.ts` exports audience, interactions, presentation, and realtime schemas; `audienceSafePayloadSchema` rejects `speakerNotes`, `rawTranscript`, `rawAudio`, `presenterScript`, `fileBase64`, and sensitive keys; `presentation_sessions` migration creates `join_code` and omits passcode/password hash fields; `AddUniqueOpenPresentationSession` adds active join-code and project uniqueness indexes; feature-specific interaction/Q&A/survey tables are not created in Milestone 1 migrations.
- Self-review:
  - Correctness: shared/API tests cover schema parsing, audience-safe payloads, join-code session creation, duplicate nickname handling, rejoin, and feature settings.
  - Security/privacy: audience-facing schemas and service persistence reject presenter-only and sensitive payload fields before response/event storage.
  - Contract/schema compatibility: API/web use shared Zod schemas for request and response wrappers.
  - Architecture boundary: changes stay within `packages/shared`, `apps/api/src/presentation-sessions`, realtime contracts, and migrations.
  - Missing test risk: real DB migration run/revert could not complete because Docker daemon was unavailable; migration SQL is covered by unit tests.
- Verification:
  - `pnpm --filter @orbit/shared test`: pass
  - `pnpm --filter @orbit/api test`: pass
  - `pnpm db:migration:run`: not run to completion; first blocked by missing `LIVE_STT_PROVIDER`, second with local override blocked by current external DB host `staging-rds.example.com`, and local Docker Postgres could not start because Docker daemon is not running.
  - `pnpm db:migration:revert`: not run to completion for the same environment reasons as migration run.
- Remaining risks or next milestone carryover: run migration run/revert once Docker daemon and local Postgres are available.
- Resume checkpoint snapshot:
  - Current branch: `feature/audience`
  - Next milestone: 2
  - Resume first checks: read Milestone 2 plan, confirm `feature/audience` status, and verify join flow files before editing.

## Milestone 2 Start - 2026-07-05

- Branch: `feature/audience-m02-join-flow`
- Scope: presenter session preparation, 6-digit join code/QR URL, public `/join` and `/join/:joinCode`, nickname join, signed audience cookie, pre-live waiting state, rejoin, entry close, and join rate limit.
- Acceptance criteria: presenter can prepare/share session; audience joins before live and waits; same browser restores participant; duplicate nickname is rejected; closed entry blocks new joins but `/me` succeeds; 10/min IP+joinCode rate limit; accessible form labels and errors.
- Likely files: `apps/api/src/presentation-sessions/*`, `apps/web/src/features/audience/*`, `apps/web/src/pages/audience/*`, `apps/web/src/App.tsx`, `apps/web/src/features/editor/audience-link/*`.
- Verification plan: API presentation-session tests, web audience entrance and audience-link API tests, manual mobile check when dev server is available.
- Major risks: signed cookie recovery must not bypass session scoping; duplicate nickname and entry-closed errors must remain user-safe.
- Resume checkpoint snapshot:
  - Current branch: `feature/audience-m02-join-flow`
  - Next milestone: 2
  - Resume first checks: verify join/rejoin/entry-close API and `/join` UI before merge.

## Milestone 2 Complete - 2026-07-05

- Milestone branch: `feature/audience-m02-join-flow`
- Local commits:
  - `dc5218f` `feat: 청중 닉네임 입장 API 추가`
  - `4f9db82` `feat: 청중 입장 화면 추가`
  - `a136b97` `chore: 청중 입장 흐름 병합`
- Merged into `feature/audience`: yes
- Change summary: added join-code lookup and join endpoints, signed `HttpOnly` audience access cookie handling, participant restore, join rate limiting, `/join` routes, nickname form, waiting state, and editor audience link QR/code updates.
- Acceptance criteria evidence: `AudienceSessionsController` implements lookup, join, `/audience/me`, and rate limit; `PresentationSessionsService` creates/restores participants and rejects duplicate nicknames/closed entry; `AudienceEntrance` provides `/join` and direct join-code flows with Korean copy, labels, live error regions, and waiting state.
- Self-review:
  - Correctness: API tests cover create, join, duplicate nickname, rejoin, entry close, and state recovery; web tests cover join route and audience API behavior.
  - Security/privacy: audience token is signed and hashed for persistence; audience restore checks session-bound token payload and token hash.
  - Contract/schema compatibility: join request/response and lookup payloads use shared Zod wrappers.
  - Architecture boundary: presenter endpoints remain under project-scoped controller; audience endpoints stay under `presentation-sessions` public/audience route group.
  - Missing test risk: manual two-browser mobile check was not run in this environment.
- Verification:
  - `pnpm --filter @orbit/api test -- src/presentation-sessions`: pass
  - `pnpm --filter @orbit/web test -- src/features/audience/AudienceEntrance.test.tsx src/features/editor/audience-link/audienceLinkApi.test.ts`: pass
  - Manual mobile check with two browser sessions: not run; no dev server/browser session started for checkpoint recovery.
- Remaining risks or next milestone carryover: complete manual mobile join/rejoin check during final E2E hardening.
- Resume checkpoint snapshot:
  - Current branch: `feature/audience`
  - Next milestone: 3
  - Resume first checks: read Milestone 3 plan, confirm `feature/audience` status, and verify realtime gateway/state files before editing.

## Milestone 3 Start - 2026-07-05

- Branch: `feature/audience-m03-realtime-state`
- Scope: audience realtime contracts, gateway rooms, state snapshot persistence, REST recovery, presenter slide/effect publish, audience reconnect handling, and image-first slide shell fallback.
- Acceptance criteria: current slide/effect state after join; realtime updates; reconnect restores final state; audience payload excludes presenter-only fields; assistive status text for slide/reconnect state.
- Likely files: `apps/api/src/realtime/audience-realtime.gateway.ts`, `apps/api/src/presentation-sessions/*`, `packages/realtime/src/index.ts`, `apps/web/src/features/audience/*`, `apps/web/src/features/slides/rendering/*`, `apps/web/src/features/rehearsal/presenter/*`.
- Verification plan: realtime gateway tests, API snapshot endpoint tests, web audience recovery tests, Playwright presenter/two-audience smoke when browser environment is available.
- Major risks: 2-second mobile render gate and real multi-client browser behavior require final E2E/browser verification.
- Resume checkpoint snapshot:
  - Current branch: `feature/audience-m03-realtime-state`
  - Next milestone: 3
  - Resume first checks: inspect realtime payload schemas, gateway room auth, and audience reconnect logic before merge.

## Milestone 3 Complete - 2026-07-05

- Milestone branch: `feature/audience-m03-realtime-state`
- Local commits:
  - `850b8e5` `feat: 청중 실시간 상태 계약 추가`
  - `9dfbfd0` `feat: 청중 실시간 상태 API 추가`
  - `58eaae6` `feat: 청중 실시간 화면 복구 추가`
  - `1689693` `chore: 청중 실시간 상태 병합`
- Merged into `feature/audience`: yes
- Change summary: added audience realtime room helpers and shared event payload schemas, `AudienceRealtimeGateway`, REST state recovery, persisted realtime state updates, audience websocket client, presenter publisher, and image-first audience slide shell fallback.
- Acceptance criteria evidence: gateway tests validate audience/private room joins and authorization; service tests validate safe state persistence and event append; web tests validate reconnect/status updates and slide state rendering; shared realtime tests reject unsafe audience payloads.
- Self-review:
  - Correctness: gateway and REST recovery paths are covered by unit tests; audience shell uses persisted state when websocket reconnects.
  - Security/privacy: realtime payload schemas reuse `audienceSafePayloadSchema` and service rejects unsafe effect payloads before persistence/broadcast.
  - Contract/schema compatibility: room IDs and websocket event names are shared across `packages/realtime`, API gateway, and web clients.
  - Architecture boundary: realtime gateway is separate from the existing collaboration gateway and uses audience session rooms.
  - Missing test risk: Playwright two-audience smoke and real mobile 2-second display check were not run during checkpoint recovery.
- Verification:
  - `pnpm --filter @orbit/api test -- src/realtime/audience-realtime.gateway.spec.ts src/presentation-sessions/presentation-sessions.service.spec.ts`: pass
  - `pnpm --filter @orbit/web test -- src/features/audience/audienceRealtime.test.ts src/features/audience/AudienceEntrance.test.tsx src/features/slides/rendering/ReadOnlySlideCanvas.test.tsx`: pass
  - `pnpm --filter @orbit/realtime test`: pass
  - Playwright presenter/two-audience smoke: not run; deferred to Milestone 11 hardening.
- Remaining risks or next milestone carryover: run browser/mobile render gate verification once the full flow is assembled.
- Resume checkpoint snapshot:
  - Current branch: `feature/audience`
  - Next milestone: 4
  - Resume first checks: read Milestone 4 plan, confirm `feature/audience` status, and verify feature settings UI/API before editing.

## Milestone 4 Start - 2026-07-05

- Branch: `feature/audience-m04-feature-controls`
- Scope: presenter feature toggles, setup/overlay/control surfaces, entry open/close controls, feature-settings API, realtime feature broadcast, and audience UI hiding disabled features.
- Acceptance criteria: new sessions start with all features disabled; presenter can toggle while live; disabled features hidden from audience UI without deleting data; feature changes reflect without refresh; setup/overlay controls are keyboard reachable and labelled.
- Likely files: `apps/api/src/presentation-sessions/*`, `apps/api/src/realtime/audience-realtime.gateway.ts`, `apps/web/src/features/editor/*`, `apps/web/src/features/rehearsal/presenter/*`, `apps/web/src/features/audience/*`.
- Verification plan: API feature settings tests, web presenter/audience controls tests, Playwright check for hide/show when dev server is available.
- Major risks: selected prepared interactions, survey draft status, and AI reference selection are represented as setup placeholders until their data models land in later milestones.
- Resume checkpoint snapshot:
  - Current branch: `feature/audience-m04-feature-controls`
  - Next milestone: 4
  - Resume first checks: inspect feature settings schemas/API/UI and disabled feature hiding before merge.

## Milestone 4 Complete - 2026-07-05

- Milestone branch: `feature/audience-m04-feature-controls`
- Local commits:
  - `cc58d0b` `feat: 청중 기능 설정 API 추가`
  - `cb46b60` `feat: 청중 기능 제어 화면 추가`
  - `2c0bb62` `test: 청중 기능 카드 스모크 추가`
  - `30f79ab` `chore: 청중 기능 제어 병합`
- Merged into `feature/audience`: yes
- Change summary: added feature settings GET/PATCH, dependency normalization for AI Q&A and Q&A, realtime feature broadcast hooks, presenter QR/code and feature controls, editor audience setup UI, and audience active-card hiding for disabled features.
- Acceptance criteria evidence: service tests verify defaults and AI/Q&A dependency normalization; controller tests verify project-scoped access to feature settings; web tests verify setup sections and active cards; audience realtime client applies feature updates without refresh.
- Self-review:
  - Correctness: API/web tests cover feature setting updates, dependency normalization, UI toggles, and disabled feature hiding.
  - Security/privacy: presenter feature endpoints require authenticated user and project read/write checks; audience clients only receive shared feature settings.
  - Contract/schema compatibility: feature updates use shared `updateAudienceFeatureSettingsRequestSchema` and `audienceFeatureSettingsSchema`.
  - Architecture boundary: feature control logic stays in presentation-sessions service/controller and audience/presenter UI components.
  - Missing test risk: Playwright hide/show check was not run because the repo Playwright config does not auto-start a dev server.
- Verification:
  - `pnpm --filter @orbit/api test -- src/presentation-sessions/presentation-sessions.controller.spec.ts src/presentation-sessions/presentation-sessions.service.spec.ts`: pass
  - `pnpm --filter @orbit/web test -- src/features/audience/AudienceFeatureSettingsControls.test.tsx src/features/audience/AudiencePresenterPanel.test.tsx src/features/audience/AudienceEntrance.test.tsx tests/e2e/audience-features.spec.ts`: pass for Vitest-discovered web tests; `tests/e2e/audience-features.spec.ts` is Playwright and not executed by Vitest.
  - Playwright hide/show smoke: not run; deferred to Milestone 11 with a running dev server.
- Remaining risks or next milestone carryover: implement real interaction selection/copy behavior in Milestone 5 and replace setup placeholders with backed data.
- Resume checkpoint snapshot:
  - Current branch: `feature/audience`
  - Next milestone: 5
  - Resume first checks: read Milestone 5 plan, confirm `feature/audience` status, and implement poll/quiz interaction library and session interaction engine.

## Milestone 5 Start - 2026-07-05

- Branch: `feature/audience-m05-interactions`
- Scope: project interaction library CRUD for polls/quizzes, session interaction copy/activation/close, poll/quiz response submission/editing, one-active-interaction enforcement, result visibility and aggregation, audience active-card forms, and presenter control/results summaries.
- Acceptance criteria: one active poll/quiz at a time; poll response editable before close; quiz response final; ranking max 5 and scale 1-5 validation; result visibility honored; presenter sees live/post-close aggregates; accessible interaction forms and validation errors.
- Likely files: `packages/shared/src/interactions/*`, `apps/api/src/database/migrations/*`, `apps/api/src/presentation-sessions/*`, `apps/web/src/features/audience/*`, `apps/web/src/features/rehearsal/presenter/*`.
- Verification plan: shared interaction schema tests, API tests for library/session interaction/response flows, web active-card and presenter controls tests, `pnpm audience:checkpoint`.
- Major risks: implementing enough session interaction behavior without leaking future survey/Q&A table scope; preserving M1 migration split by creating only M5 feature tables here.
- Resume checkpoint snapshot:
  - Current branch: `feature/audience-m05-interactions`
  - Next milestone: 5
  - Resume first checks: inspect interaction schemas, presentation session service/controller, and audience active card UI before editing.

## Milestone 5 Complete - 2026-07-05

- Milestone branch: `feature/audience-m05-interactions`
- Local commits:
  - `268426d` `feat: 청중 투표 퀴즈 상호작용 추가`
- Merged into `feature/audience`: pending local merge
- Change summary: added shared poll/quiz library, session interaction, response, active interaction, and result schemas; created M5 interaction tables; added presenter library/session/activation/close/results endpoints; added audience active interaction and response endpoints; implemented poll/quiz response validation, poll edit and quiz finality rules, one-active DB index, aggregation, and audience active-card forms.
- Acceptance criteria evidence: migration creates only `project_interaction_library`, `session_interactions`, and `interaction_responses`; shared schema tests cover ranking max 5, fixed 1-5 scale, poll/quiz draft boundaries, and response shapes; API service tests cover library copy, poll response edit upsert, quiz duplicate conflict, and migration SQL; web tests cover active poll rendering and interaction API requests.
- Self-review:
  - Correctness: response validation checks question/answer type compatibility, option membership, poll edit behavior, quiz duplicate rejection, and basic quiz scoring.
  - Security/privacy: audience response endpoint requires signed audience cookie and token hash; presenter endpoints require project read/write checks; response payloads do not include token/cookie fields.
  - Contract/schema compatibility: request/response DTOs are shared through `packages/shared` and parsed at service/API boundaries.
  - Architecture boundary: M5 tables stay within interaction library/session/response scope and do not create Q&A, AI answer, survey, or aggregate report tables.
  - Missing test risk: real DB migration run/revert and Playwright poll/quiz scenario were not run because Docker/dev-server browser verification is deferred to M11.
- Verification:
  - `pnpm --filter @orbit/shared test -- src/interactions/interaction.schema.test.ts src/audience/audience.schema.test.ts`: pass
  - `pnpm --filter @orbit/api test -- src/presentation-sessions/presentation-sessions.service.spec.ts`: pass
  - `pnpm --filter @orbit/web test -- src/features/audience/AudienceEntrance.test.tsx src/features/audience/audienceApi.test.ts`: pass
  - `pnpm --filter @orbit/api lint`: pass
  - `pnpm --filter @orbit/web lint`: pass
  - `pnpm --filter @orbit/shared lint`: pass
  - `pnpm db:migration:run`: not run; Docker daemon is not running for local Postgres.
  - `pnpm db:migration:revert`: not run; Docker daemon is not running for local Postgres.
- Remaining risks or next milestone carryover: presenter detailed authoring/results UI is functional through endpoints and basic audience card but needs richer live controls in M10/M11 hardening; run real DB and Playwright flows later.
- Resume checkpoint snapshot:
  - Current branch: `feature/audience`
  - Next milestone: 6
  - Resume first checks: read Milestone 6 plan, confirm `feature/audience` status, and implement non-AI Q&A question queue.

## Milestone 6 Start - 2026-07-05

- Branch: `feature/audience-m06-qna`
- Scope: Q&A feature without AI, `audience_questions` migration, audience question submission with 3/min rate limit, private audience status endpoint, presenter pending/answered queue, verbal answer mark-as-answered flow, event logging, and accessible audience/presenter UI.
- Acceptance criteria: other audience members cannot see submitted questions; presenter can see pending questions and mark answered; answered questions leave pending queue; rate limit returns user-safe error; post-session report can identify unanswered questions; Q&A states are keyboard/screen-reader accessible.
- Likely files: `packages/shared/src/interactions/*`, `apps/api/src/database/migrations/*`, `apps/api/src/presentation-sessions/*`, `apps/web/src/features/audience/*`, `apps/web/src/features/rehearsal/presenter/*`.
- Verification plan: shared Q&A schema tests, API service/controller tests for submit/rate-limit/queue/status/answered, web audience Q&A form and presenter queue tests, `pnpm audience:checkpoint`.
- Major risks: keeping AI answer tables and embedding worker out of M6 while leaving group/merge-ready metadata for M7.
- Resume checkpoint snapshot:
  - Current branch: `feature/audience-m06-qna`
  - Next milestone: 6
  - Resume first checks: inspect Q&A product rules, interaction schemas, and existing audience active-card UI before editing.

## Milestone 6 Complete - 2026-07-05

- Milestone branch: `feature/audience-m06-qna`
- Local commits:
  - `77d6611` `feat: 청중 질문 대기열 추가`
- Merged into `feature/audience`: pending local merge
- Change summary: added Q&A request/response wrappers, `audience_questions` migration with merge-ready metadata, audience question submit/private status endpoints, presenter queue/answered endpoints, in-service 3/min participant rate limit, event logging, and audience Q&A active-card form.
- Acceptance criteria evidence: audience question endpoints require signed audience cookie and only return the requester question; presenter endpoints require project read/write checks; presenter queue returns pending/answered statuses; answered updates set `answeredAt`; Q&A card renders labelled textarea and live status; migration does not create AI answer tables.
- Self-review:
  - Correctness: service tests cover submit, queue list, and mark answered; shared tests cover Q&A wrappers; web tests cover Q&A API and active-card rendering.
  - Security/privacy: audience cannot list global questions; presenter queue is behind project authorization; events store question id only, not raw token/cookie.
  - Contract/schema compatibility: question DTOs use shared wrappers and `pending`/`answered` enum.
  - Architecture boundary: M6 creates only `audience_questions`; AI answer table and worker integration are left for M7.
  - Missing test risk: rate limiter is covered by implementation logic but not a dedicated timing test yet; Playwright Q&A scenario deferred to M11.
- Verification:
  - `pnpm --filter @orbit/shared test -- src/interactions/interaction.schema.test.ts`: pass
  - `pnpm --filter @orbit/api test -- src/database/migrations/2026070502000-CreateAudienceQuestions.spec.ts src/presentation-sessions/presentation-sessions.service.spec.ts`: pass
  - `pnpm --filter @orbit/web test -- src/features/audience/AudienceEntrance.test.tsx src/features/audience/audienceApi.test.ts`: pass
  - `pnpm --filter @orbit/shared lint`: pass
  - `pnpm --filter @orbit/api lint`: pass
  - `pnpm --filter @orbit/web lint`: pass
  - `pnpm db:migration:run`: not run; Docker daemon is not running for local Postgres.
  - `pnpm db:migration:revert`: not run; Docker daemon is not running for local Postgres.
- Remaining risks or next milestone carryover: add deterministic rate-limit test when broader Q&A tests are extended; AI answer/escalation and duplicate merge continue in M7.
- Resume checkpoint snapshot:
  - Current branch: `feature/audience`
  - Next milestone: 7
  - Resume first checks: read Milestone 7 plan, confirm `feature/audience` status, and implement AI Q&A worker/API/private answer flow.

## Milestone 7 Start - 2026-07-05

- Branch: `feature/audience-m07-ai-qna`
- Scope: selected reference storage, `audience_question_answers` migration, Python worker `/qna/answer`, API 5-second worker call, failure/timeout escalation, asker-only answer recovery, unresolved feedback, and duplicate merge placeholder.
- Acceptance criteria: AI Q&A enables Q&A; Q&A disable hides AI results; worker only uses selected references and public deck chunks; AI answer is asker-only; timeout/failure creates pending queue item; unresolved feedback keeps/creates pending queue item; duplicate questions are merged; source-boundary regressions exclude speaker notes/script/transcript/raw audio.
- Likely files: `services/python-worker/app/main.py`, `services/python-worker/tests/*`, `packages/shared/src/interactions/*`, `apps/api/src/database/migrations/*`, `apps/api/src/presentation-sessions/*`, `apps/web/src/features/audience/*`.
- Verification plan: Python worker tests, shared AI answer schema tests, API mocked worker tests, web AI answer/unresolved tests, `pnpm audience:checkpoint`.
- Major risks: full embedding semantic merge is represented by deterministic exact-text merge placeholder in this milestone and can be expanded later without schema break.
- Resume checkpoint snapshot:
  - Current branch: `feature/audience-m07-ai-qna`
  - Next milestone: 7
  - Resume first checks: inspect AI Q&A source boundary rules, Python worker app, and presentation session Q&A service before editing.

## Milestone 7 Complete - 2026-07-05

- Milestone branch: `feature/audience-m07-ai-qna`
- Local commits:
  - `17f902e` `feat: 청중 AI 질문 답변 추가`
- Merged into `feature/audience`: pending local merge
- Change summary: added AI answer schemas, selected reference storage, `audience_question_answers` migration, Python worker `/qna/answer`, API 5-second worker call with timeout/failure storage, asker-only answer recovery and feedback endpoints, unresolved escalation, and audience AI answer display.
- Acceptance criteria evidence: worker request model includes only public slide context and selected reference ids; API stores answer/failure rows per question/audience; answer recovery requires the same audience token; unresolved feedback sets escalation/pending queue state; AI Q&A feature dependency was already normalized by M4 feature settings.
- Self-review:
  - Correctness: API tests mock worker success and verify answer row persistence; migration tests cover selected references and answer table; web API tests cover private answer fetch and feedback; Python endpoint compiles and has pytest tests added.
  - Security/privacy: no speaker notes, raw transcript, raw audio, presenter script, token, cookie, or file base64 fields are accepted by worker request schemas or audience answer payloads.
  - Contract/schema compatibility: shared worker/answer/feedback schemas back API and web response shapes.
  - Architecture boundary: AI runtime is isolated behind Python worker and API service call; M7 adds answer storage without changing M6 question queue contract.
  - Missing test risk: true embedding merge is represented as exact/group metadata placeholder; Python pytest could not run because `uv` and bundled pytest are unavailable in this environment.
- Verification:
  - `pnpm --filter @orbit/shared test -- src/interactions/interaction.schema.test.ts`: pass
  - `pnpm --filter @orbit/api test -- src/presentation-sessions/presentation-sessions.service.spec.ts src/database/migrations/2026070503000-CreateAudienceQuestionAnswers.spec.ts`: pass
  - `pnpm --filter @orbit/web test -- src/features/audience/AudienceEntrance.test.tsx src/features/audience/audienceApi.test.ts`: pass
  - `pnpm --filter @orbit/shared lint`: pass
  - `pnpm --filter @orbit/api lint`: pass
  - `pnpm --filter @orbit/web lint`: pass
  - `/Users/donghyunkim/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/bin/python3 -m py_compile services/python-worker/app/main.py services/python-worker/tests/test_qna.py`: pass
  - `cd services/python-worker && uv run pytest tests/test_qna.py`: not run; `uv` command is unavailable in this shell.
- Remaining risks or next milestone carryover: run Python pytest with the project-managed `uv` environment; expand exact-text merge placeholder to embedding merge if needed after worker dependency is available.
- Resume checkpoint snapshot:
  - Current branch: `feature/audience`
  - Next milestone: 8
  - Resume first checks: read Milestone 8 plan, confirm `feature/audience` status, and implement reactions.

## Milestone 8 Start - 2026-07-05

- Branch: `feature/audience-m08-reactions`
- Scope: emoji reaction set, presenter show/hide setting via existing `reactionsEnabled`, audience reaction controls, 5/sec participant throttle, event append, realtime-compatible payload, and aggregate-ready counts.
- Acceptance criteria: enabled reactions are visible to audience/presenter surfaces; disabled reactions hide controls and reject submit; rate limit prevents excessive events; reaction bursts do not affect slide state paths; raw reaction events stay out of survey CSV; controls have accessible names.
- Likely files: `packages/shared/src/interactions/*`, `apps/api/src/presentation-sessions/*`, `apps/api/src/realtime/audience-realtime.gateway.ts`, `apps/web/src/features/audience/*`, `apps/web/src/features/rehearsal/presenter/*`.
- Verification plan: shared reaction schema tests, API reaction submit/rate-limit tests, web enabled/disabled UI/API tests, `pnpm audience:checkpoint`.
- Major risks: full floating reaction animation can be polished later; this milestone prioritizes event correctness and accessible controls.
- Resume checkpoint snapshot:
  - Current branch: `feature/audience-m08-reactions`
  - Next milestone: 8
  - Resume first checks: inspect reaction rules, existing feature toggle behavior, and audience active-card UI before editing.

## Milestone 8 Complete - 2026-07-05

- Milestone branch: `feature/audience-m08-reactions`
- Local commits:
  - `7fd4de4` `feat: 청중 실시간 반응 추가`
  - `f103d34` `chore: 청중 반응 마일스톤 병합`
- Merged into `feature/audience`: yes
- Change summary: added shared reaction request/response and websocket payload schemas, audience reaction submit endpoint, 5/sec per-participant throttle, audience event append, realtime `audience:reaction` broadcast to audience and presenter rooms, audience reaction controls/recent stream, presenter recent reaction strip, and API/web tests for submit, disabled, rate limit, broadcast, and client receipt.
- Acceptance criteria evidence: `reactionsEnabled` controls audience visibility and service acceptance; disabled submissions throw `ForbiddenException`; rate limit test rejects the sixth same-participant reaction within the window; reaction submit stores `reaction.sent` in `audience_events`; gateway emits `audience:reaction` without touching slide-state update paths; survey CSV is not implemented in M8 and no raw reaction export path was added; reaction buttons have per-type accessible names and a non-animation recent reaction stream.
- Self-review:
  - Correctness: shared schema, service, controller, gateway, audience client, presenter client, and render tests cover the M8 data flow.
  - Security/privacy: reaction payloads include only `sessionId`, `audienceId`, and enum `reaction`; token/cookie values stay in signed cookie verification and are never emitted.
  - Contract/schema compatibility: API/web/gateway use shared Zod schemas for reaction requests, responses, and websocket payloads.
  - Architecture boundary: changes stay within audience presentation session, realtime, web audience/presenter surfaces, and shared contracts; no survey/report tables were added early.
  - Missing test risk: full floating reaction animation and real browser burst/slide-update concurrency were not run; synthetic unit coverage verifies broadcast and rate-limit behavior.
- Verification:
  - `pnpm --filter @orbit/shared test -- src/interactions/interaction.schema.test.ts src/realtime/websocket.schema.test.ts`: pass
  - `pnpm --filter @orbit/api test -- src/presentation-sessions/presentation-sessions.service.spec.ts src/presentation-sessions/audience-sessions.controller.spec.ts src/realtime/audience-realtime.gateway.spec.ts`: pass
  - `pnpm --filter @orbit/web test -- src/features/audience/AudienceEntrance.test.tsx src/features/audience/audienceApi.test.ts src/features/audience/audienceRealtime.test.ts src/features/audience/audiencePresenterRealtime.test.ts`: pass
  - `pnpm --filter @orbit/shared lint`: pass
  - `pnpm --filter @orbit/api lint`: pass after narrowing the controller spec mock literal type
  - `pnpm --filter @orbit/web lint`: pass
  - `pnpm audience:checkpoint`: pass before completion checkpoint update
  - `git diff --check`: pass
- Remaining risks or next milestone carryover: run a real two-browser reaction burst while slide updates are publishing during M11 hardening; polish floating reaction animation if product wants more visual motion.
- Resume checkpoint snapshot:
  - Current branch: `feature/audience`
  - Next milestone: 9
  - Resume first checks: read Milestone 9 plan, confirm `feature/audience` status, and implement survey forms/submission/export boundaries.

## Milestone 9 Start - 2026-07-05

- Branch: `feature/audience-m09-survey`
- Scope: session-owned survey form CRUD while draft, survey tables, start-lock behavior, survey-enabled audience flow, post-end submission window, eligibility and duplicate checks, consent-gated contact fields, and survey-only CSV export.
- Acceptance criteria: form cannot change after start; ineligible audience tokens cannot submit; eligible reconnecting participant can submit within 1 hour; duplicate submit is rejected; required questions block missing answers; contact answers require consent; CSV includes timestamp, nickname, survey answers, and contact fields only; UI controls and warnings are accessible.
- Likely files: `packages/shared/src/interactions/*`, `apps/api/src/database/migrations/*`, `apps/api/src/presentation-sessions/*`, `apps/web/src/features/audience/*`, `apps/web/src/features/editor/*`, `apps/web/src/features/rehearsal/presenter/*`.
- Verification plan: shared survey schema tests, migration tests, API service/controller tests for draft lock/eligibility/window/duplicate/CSV, web audience survey tests, `pnpm audience:checkpoint`.
- Major risks: full survey builder UI can sprawl; keep M9 focused on backed session survey form, audience submission, and CSV contract while using compact presenter controls.
- Resume checkpoint snapshot:
  - Current branch: `feature/audience-m09-survey`
  - Next milestone: 9
  - Resume first checks: inspect shared survey schemas, presentation session service/controller, migration registration, and audience active/survey UI before editing.

## Milestone 9 Complete - 2026-07-05

- Milestone branch: `feature/audience-m09-survey`
- Local commits:
  - `955785c` `feat: 청중 세션 설문 추가`
  - `7744a39` `chore: 청중 설문 마일스톤 병합`
- Merged into `feature/audience`: yes
- Change summary: added session-owned survey schemas, contact consent validation, survey tables and migration registration, presenter start/end endpoints with survey lock and one-hour close window, presenter survey get/upsert/CSV endpoints, audience survey get/submit endpoints, session-ended realtime broadcast, audience post-end survey UI, presenter default survey setup/CSV link, and targeted shared/API/web tests.
- Acceptance criteria evidence: survey upsert checks session `draft` status and form `locked_at`; `startSession` locks existing survey forms; `endSession` sets `survey_closes_at` one hour out and broadcasts `audience:session-ended`; submit requires signed audience access, `joinedBeforeEnd`, ended session, enabled survey, open window, required answers, contact consent for contact answers, and unique `(survey_id, audience_id)`; CSV is built only from `session_survey_responses` joined to nicknames and does not read Q&A/poll/quiz/reaction raw rows.
- Self-review:
  - Correctness: tests cover form lock, required answers, duplicate submit, CSV shape, routing, migration SQL, realtime session-ended payload, and audience/presenter web API/UI paths.
  - Security/privacy: survey/contact payloads remain audience-safe; contact fields reject sensitive/unique identifying prompt categories; CSV includes survey rows only and does not include tokens/cookies/raw event data.
  - Contract/schema compatibility: shared survey wrappers back API and web; session-ended websocket payload uses public session fields only.
  - Architecture boundary: survey data is stored in M9-specific tables and uses presentation-sessions route/service patterns; no reporting dashboard work from M10 was added.
  - Missing test risk: real DB migration run/revert could not run because Docker daemon is unavailable; full browser auto-transition is covered by realtime/unit paths but not Playwright.
- Verification:
  - `pnpm --filter @orbit/shared test -- src/interactions/interaction.schema.test.ts src/realtime/websocket.schema.test.ts`: pass
  - `pnpm --filter @orbit/api test -- src/database/migrations/2026070504000-CreateSessionSurveys.spec.ts src/presentation-sessions/presentation-sessions.service.spec.ts src/presentation-sessions/presentation-sessions.controller.spec.ts src/presentation-sessions/audience-sessions.controller.spec.ts src/realtime/audience-realtime.gateway.spec.ts`: pass
  - `pnpm --filter @orbit/web test -- src/features/audience/AudienceEntrance.test.tsx src/features/audience/audienceApi.test.ts src/features/audience/audienceRealtime.test.ts src/features/editor/audience-link/audienceLinkApi.test.ts`: pass
  - `pnpm --filter @orbit/shared lint`: pass
  - `pnpm --filter @orbit/api lint`: pass
  - `pnpm --filter @orbit/web lint`: pass
  - `pnpm audience:checkpoint`: pass before completion checkpoint update
  - `git diff --check`: pass
  - `docker compose up -d postgres`: failed because Docker daemon is not running, so `pnpm db:migration:run` and `pnpm db:migration:revert` were not run against a local database.
- Remaining risks or next milestone carryover: run migration run/revert once Docker is available; run real two-browser session-ended-to-survey flow in M11 hardening.
- Resume checkpoint snapshot:
  - Current branch: `feature/audience`
  - Next milestone: 10
  - Resume first checks: read Milestone 10 plan, confirm `feature/audience` status, and implement presenter results/reporting surfaces.

## Milestone 10 Start - 2026-07-05

- Branch: `feature/audience-m10-results`
- Scope: presenter live/post-session results endpoint and UI, reaction/Q&A/interaction/survey aggregates, individual survey responses for presenters, aggregate report table, preliminary/final report generation, survey CSV raw-data deletion guard, and retention cleanup service path.
- Acceptance criteria: presenter can view live and post-session results; audience has no presenter result endpoint; survey CSV returns gone after raw data deletion while aggregate remains; cleanup deletes raw rows/contact data after retention and retains anonymous aggregate; result summaries have accessible labels/text.
- Likely files: `packages/shared/src/interactions/*`, `apps/api/src/database/migrations/*`, `apps/api/src/presentation-sessions/*`, `apps/web/src/features/audience/*`, `apps/web/src/features/editor/*`, `apps/web/src/features/rehearsal/presenter/*`.
- Verification plan: shared report schema tests, migration tests, API aggregation/CSV/cleanup authorization tests, web results screen tests, `pnpm audience:checkpoint`.
- Major risks: full charting can sprawl; keep M10 to structured summaries/tables and anonymous aggregate data while preserving raw-data cleanup semantics.
- Resume checkpoint snapshot:
  - Current branch: `feature/audience-m10-results`
  - Next milestone: 10
  - Resume first checks: inspect existing result aggregation, Q&A/survey/reaction storage, presenter panel, and CSV export behavior before editing.

## Milestone 10 Complete - 2026-07-05

- Milestone branch: `feature/audience-m10-results`
- Local commits:
  - `5578443` `feat: 청중 결과 리포트 추가`
  - `9955d9a` `chore: 청중 결과 마일스톤 병합`
- Merged into `feature/audience`: yes
- Change summary: added shared anonymous aggregate report and session-results contracts, `audience_aggregate_reports` migration and registration, presenter results endpoint, preliminary report generation on session end, final aggregate generation during retention cleanup, raw audience data cleanup service path, survey CSV gone guard after cleanup, presenter results API client, and accessible text summaries for Q&A, reactions, interactions, survey response counts, and individual survey responses.
- Acceptance criteria evidence: presenter results are exposed only through the authenticated project-scoped presentation-session controller; no audience presenter-results route was added; `exportSessionSurveyCsv` returns `GoneException` when aggregate raw data deletion is marked; cleanup deletes raw audience participant/event/question/answer/interaction/survey rows while retaining anonymous `audience_aggregate_reports`; web results summaries render text labels for aggregate totals.
- Self-review:
  - Correctness: tests cover report schema safety, migration SQL, presenter route delegation, aggregate results, survey response listing, CSV gone behavior, and retention cleanup retaining the aggregate.
  - Security/privacy: aggregate report payloads are parsed through `audienceSafePayloadSchema`; presenter results endpoint requires project read access; raw cleanup removes contact-bearing survey responses and participant identifiers while leaving anonymous counts.
  - Contract/schema compatibility: API and web use shared `audienceAggregateReportSchema` and `sessionResultsResponseSchema`.
  - Architecture boundary: reporting stays in presentation-sessions service/controller and M10 report table; cleanup is exposed as a service path without adding deployment/scheduler behavior outside the milestone.
  - Missing test risk: real DB migration run/revert could not run because Docker daemon is unavailable; full charting/browser E2E remains for Milestone 11 hardening.
- Verification:
  - `pnpm --filter @orbit/shared test -- src/interactions/interaction.schema.test.ts`: pass
  - `pnpm --filter @orbit/api test -- src/database/migrations/2026070505000-CreateAudienceAggregateReports.spec.ts src/presentation-sessions/presentation-sessions.service.spec.ts src/presentation-sessions/presentation-sessions.controller.spec.ts`: pass
  - `pnpm --filter @orbit/web test -- src/features/audience/AudiencePresenterPanel.test.tsx src/features/editor/audience-link/audienceLinkApi.test.ts`: pass
  - `pnpm --filter @orbit/shared lint`: pass
  - `pnpm --filter @orbit/api lint`: pass
  - `pnpm --filter @orbit/web lint`: pass
  - `git diff --check`: pass
  - `pnpm audience:checkpoint`: pass before completion checkpoint update
  - `docker compose up -d postgres`: failed because Docker daemon is not running, so `pnpm db:migration:run` and `pnpm db:migration:revert` were not run against a local database.
- Remaining risks or next milestone carryover: run DB migration run/revert once Docker is available; perform final browser/mobile accessibility and multi-client smoke in Milestone 11.
- Resume checkpoint snapshot:
  - Current branch: `feature/audience`
  - Next milestone: 11
  - Resume first checks: read Milestone 11 plan, confirm `feature/audience` status, and run final hardening/browser accessibility checks before completion.

## Milestone 11 Start - 2026-07-05

- Branch: `feature/audience-m11-hardening`
- Scope: final end-to-end hardening, smoke coverage, mobile/accessibility checks, security regression checks for audience-safe payloads, documentation alignment, and release-readiness verification across shared/API/web/Python worker.
- Acceptance criteria: full E2E or documented local-environment blocker, `pnpm build`, `pnpm lint`, `pnpm test`, `pnpm test:smoke`, `docker compose config`, and Python worker tests pass or are explicitly accounted for; no audience endpoint or websocket payload exposes presenter-only or secret fields; implementation docs and plan links are current; join, active card, presenter overlay, survey, and results screens have accessible labels/summaries.
- Likely files: `docs/contracts.md`, `docs/plans/audience-engagement-product-plan.md`, `docs/testing/*`, E2E/smoke test files, and small UI/API test hardening files as needed.
- Verification plan: inspect scripts and existing smoke/E2E setup, add or harden smoke/security/accessibility tests, run targeted tests, run final `pnpm build`, `pnpm lint`, `pnpm test`, `pnpm test:smoke`, `docker compose config`, `cd services/python-worker && uv run pytest`, `pnpm audience:checkpoint`, and `git diff --check`.
- Major risks: Docker daemon and `uv` availability may block DB/Python full verification; browser E2E may require dev-server or Playwright configuration not present in this environment.
- Resume checkpoint snapshot:
  - Current branch: `feature/audience-m11-hardening`
  - Next milestone: 11
  - Resume first checks: inspect smoke/E2E scripts, audience-safe payload tests, web accessibility tests, and docs before editing.

## Progress Entry Template

Use this template for each milestone start:

```md
## Milestone N Start - YYYY-MM-DD

- Branch: `feature/audience-mNN-short-name`
- Scope:
- Acceptance criteria:
- Likely files:
- Verification plan:
- Major risks:
- Resume checkpoint snapshot:
  - Current branch:
  - Next milestone:
  - Resume first checks:
```

Use this template for each milestone completion:

```md
## Milestone N Complete - YYYY-MM-DD

- Milestone branch:
- Local commits:
  - `<hash>` `<message>`
- Merged into `feature/audience`: yes/no
- Change summary:
- Acceptance criteria evidence:
- Self-review:
  - Correctness:
  - Security/privacy:
  - Contract/schema compatibility:
  - Architecture boundary:
  - Missing test risk:
- Verification:
  - `<command>`: pass/fail/not run with reason
- Remaining risks or next milestone carryover:
- Resume checkpoint snapshot:
  - Current branch:
  - Next milestone:
  - Resume first checks:
```

Use this template for blockers:

```md
## Blocked - YYYY-MM-DD

- Current branch:
- Current milestone:
- Blocker:
- Evidence:
- Work completed before blocker:
- User decision needed:
- Resume checkpoint snapshot:
  - Current branch:
  - Next milestone:
  - Resume first checks:
```
