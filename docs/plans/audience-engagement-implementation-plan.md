# Audience Engagement Implementation Plan

## Status

- Status: Approved
- Created: 2026-07-05
- Source plan: [audience-engagement-product-plan.md](./audience-engagement-product-plan.md)
- Milestone style: one pull request per milestone
- Language: English
- Detail level: milestone plan with DB/API/shared schema/UI scope

## Objective

Implement audience engagement for ORBIT so that audience members can join a presentation from a smartphone browser using a 6-digit code and required nickname, follow the current slide and presenter effects in real time, use presenter-enabled Q&A, polls, quizzes, reactions, and complete a post-session survey.

This document is intended for developers. It turns the product plan into an ordered set of implementation milestones, each with background, required capabilities, acceptance criteria, likely files, and verification.

## Fixed Decisions

### Entry and Identity

- Audience web routes:
  - Public entry home: `/join`
  - Direct QR/code route: `/join/:joinCode`
- Entry model: required 6-digit `joinCode` plus required nickname.
- Audience login: not used.
- Audience token storage: signed `HttpOnly` cookie.
- Rejoin: same browser restores the audience participant automatically from the cookie.
- Nickname uniqueness: unique within a session; reserved until session end.
- Join code creation: when a presenter prepares a session in the editor.
- Pre-live entry: allowed. Audience members enter a waiting room until the session goes live.
- Join code reuse: unique only among active sessions.
- Project concurrency: one active audience session per project.
- ID format: `prefix_uuid`, for example `session_...`, `audience_...`, `question_...`, `interaction_...`, `survey_...`.

### Migration

- Replace the existing 4-digit passcode audience access model.
- Existing `presentation_sessions` passcode data is development data and can be destructively replaced by a new migration.
- Keep the `presentation-sessions` module and route group. Remove passcode-specific API/schema names and replace behavior with `joinCode + nickname`.

### Realtime

- Use a separate `AudienceRealtimeGateway`.
- Room model:
  - session room for shared events such as slide/effect state, reactions, active interaction updates
  - private audience room keyed by `audienceId` for asker-only AI answers and private question state
- Private answer delivery:
  - WebSocket push by default
  - REST read endpoints for refresh/reconnect recovery
- Snapshot source: gateway memory first, DB snapshot fallback.
- Slide/effect sync:
  - audience mirrors the presenter screen state
  - sync includes current slide plus all presenter effect/reveal/highlight state
  - reconnect restores current final effect state, not animation history
- Audience slide rendering:
  - image snapshot first
  - minimal overlay metadata for effects/highlights
  - Deck JSON fallback when image snapshot is missing or failed
- Slide snapshot generation:
  - generate/freeze audience slide images at session start
  - overlay coordinates come from Deck element metadata plus optional generated correction metadata
- Mobile render gate: current slide visible within 2 seconds after join/reconnect on supported mobile browsers.

### Storage and Retention

- Store both append-only events and feature-specific query tables.
- Thirty-day retention applies to all audience raw data.
- After retention:
  - delete individual raw data and contact data
  - keep anonymous aggregate reports
- Privacy/legal review for contact consent copy is a follow-up item, not a blocking implementation gate.

### UI

- Audience layout: current slide at top, active card below.
- Disabled features are hidden from the audience UI.
- Default user-facing copy language: Korean.
- Default copy storage: a lightweight locale dictionary, starting with Korean keys and values.
- Presenter UI:
  - editor setup surface for preparing session, selected interactions, survey, reference selection
  - presenter mode overlay for quick live control
  - separate presenter results/control screen for detailed settings and results
- UI milestones must include basic accessibility acceptance:
  - form controls have labels
  - keyboard focus states are visible
  - dialogs/panels have accessible names
  - color contrast is checked for primary text, errors, and disabled states

### Feature Rules

- All participation features start disabled.
- Presenter can enable/disable features during a session.
- Disabling a feature preserves submitted data but hides the feature from audience UI.
- One poll or quiz can be active at a time.
- Prepared polls/quizzes:
  - stored in a project-level interaction library
  - explicitly selected for a session
  - manually ordered in session preparation
  - copied into the session at session start
- Ad hoc polls/quizzes:
  - created during the session
  - preserved only in the session, not auto-saved to the project library
- Interaction result visibility enum: `hidden`, `manual`, `after-close`, `live`.
- Scale/rating questions: fixed 1-5.
- Ranking questions: maximum 5 options.
- Poll response edits: allowed before close.
- Quiz response edits: not allowed.
- Quiz answer reveal: after close.
- Quiz scoring enum: `none`, `correct-count`, `speed-bonus`.

### AI Q&A

- AI Q&A and Q&A toggles:
  - enabling AI Q&A automatically enables Q&A
  - disabling Q&A also disables AI Q&A
  - disabling Q&A hides already-started AI request results from audience UI, but in-flight AI requests may complete and be stored
- AI Q&A runtime: Python worker.
- API call pattern: API synchronously calls Python worker `/qna/answer`.
- Timeout: 5 seconds. Timeout automatically escalates to presenter queue.
- AI references: selected per session by presenter.
- AI source boundary: public deck content and selected references only.
- Speaker notes, raw transcript, raw audio, presenter script, and file base64 must never be in audience-facing payloads or logs.
- AI answer visibility: asker only.
- AI answer model: one question, one AI answer.
- Feedback: resolved/unresolved.
- Manual unresolved and automatic AI failure both create presenter queue items.
- Duplicate question merge: embedding-based automatic merge.
- Presenter queue statuses: `pending`, `answered`.
- Presenter answer mode: verbal answer; presenter marks question as answered.
- Post-session unanswered questions appear in presenter report only.

### Survey and Contact

- Survey form scope: session-owned.
- Survey edit lock: session start.
- Survey trigger: automatic transition when presenter ends the session.
- Submission window: 1 hour after session end.
- Eligibility: only participants who joined before session end; eligible users may reconnect within the 1-hour window.
- Survey response edit: not allowed.
- Partial survey response persistence: not allowed.
- Survey questions: required/optional per question.
- Contact collection:
  - dedicated consent section
  - audience can submit general survey without consenting to contact collection
  - contact section uses the same field/question types as survey questions
  - contact field requiredness is presenter-configurable
  - forbidden custom field categories: unique identifying information and sensitive information, including resident registration identifiers, passport/license/foreigner registration identifiers, bank/account identifiers, health, politics, religion, and similar sensitive categories
  - consent record stores yes/no only
- Survey CSV:
  - survey data only
  - includes response timestamp, nickname, survey answers, and contact fields

### Rate Limits

- Join/nickname attempts: 10 per minute per IP plus joinCode.
- Q&A submissions: 3 per minute per audience participant.
- Reactions: 5 per second per audience participant.

## Architecture Overview

### Shared Packages

Add or update schemas in `packages/shared`:

- `presentation` keeps session core:
  - `presentationSessionSchema`
- `audience` contains audience identity and session-state contracts:
  - `audienceParticipantSchema`
  - `audienceFeatureSettingsSchema`
  - `audienceRealtimeStateSchema`
  - `audienceJoinRequestSchema`
  - `audienceJoinResponseSchema`
- `interactions` contains poll, quiz, Q&A, survey, reaction, and response contracts:
  - `surveyFormSchema`
  - `surveyResponseSchema`
  - interaction library schemas
  - session interaction schemas
  - Q&A schemas
  - reaction schemas
- `realtime`:
  - audience websocket event types
  - audience session room payloads
  - private audience payloads

Schema acceptance requirements:

- Runtime validation makes presenter-only fields unrepresentable in audience-facing payload schemas, with tests asserting absence.
- Request/response schemas use domain wrappers such as `{ session }`, `{ participant }`, `{ question }`, `{ interaction }`, `{ survey }`.
- New IDs use `prefix_uuid`.
- Enums are explicit and shared between API and web.

### API Modules

Use `/api/v1/presentation-sessions` as the primary route group.

Representative presenter endpoints:

- `POST /api/v1/presentation-sessions`
- `GET /api/v1/presentation-sessions/:sessionId`
- `POST /api/v1/presentation-sessions/:sessionId/start`
- `POST /api/v1/presentation-sessions/:sessionId/end`
- `PATCH /api/v1/presentation-sessions/:sessionId/entry`
- `PATCH /api/v1/presentation-sessions/:sessionId/features`
- `POST /api/v1/presentation-sessions/:sessionId/interactions/select`
- `POST /api/v1/presentation-sessions/:sessionId/interactions/:interactionId/activate`
- `POST /api/v1/presentation-sessions/:sessionId/interactions/:interactionId/close`
- `GET /api/v1/presentation-sessions/:sessionId/results`
- `GET /api/v1/presentation-sessions/:sessionId/survey.csv`

Representative audience endpoints:

- `GET /api/v1/presentation-sessions/join/:joinCode`
- `POST /api/v1/presentation-sessions/join/:joinCode`
- `GET /api/v1/presentation-sessions/:sessionId/audience/me`
- `GET /api/v1/presentation-sessions/:sessionId/audience/state`
- `POST /api/v1/presentation-sessions/:sessionId/audience/questions`
- `GET /api/v1/presentation-sessions/:sessionId/audience/questions/:questionId`
- `POST /api/v1/presentation-sessions/:sessionId/audience/interactions/:interactionId/respond`
- `POST /api/v1/presentation-sessions/:sessionId/audience/reactions`
- `POST /api/v1/presentation-sessions/:sessionId/audience/survey`

Route policy:

- Join lookup and initial join use `joinCode`.
- After join, audience APIs use `sessionId` plus the signed audience cookie.
- Presenter endpoints require existing authenticated user session and project write/read checks.
- Audience endpoints must never allow presenter-only data access.

### Python Worker

Add:

- `POST /qna/answer`

Request inputs:

- `projectId`
- `sessionId`
- `questionId`
- `questionText`
- current public slide context
- selected reference IDs
- retrieval limit and confidence threshold values configured by API

Response outputs:

- success: answer text, source references, confidence metadata
- fail: failure reason enum for presenter escalation

Worker requirements:

- Search selected references only.
- Include public deck content chunks.
- Exclude speaker notes, transcript, raw audio, presenter script.
- Return within the API 5-second timeout budget.

### Database Tables

Replace the current passcode-oriented `presentation_sessions` shape.

Core tables:

- `presentation_sessions`
  - `session_id`
  - `project_id`
  - `deck_id`
  - `presenter_user_id`
  - `join_code`
  - `status` enum: `draft`, `live`, `ended`
  - `entry_status` enum: `open`, `closed`
  - `audience_slide_render_mode` enum: `image-first`
  - `created_at`, `started_at`, `ended_at`
  - `survey_closes_at`
  - `raw_data_delete_after`
- `audience_participants`
  - `audience_id`
  - `session_id`
  - `nickname`
  - `token_hash`
  - `joined_at`
  - `last_seen_at`
  - `joined_before_end`
- `audience_feature_settings`
  - `session_id`
  - `qna_enabled`
  - `ai_qna_enabled`
  - `polls_enabled`
  - `quizzes_enabled`
  - `reactions_enabled`
  - `survey_enabled`
  - `updated_at`
- `audience_realtime_state`
  - `session_id`
  - `slide_id`
  - `slide_index`
  - `effect_state_json`
  - `active_interaction_id`
  - `updated_at`
- `audience_events`
  - `event_id`
  - `session_id`
  - `actor_type`
  - `actor_id`
  - `type`
  - `payload_json`
  - `occurred_at`
- `project_interaction_library`
  - prepared poll/quiz definitions owned by project
- `session_interactions`
  - copied prepared items plus ad hoc items owned by session
- `interaction_responses`
  - poll/quiz responses
- `audience_questions`
  - Q&A question groups and merged audience submissions
- `audience_question_answers`
  - AI answer and escalation metadata
- `session_survey_forms`
  - session-owned locked survey definition
- `session_survey_responses`
  - final submitted survey responses
- `audience_aggregate_reports`
  - anonymous aggregate retained after raw data deletion

Migration split policy:

- Milestone 1 creates only foundational tables:
  - `presentation_sessions`
  - `audience_participants`
  - `audience_feature_settings`
  - `audience_realtime_state`
  - `audience_events`
- Feature tables are added by the milestone that first uses them:
  - Milestone 5: `project_interaction_library`, `session_interactions`, `interaction_responses`
  - Milestone 6: `audience_questions`
  - Milestone 7: `audience_question_answers`; embedding merge metadata stays in `audience_questions`
  - Milestone 9: `session_survey_forms`, `session_survey_responses`
  - Milestone 10: `audience_aggregate_reports` and retention cleanup metadata

Required DB constraints:

- Active `join_code` uniqueness across non-expired active sessions.
- One active audience session per project.
- Unique `(session_id, nickname)` in `audience_participants`.
- Unique one survey response per `(session_id, audience_id)`.
- One active live interaction per session.
- Foreign keys cascade when project/session is deleted.

### WebSocket Events

Add event names for audience:

- `audience:join`
- `audience:state`
- `audience:slide-state`
- `audience:effect-state`
- `audience:feature-settings`
- `audience:interaction-active`
- `audience:interaction-results`
- `audience:question-updated`
- `audience:private-answer`
- `audience:reaction`
- `audience:session-ended`
- `audience:survey-opened`

Room policy:

- `presentation:{sessionId}:audience`
- `presentation:{sessionId}:presenter`
- `presentation:{sessionId}:audience:{audienceId}`

## Default Korean UI Copy

These strings are implementation defaults. Product/design can polish wording later, but developers should not leave copy undefined.

| Key                               | Default copy                                           |
| --------------------------------- | ------------------------------------------------------ |
| `join.code.label`                 | `입장 코드`                                            |
| `join.code.placeholder`           | `6자리 숫자`                                           |
| `join.nickname.label`             | `닉네임`                                               |
| `join.submit`                     | `입장하기`                                             |
| `join.error.notFound`             | `입장 코드를 확인해 주세요.`                           |
| `join.error.duplicateNickname`    | `이미 사용 중인 닉네임입니다.`                         |
| `join.error.closed`               | `현재 새 입장이 닫혀 있습니다.`                        |
| `join.error.rateLimited`          | `입장 시도가 많습니다. 잠시 후 다시 시도해 주세요.`    |
| `waiting.title`                   | `발표가 곧 시작됩니다.`                                |
| `waiting.body`                    | `발표자가 세션을 시작하면 자동으로 화면이 전환됩니다.` |
| `connection.reconnecting`         | `연결을 다시 시도하고 있습니다.`                       |
| `qna.input.placeholder`           | `궁금한 점을 입력해 주세요.`                           |
| `qna.submit`                      | `질문 보내기`                                          |
| `qna.error.rateLimited`           | `질문은 1분에 3개까지 보낼 수 있습니다.`               |
| `ai.answer.pending`               | `AI가 답변을 찾고 있습니다.`                           |
| `ai.answer.escalated`             | `발표자에게 질문을 전달했습니다.`                      |
| `ai.answer.unresolvedCta`         | `발표자에게 답변 요청`                                 |
| `interaction.closed`              | `응답이 마감되었습니다.`                               |
| `interaction.resultHidden`        | `결과는 발표자가 공개하면 표시됩니다.`                 |
| `reaction.rateLimited`            | `반응을 잠시 후 다시 보내 주세요.`                     |
| `survey.title`                    | `발표 설문`                                            |
| `survey.submit`                   | `설문 제출`                                            |
| `survey.submitted`                | `설문이 제출되었습니다.`                               |
| `survey.windowExpired`            | `설문 응답 시간이 종료되었습니다.`                     |
| `survey.contact.consent`          | `후속 연락을 위해 아래 정보를 제공하는 데 동의합니다.` |
| `survey.contact.sensitiveWarning` | `민감정보 또는 고유식별정보는 입력하지 마세요.`        |

## Milestones

### Milestone 1: Shared Contracts and Destructive Session Migration

**Background:** The current audience access model uses a 4-digit passcode and does not match the product plan. Developers need stable shared contracts before API, realtime, and web work can proceed.

**Required functionality:**

- Replace passcode schemas with join-code and nickname schemas.
- Add shared schemas for session, participant, feature settings, realtime state, interactions, questions, survey forms, survey responses, and audience events.
- Add audience-safe payload validation helpers.
- Add a destructive migration plan for the existing `presentation_sessions` table.
- Add foundational DB migrations only:
  - `presentation_sessions`
  - `audience_participants`
  - `audience_feature_settings`
  - `audience_realtime_state`
  - `audience_events`

**Acceptance criteria:**

- `packages/shared` exports all schemas needed by API and web.
- Audience-facing schemas have tests proving speaker notes, transcript, raw audio, presenter script, and file base64 are not representable in audience payloads.
- `presentation_sessions` no longer requires passcode/password hash fields.
- Migrations enforce join code uniqueness for active sessions and nickname uniqueness per session.
- Existing passcode API tests are replaced with join-code tests.
- Interaction, Q&A, survey, and aggregate-report tables are not created in this milestone unless required by a foundational foreign key.

**Verification:**

- `pnpm --filter @orbit/shared test`
- `pnpm --filter @orbit/api test`
- `pnpm db:migration:run`
- `pnpm db:migration:revert`

**Dependencies:** None.

**Likely files touched:**

- `packages/shared/src/presentation/presentation.schema.ts`
- `packages/shared/src/audience/*`
- `packages/shared/src/interactions/*`
- `packages/shared/src/realtime/websocket.schema.ts`
- `packages/shared/src/index.ts`
- `apps/api/src/database/migrations/*`
- `apps/api/src/presentation-sessions/*`

**Estimated scope:** Medium to Large.

### Milestone 2: Session Preparation, Join Code, QR, and Audience Join

**Background:** The first complete vertical slice is preparing a session, showing QR/code, joining by code/nickname, and restoring the same participant from a signed cookie.

**Required functionality:**

- Presenter creates or retrieves the one active draft/live session for a project.
- Server generates a 6-digit `joinCode` at draft preparation time.
- Editor setup UI shows `/join/:joinCode`, the 6-digit code, and QR code.
- Public `/join` route accepts manual code entry.
- `/join/:joinCode` route loads session public metadata.
- Audience enters a required nickname.
- Server issues signed `HttpOnly` cookie and creates `audience_participant`.
- Duplicate nickname returns a user-safe error.
- Pre-live audience sees waiting room.
- Presenter can close new entry without disconnecting existing participants.

**Acceptance criteria:**

- A presenter can prepare a session before going live and share a QR/code.
- Audience can join before live and sees a waiting state.
- Same browser refresh restores the same `audienceId` and nickname.
- Another participant cannot take the same nickname in the session.
- New join attempts fail after entry is closed, while existing participant `/me` still succeeds.
- Join attempts are limited to 10 per minute per IP plus joinCode.
- Join form controls have accessible labels, visible focus states, and error messages announced to screen readers.

**Verification:**

- API unit tests for prepare, join, duplicate nickname, rejoin, entry close.
- Web component tests for `/join`, `/join/:joinCode`, waiting room states.
- Manual mobile check with two browser sessions.

**Dependencies:** Milestone 1.

**Likely files touched:**

- `apps/api/src/presentation-sessions/*`
- `apps/web/src/features/audience/*`
- `apps/web/src/pages/audience/*`
- `apps/web/src/App.tsx`
- `apps/web/src/features/editor/audience-link/*`

**Estimated scope:** Medium.

### Milestone 3: Audience Realtime Gateway and Slide/Effect State

**Background:** Audience members must see the presenter screen state with low friction and recover after reconnect. This milestone establishes realtime infrastructure before adding feature interactions.

**Required functionality:**

- Add `AudienceRealtimeGateway`.
- Add session room, presenter room, private audience room helpers.
- Persist current realtime snapshot in `audience_realtime_state`.
- Keep gateway memory snapshot and DB fallback in sync.
- Presenter slide/effect changes update snapshot, append event, and broadcast to audience.
- Audience reconnect calls REST state endpoint and rejoins rooms.
- Generate/freeze audience slide image snapshots at session start.
- Audience uses image-first render with minimal overlay metadata.
- Deck JSON fallback is used when image snapshot is unavailable.

**Acceptance criteria:**

- Audience receives current slide and effect state after join.
- Audience receives slide/effect updates in real time.
- Reconnect restores current final effect state without replaying old animation history.
- Audience slide is visible within 2 seconds after join/reconnect on latest iOS Safari and Android Chrome test devices or emulation.
- No audience realtime payload includes speaker notes, transcript, raw audio, or presenter script.
- Audience slide and reconnect status are readable by assistive technology without relying only on color.

**Verification:**

- Gateway tests for room join and event authorization.
- API tests for snapshot state endpoint.
- Web tests for audience state recovery.
- Playwright smoke test with presenter and two audience clients.

**Dependencies:** Milestones 1-2.

**Likely files touched:**

- `apps/api/src/realtime/audience-realtime.gateway.ts`
- `apps/api/src/presentation-sessions/*`
- `packages/realtime/src/index.ts`
- `apps/web/src/features/audience/*`
- `apps/web/src/features/slides/rendering/*`
- `apps/web/src/features/rehearsal/presenter/*`

**Estimated scope:** Large.

### Milestone 4: Presenter Feature Controls and Session Interaction Selection

**Background:** All audience features start disabled. Presenters need setup controls before live and fast controls during presentation.

**Required functionality:**

- Editor setup surface for:
  - feature toggles
  - selected session interactions from project library
  - manual ordering of selected poll/quiz items
  - survey draft status
  - AI Q&A reference selection
- Presenter overlay panel for:
  - QR/code display
  - entry open/close
  - feature show/hide
  - current active interaction controls
  - Q&A queue summary
- Separate presenter control/results route for detailed configuration and results.
- Feature settings update API and realtime broadcast.
- Disabled features disappear from audience active-card UI.

**Acceptance criteria:**

- New sessions start with all audience features disabled.
- Presenter can enable/disable each feature while live.
- Disabled features are not visible in audience UI but submitted data remains stored.
- Selected prepared interactions are copied into the session at session start.
- Feature setting changes are reflected in audience clients without refresh.
- Presenter setup, overlay, and results controls are keyboard reachable and have accessible labels.

**Verification:**

- API tests for feature settings and session interaction selection.
- Web tests for editor setup and presenter overlay states.
- Playwright check for audience UI hiding/showing enabled features.

**Dependencies:** Milestones 1-3.

**Likely files touched:**

- `apps/api/src/presentation-sessions/*`
- `apps/web/src/features/editor/*`
- `apps/web/src/features/rehearsal/presenter/*`
- `apps/web/src/features/audience/*`

**Estimated scope:** Medium.

### Milestone 5: Project Interaction Library, Polls, and Quizzes

**Background:** Polls and quizzes share the interaction engine. Prepared interactions live in the project library, but live session copies are immutable after session start.

**Required functionality:**

- Project-level interaction library CRUD for poll/quiz definitions.
- DB migrations for `project_interaction_library`, `session_interactions`, and `interaction_responses`.
- Session interaction copy at start from explicitly selected, manually ordered project items.
- Ad hoc interaction creation during live session, stored only in the session.
- One active poll/quiz per session.
- Poll question types:
  - choice
  - 1-5 scale/rating
  - open text
  - ranking with maximum 5 options
- Quiz question types:
  - multiple choice
  - true/false
- Result visibility enum: `hidden`, `manual`, `after-close`, `live`.
- Quiz scoring enum: `none`, `correct-count`, `speed-bonus`.
- Poll responses editable until close.
- Quiz responses final after submit.
- Quiz answer reveal only after close.
- Live and post-close result aggregation.

**Acceptance criteria:**

- Presenter cannot activate a second poll/quiz while one is active.
- Audience can submit one current answer; poll answer can be changed before close, quiz answer cannot.
- Ranking rejects more than 5 options.
- Scale rejects values outside 1-5.
- Result visibility follows `hidden`, `manual`, `after-close`, and `live`.
- Presenter can view live and post-session aggregate results.
- Audience interaction forms expose required state, selected state, and validation errors accessibly.

**Verification:**

- Shared schema tests for all interaction question types.
- API tests for library CRUD, session copy, activation, response submit/edit, close, aggregation.
- Web tests for active card rendering and presenter controls.
- Playwright scenario for poll and quiz from activation through result display.

**Dependencies:** Milestones 1, 3, 4.

**Likely files touched:**

- `packages/shared/src/interactions/*`
- `apps/api/src/presentation-sessions/*`
- `apps/web/src/features/audience/*`
- `apps/web/src/features/editor/*`
- `apps/web/src/features/rehearsal/presenter/*`

**Estimated scope:** Large.

### Milestone 6: Q&A Without AI and Presenter Queue

**Background:** Q&A can run without AI. This milestone delivers the presenter-only question flow, queue, rate limits, and merge-ready data model before adding AI generation.

**Required functionality:**

- Feature toggle for non-AI Q&A.
- DB migration for `audience_questions`.
- Audience question submission from active-card UI.
- Question rate limit: 3 per minute per audience participant.
- Presenter queue with `pending` and `answered`.
- Verbal answer workflow: presenter marks question as answered.
- Store question events and query table rows.
- Embedding merge placeholders and question group model, without worker integration yet.
- Private REST endpoint for audience to view own question status.

**Acceptance criteria:**

- Other audience members cannot see submitted questions.
- Presenter can see pending questions and mark them answered.
- Answered questions disappear or move out of the pending queue.
- Rate limit returns a user-safe error.
- Post-session report data can identify unanswered questions.
- Q&A input, submit state, pending state, and answered state are accessible by keyboard and screen reader.

**Verification:**

- API tests for question submit, rate limit, queue, mark answered, private status.
- Web tests for audience Q&A active card and presenter queue.

**Dependencies:** Milestones 1, 3, 4.

**Likely files touched:**

- `apps/api/src/presentation-sessions/*`
- `packages/shared/src/interactions/*`
- `apps/web/src/features/audience/*`
- `apps/web/src/features/rehearsal/presenter/*`

**Estimated scope:** Medium.

### Milestone 7: AI Q&A, Reference Selection, and Embedding Merge

**Background:** AI Q&A must answer only from allowed public sources and escalate quickly when it cannot answer. This milestone connects the API to Python worker and implements embedding-based duplicate merge.

**Required functionality:**

- Session-level selected reference IDs for AI Q&A.
- DB migration for `audience_question_answers`; embedding merge metadata remains in `audience_questions`.
- Public deck content chunking for AI Q&A, excluding speaker notes/script.
- Python worker `/qna/answer` endpoint.
- API synchronous call to Python worker with 5-second timeout.
- Confidence/failure result mapped to automatic escalation.
- Asker-only AI answer via private WebSocket room and REST recovery.
- Resolved/unresolved feedback.
- Manual unresolved creates or updates presenter queue item.
- Embedding-based duplicate question merge.

**Acceptance criteria:**

- Enabling AI Q&A automatically enables Q&A; disabling Q&A also disables AI Q&A.
- In-flight AI requests that started before Q&A was disabled may complete and be stored, but they remain hidden from audience UI while Q&A is disabled.
- Python worker only searches selected session references and public deck content.
- AI answer is delivered only to the asking participant.
- Timeout or failed grounding creates a pending presenter queue item within 5 seconds.
- Unresolved feedback creates or updates a pending presenter queue item.
- Similar questions are automatically merged into a representative presenter queue item.
- Regression tests prove speaker notes/script/transcript/raw audio are excluded.
- AI pending, answer, unresolved, and escalated states use the default Korean copy keys and are announced accessibly.

**Verification:**

- Python tests for `/qna/answer` success/failure models.
- API tests with mocked worker for success, timeout, failure, private delivery.
- Embedding merge tests with deterministic fixtures.
- Web tests for AI answer, unresolved, and fallback states.

**Dependencies:** Milestones 1, 3, 4, 6.

**Likely files touched:**

- `services/python-worker/app/main.py`
- `services/python-worker/app/qna.py`
- `services/python-worker/tests/*`
- `apps/api/src/presentation-sessions/*`
- `packages/shared/src/interactions/*`
- `apps/web/src/features/audience/*`

**Estimated scope:** Large.

### Milestone 8: Reactions

**Background:** Reactions are lightweight live engagement. They should feel immediate but must not interfere with slide sync or active interaction submission.

**Required functionality:**

- Emoji reaction set.
- Presenter show/hide setting.
- Audience reaction button set in active-card area when enabled.
- Reaction rate limit: 5 per second per audience participant.
- Broadcast reactions to session room.
- Append reaction events and aggregate counts.
- Hide reactions entirely when disabled.

**Acceptance criteria:**

- When reactions are enabled, both presenter and audience see reaction animations/events.
- When reactions are disabled, audience cannot see or submit reactions.
- Rate limit prevents excessive events from one participant.
- Reaction bursts do not delay slide/effect updates.
- Raw reaction events are not included in survey CSV.
- Reaction controls have accessible names and do not rely on animation alone to indicate submission.

**Verification:**

- API tests for reaction submit and rate limit.
- Gateway tests for broadcast behavior.
- Web tests for enabled/disabled UI.
- Lightweight load test or synthetic test for reaction burst plus slide update.

**Dependencies:** Milestones 1, 3, 4.

**Likely files touched:**

- `apps/api/src/presentation-sessions/*`
- `apps/api/src/realtime/audience-realtime.gateway.ts`
- `apps/web/src/features/audience/*`
- `apps/web/src/features/rehearsal/presenter/*`

**Estimated scope:** Small to Medium.

### Milestone 9: Session-Owned Survey, Contact Section, and CSV Export

**Background:** Survey is shown after session end and is session-owned. Contact collection is part of the survey but must remain optional for audience members.

**Required functionality:**

- Session survey form CRUD while session is `draft`.
- DB migrations for `session_survey_forms` and `session_survey_responses`.
- Survey edit lock at session start.
- Survey enabled/disabled feature setting.
- Automatic audience transition to survey when session ends.
- Survey submission window: 1 hour after end.
- Eligibility check: joined before session end.
- Reconnect within submission window for eligible participants.
- Required/optional question handling per survey question.
- No partial response persistence.
- No response edits after submit.
- Dedicated contact consent section.
- Contact section uses survey field/question types.
- Audience can submit survey without contact consent.
- Contact custom field validation forbids unique identifying and sensitive information categories.
- CSV export includes timestamp, nickname, survey answers, and contact fields.

**Acceptance criteria:**

- Survey form cannot be changed after session start.
- Ineligible audience tokens cannot submit survey.
- Eligible reconnecting participant can submit within 1 hour after session end.
- Second submission by same audience participant is rejected.
- Required questions block submission when missing.
- If contact consent is false and contact field values are submitted, the server rejects the submission with a validation error.
- CSV contains survey data only and includes nickname.
- Survey controls, contact consent, required errors, and sensitive-information warnings are accessible.

**Verification:**

- Shared schema tests for survey/contact forms and responses.
- API tests for edit lock, eligibility, submission window, duplicate submit, CSV.
- Web tests for survey auto transition and reconnect submission.
- Manual CSV inspection with sample data.

**Dependencies:** Milestones 1, 2, 3, 4.

**Likely files touched:**

- `packages/shared/src/interactions/*`
- `apps/api/src/presentation-sessions/*`
- `apps/web/src/features/audience/*`
- `apps/web/src/features/editor/*`
- `apps/web/src/features/rehearsal/presenter/*`

**Estimated scope:** Large.

### Milestone 10: Presenter Results, Aggregate Reports, and Retention Cleanup

**Background:** Presenters need live and post-session results, while raw audience data must be removed after 30 days and anonymous aggregates retained.

**Required functionality:**

- Live presenter result views:
  - active poll/quiz results
  - Q&A queue
  - reaction counts
- Post-session result view:
  - Q&A summary and unanswered questions
  - poll/quiz aggregates
  - reaction aggregates
  - survey aggregate and individual survey responses
  - CSV export link
- Aggregate report generation:
  - create a preliminary aggregate report immediately when the session ends
  - update it to the final aggregate report when the 1-hour survey window closes
- DB migration for `audience_aggregate_reports` and retention cleanup metadata.
- Retention cleanup job:
  - after `raw_data_delete_after`
  - delete individual raw events/responses/contact data
  - retain anonymous aggregate report
- Presenter authorization for all result endpoints.

**Acceptance criteria:**

- Presenter can view live results during a session.
- Presenter can view post-session results after end.
- Audience cannot access presenter result endpoints.
- Survey CSV returns `410 Gone` after raw data deletion, while the anonymous aggregate remains available.
- Cleanup deletes raw data after 30 days without deleting aggregate report.
- Result tables/charts have accessible text labels or summaries.

**Verification:**

- API tests for result authorization, aggregation, CSV, cleanup.
- Web tests for result screen states.
- Time-travel/unit tests for retention cleanup.

**Dependencies:** Milestones 5-9.

**Likely files touched:**

- `apps/api/src/presentation-sessions/*`
- `apps/api/src/jobs/*`
- `apps/web/src/features/rehearsal/presenter/*`
- `apps/web/src/features/editor/*`

**Estimated scope:** Medium.

### Milestone 11: End-to-End Hardening and Release Readiness

**Background:** The feature crosses shared contracts, DB, API, realtime, Python worker, and mobile web. A final hardening PR should verify the entire flow and close contract gaps.

**Required functionality:**

- Playwright E2E:
  - presenter prepares session
  - audience joins by `/join/:joinCode`
  - second audience duplicate nickname is rejected
  - presenter starts live session
  - slide/effect sync updates audience
  - Q&A and AI fallback path
  - poll response and quiz response
  - reactions
  - presenter ends session
  - eligible audience submits survey
  - presenter views results and CSV
- Mobile viewport checks for latest iOS/Android browser dimensions.
- Performance check for 2-second current slide display.
- Security regression checks for presenter-only fields.
- Documentation updates.

**Acceptance criteria:**

- Full E2E passes locally.
- `pnpm build`, `pnpm lint`, `pnpm test`, and `docker compose config` pass.
- Python worker tests pass.
- No audience endpoint or WebSocket payload exposes speaker notes, raw transcript, raw audio, presenter script, API keys, cookies, password, or file base64.
- Implementation docs and product plan links are up to date.
- Basic accessibility checks pass for join, audience active card, presenter overlay, survey, and results screens.

**Verification:**

- `pnpm build`
- `pnpm lint`
- `pnpm test`
- `pnpm test:smoke`
- `docker compose config`
- `cd services/python-worker && uv run pytest`

**Dependencies:** Milestones 1-10.

**Likely files touched:**

- `docs/contracts.md`
- `docs/plans/audience-engagement-product-plan.md`
- `docs/testing/*`
- E2E test files

**Estimated scope:** Medium.

## Cross-Milestone Acceptance Criteria

- Audience never logs in.
- Audience identity is session-scoped and nickname-only.
- Presenter auth and project permission checks protect all presenter endpoints.
- Audience token cannot call presenter endpoints.
- All audience-facing API and realtime payloads are schema-validated.
- Session-owned raw audience data is deleted after 30 days, with anonymous aggregates retained.
- All new server logs avoid API keys, tokens, cookies, passwords, raw audio, transcript, presenter script, and file base64.
- Every milestone leaves the repo buildable and testable.
- Every audience and presenter UI milestone includes labels, focus states, keyboard operation, and contrast checks for new controls.

## Suggested Parallelization

- Milestone 1 must happen first.
- Milestones 2 and parts of 4 can proceed after shared contracts stabilize.
- Milestone 3 should land before live interactions, Q&A, and reactions.
- Milestones 5, 6, 8, and 9 can be developed in parallel after Milestones 3-4 if they do not modify the same shared schema files without coordination.
- Milestone 7 depends on Milestone 6 and Python worker contract work.
- Milestone 10 depends on feature data from Milestones 5-9.
- Milestone 11 must be last.

## Non-Blocking Follow-Ups

- Final Korea-first privacy/legal review of contact consent text before broad release.
- Load test beyond the initial 100 concurrent audience target.

## Open Questions

None. This plan reflects the product and implementation decisions confirmed for this planning round.
