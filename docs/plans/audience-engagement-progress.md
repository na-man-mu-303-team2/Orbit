# Audience Engagement Progress

## Purpose

This file is the durable checkpoint log for Audience Engagement Milestones 1-11. Codex must update this file at each milestone start, each milestone completion, and any blocker.

The top-level `## Current State` and `## Resume Checkpoint` sections are the source of truth after context compaction, thread restart, or interruption. Keep one top-level resume checkpoint and update it in place; append detailed milestone logs below.

## Current State

- Last completed milestone: 3
- Next milestone: 4
- Integration branch: `feature/audience`
- Current expected branch: `feature/audience`
- Goal status: in progress

## Resume Checkpoint

- Current branch: `feature/audience`
- Next milestone: 4
- Resume first checks:
  - Run `git status --short --branch`.
  - Read `docs/plans/audience-engagement-execution-protocol.md`.
  - Read Milestone 4 in `docs/plans/audience-engagement-implementation-plan.md`.
  - Read relevant product-plan sections for presenter feature controls, setup, selected interactions, survey draft status, AI reference selection, and disabled feature hiding.
  - Read shared audience feature schemas and existing presenter/editor UI patterns before editing controls.
- Blocked: no
- Notes: Milestones 1-3 implementation was already present on `feature/audience`; progress was recovered after verification.

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
