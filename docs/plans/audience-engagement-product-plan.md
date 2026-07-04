# Audience Engagement Product Plan

## Status

- Status: Approved
- Created: 2026-07-05
- Scope: Audience mobile entry, live slide sync, AI Q&A, live interactions, reactions, post-session survey, presenter results
- Research sources:
  - Slido product overview: https://www.slido.com/product
  - Mentimeter homepage and feature navigation: https://www.mentimeter.com/
  - Poll Everywhere product overview: https://www.polleverywhere.com/
  - Intercom Fin AI Agent overview: https://www.intercom.com/help/en/articles/7120684-fin-ai-agent-explained
  - Korea Personal Information Protection Commission: https://www.pipc.go.kr/eng/

## Goal

Build an audience engagement experience where audience members join a live presentation from a smartphone browser without logging in, identify themselves only with a nickname, follow the current slide and highlight state in real time, ask AI-assisted questions, participate in presenter-enabled interactions, and submit a post-session survey when enabled.

The product should keep audience entry friction low while preserving presenter control, session-scoped privacy, and analyzable event data for live and post-session results.

## Confirmed Product Decisions

### Entry and Session

- Audience entry model: 6-digit join code plus required nickname.
- QR code: opens the target presentation session directly.
- Public mobile homepage: allows entering the 6-digit code when QR scanning is unavailable.
- Audience login: not used.
- Audience nickname: required.
- Nickname uniqueness: duplicate nicknames are not allowed within a session.
- Nickname release: a nickname remains reserved until the session ends.
- Rejoin behavior: same browser should restore the audience token automatically.
- Session lifecycle: every presentation session gets a new join code.
- Code rotation: changing the code requires ending the current session and starting a new one.
- Presenter can close new entry during a session; existing audience members remain connected.
- QR/code display surfaces: both editor setup and presenter mode.
- Initial target scale: up to 100 concurrent audience members.
- Supported audience browsers: latest iOS Safari and Android Chrome, with graceful handling for connection loss.
- Realtime recovery: automatic reconnection and state refresh.

### Audience Mobile Screen

- Current slide stays visible at the top of the audience screen.
- Realtime sync scope: current slide and highlight/effect state only.
- Presenter pointer, progress, and remaining-time sync are out of current scope.
- Disabled features are completely hidden from the audience UI.

### Feature Availability

- Default state at session start: all participation features are off.
- Presenter can enable or disable features during the presentation.
- Feature authoring:
  - Polls and quizzes can be prepared before the session.
  - Presenter can also create ad hoc polls/quizzes during the session.
- Active live interaction limit: one active poll or quiz at a time.
- When a feature is disabled, already submitted data is preserved but hidden from the audience screen.

### AI Q&A

- AI grounding sources: public deck content and presenter-approved reference materials only.
- Speaker notes, raw transcript, raw audio, and presenter script are not audience-facing data sources.
- Chat depth: one question, one AI answer.
- AI answer visibility: only the asker sees the AI answer.
- AI answer feedback: asker can mark resolved or unresolved.
- Escalation to presenter:
  - Automatic when AI cannot answer with enough confidence, times out, or fails.
  - Manual when the audience member requests presenter help after an AI answer.
- Presenter answer mode: verbal answer only; presenter marks the question as answered.
- Post-session unanswered questions: included in presenter report only.
- Audience question list: not visible to other audience members.
- Question upvotes: not supported.
- Duplicate questions: automatically merged.
- Presenter queue statuses: `pending`, `answered`.

### Live Polls and Quizzes

- Shared poll/survey question types:
  - choice
  - scale/rating
  - open text
  - ranking
- Quiz question types:
  - multiple choice
  - true/false
- Quiz scoring: configurable per quiz.
- Poll/quiz result visibility: configured per question.
- Audience can see results only during the live session when the presenter exposes them.
- Presenter can view results during the session and after the session.

### Reactions

- Reaction types: emoji set, not just a single heart.
- Reaction visibility: when enabled, reactions are visible to both audience and presenter.
- Presenter setting: show/hide reactions.
- Reaction rate limit: loose throttling to preserve live feel.
- Reaction event data is saved for aggregate reporting, but not included in CSV export in the current scope.

### Post-Session Survey

- Survey is optional and presenter-enabled.
- Survey form edit deadline: before session start.
- Survey trigger: when presenter ends the session, connected audience members are automatically moved to the survey.
- Survey eligibility: only audience members who joined before session end can respond.
- Survey response edit: not allowed after submission.
- Partial survey responses: not saved.
- Survey result scope for presenter: aggregate plus individual responses.
- CSV export: survey data only.
- Audience cannot revisit results after the session.

### Contact Collection

- Contact collection is a dedicated consent section inside the post-session survey.
- Privacy baseline: Korea-first.
- Consent text: system template plus presenter edits.
- Contact fields: presenter-configurable custom fields.
- Required contact fields: presenter-configurable.
- Sensitive or uniquely identifying information must be explicitly forbidden in custom fields.
- Consent record: stores consent yes/no only.
- Default retention period: 30 days.
- Legal note: final consent copy, retention wording, and audit requirements need privacy/legal review before launch.

## Research Takeaways

- Slido groups the category around live polls, Q&A, quizzes, surveys, analytics, and exports. Its product page highlights multiple poll types, Q&A upvotes, quiz leaderboard patterns, surveys before/during/after meetings, analytics, moderation, privacy settings, and export formats.
- Mentimeter makes code-based entry prominent and treats real-time questions, quizzes, Q&A, survey, word cloud, and AI-assisted creation as one presentation engagement surface.
- Poll Everywhere emphasizes a presenter flow of create, engage in real time from audience devices, and analyze results. It also separates poll types such as bar charts, competitions, Likert scale, Q&A, and open-ended visualizations.
- Intercom Fin is useful for the AI Q&A pattern: answer from controlled sources, test answer quality, inspect sources, escalate to humans when needed, and measure performance.

These references support ORBIT's direction of using code/QR entry, browser-based participation, presenter-controlled live interactions, post-session analytics, and AI answers with human escalation.

## Existing ORBIT Documents and Required Alignment

Current repository state has partially overlapping but inconsistent concepts:

- `docs/plans/audience-mobile-access.md` currently describes QR/link entry with a 4-digit passcode and room choice.
- `docs/specs/presentation-flow-w3-live-session-audience.md` describes `/a/:joinCode`, anonymous token entry, live slide sync, Q&A, polls, quizzes, and event logging.
- `docs/specs/presentation-flow-w4-ai-qna.md` already proposes grounded-or-escalate AI Q&A, but needs to align with one-question-one-answer and asker-only answer visibility.
- `docs/specs/presentation-flow-w5-survey.md` proposes survey reuse of the poll question engine and must align with start-before edit lock, automatic end-session transition, contact consent section, and survey-only CSV export.
- `packages/shared/src/presentation/presentation.schema.ts` and current API code still use a 4-digit passcode access session model. This must change to join-code plus nickname.

Planning conclusion: the existing passcode model should be replaced for this feature set. If a passcode is still wanted later, it should be a separate presenter option, not the default audience entry model.

## Product Architecture Plan

### 1. Common Contract First

Define shared schemas before UI/API implementation:

- `PresentationSession`: session lifecycle, join code, entry state, feature toggles.
- `AudienceParticipant`: session-scoped audience token, nickname, join time, reconnect metadata.
- `AudienceFeatureSettings`: Q&A, AI Q&A, polls, quizzes, reactions, survey.
- `AudienceRealtimeState`: current slide, active highlight state, active interaction, session status.
- `AudienceEvent`: append-only event log for join, slide/highlight changes, questions, AI outcomes, poll/quiz responses, reactions, survey submissions.
- `InteractionQuestion`: shared question model for poll, quiz, and survey.
- `SurveyForm`, `SurveyConsentSection`, `SurveyResponse`.

Acceptance criteria:

- Shared schemas reject speaker notes, raw transcript, raw audio, presenter script, and file base64 in audience-facing payloads.
- All audience events have `sessionId`, `audienceId` or system/presenter actor, `type`, `payload`, and `occurredAt`.
- Join code and nickname validation are schema-level contracts.

### 2. Entry and Participant Slice

Build the complete path from QR/code to session-scoped audience identity:

- Presenter creates a live session and receives a 6-digit join code plus QR URL.
- Audience scans QR or enters code on public mobile homepage.
- Audience enters required unique nickname.
- Server issues a session-scoped audience token.
- Same browser can rejoin automatically.
- Presenter can close new entry while preserving existing participants.

Acceptance criteria:

- No audience login is required.
- Duplicate nickname in the same session is blocked.
- Ended sessions reject new joins.
- Existing participants remain connected when new entry is closed.

### 3. Live Slide Sync Slice

Deliver the core audience screen:

- Current slide remains fixed at the top of the mobile screen.
- Slide changes and highlight state updates are pushed in real time.
- On reconnect, the client fetches the latest state snapshot.

Acceptance criteria:

- Audience sees the same slide and highlight state as the presenter.
- Presenter pointer and progress data are not included.
- Audience payload does not include speaker notes or script fields.

### 4. Presenter Feature Controls Slice

Add presenter setup and live controls:

- Editor setup controls for feature defaults, prepared polls/quizzes, and survey setup.
- Presenter mode panel for QR/code display, feature show/hide, ad hoc poll/quiz creation, and live result view.
- Disabled features disappear from the audience screen.

Acceptance criteria:

- All participation features start disabled.
- Only one live poll/quiz can be active at a time.
- Disabling a feature hides it from audience UI without deleting submitted data.

### 5. AI Q&A Slice

Implement private AI Q&A with presenter escalation:

- Audience asks one question.
- AI answers using only public deck content and approved references.
- AI answer is visible only to the asker.
- Resolved/unresolved feedback is captured.
- AI failures, timeouts, and manual unresolved requests become presenter queue items.
- Presenter marks verbally answered questions as answered.
- Similar questions are automatically merged.

Acceptance criteria:

- No global-knowledge answer is sent when grounding is weak.
- Presenter queue has only `pending` and `answered` states.
- Other audience members cannot see Q&A questions or AI answers.
- Post-session report includes unanswered questions.

### 6. Poll and Quiz Slice

Implement one active interaction at a time:

- Poll types: choice, scale/rating, open text, ranking.
- Quiz types: multiple choice and true/false.
- Quiz scoring is configurable per quiz.
- Result visibility is configurable per question.
- Presenter sees live and post-session results.

Acceptance criteria:

- Audience can submit at most one response per active question unless the question explicitly allows changes.
- Result display follows the question visibility setting.
- A second poll/quiz cannot be activated until the current one is closed.

### 7. Reaction Slice

Implement lightweight live reactions:

- Emoji set reactions.
- Presenter show/hide control.
- When shown, reactions appear for both audience and presenter.
- Loose per-participant rate limit.

Acceptance criteria:

- Reaction bursts do not block slide sync or active interaction submission.
- Reaction counts are saved for aggregate reporting.
- Reaction event raw data is not exported in the survey CSV.

### 8. Survey and Contact Slice

Implement post-session survey:

- Survey form is editable only before session start.
- Survey auto-opens for connected participants when the session ends.
- Only pre-end participants can submit.
- Submitted survey cannot be edited.
- Partial responses are not saved.
- Contact collection has a dedicated consent section.
- Contact fields are custom but must block explicitly forbidden sensitive/unique ID fields.
- CSV export contains survey responses only.

Acceptance criteria:

- Survey form cannot change after session start.
- Token without pre-end participation cannot submit.
- Consent yes/no is stored with the response.
- Default retention is 30 days.

### 9. Results and Reporting Slice

Build presenter-facing result views:

- Live results for active poll/quiz and Q&A queue.
- Post-session report for Q&A, poll, quiz, reaction aggregates, survey aggregate and individual survey responses.
- CSV export for survey data.

Acceptance criteria:

- Presenter can inspect individual survey responses.
- Audience cannot access post-session result pages.
- CSV export excludes Q&A, poll, quiz, and reaction raw data in the current scope.

## Implementation Order

1. Contract update: shared presentation, realtime, audience, interaction, survey schemas.
2. Database/event log design: sessions, participants, feature settings, events, interactions, survey forms/responses.
3. Entry flow: join code, QR URL, nickname, token, rejoin, entry close.
4. Audience shell: current slide fixed top, realtime snapshot/reconnect.
5. Presenter controls: setup + presenter mode panel.
6. AI Q&A: grounded answer, private display, escalation, queue, merge.
7. Poll/quiz engine: one active item, response handling, visibility, results.
8. Reactions: emoji event stream and throttling.
9. Survey: locked form, end-session auto transition, contact consent, CSV.
10. Reports: live and post-session presenter views.

## Verification Plan

- Contract tests:
  - Audience payload schemas reject presenter-only fields.
  - Join code, nickname, feature settings, question, survey, and event schemas parse expected payloads.
- API tests:
  - Join by code and nickname.
  - Duplicate nickname rejection.
  - Rejoin with existing token.
  - Entry close preserves existing participants.
  - Ended session blocks new joins and accepts survey only from pre-end participants.
- Realtime tests:
  - Slide and highlight sync to multiple audience clients.
  - Reconnect refreshes latest state.
  - Reaction bursts do not delay slide updates.
- AI Q&A tests:
  - Grounded answer succeeds with allowed sources.
  - Weak grounding, timeout, and failure escalate to presenter.
  - AI answers are visible only to the asker.
  - Speaker notes/script are not exposed.
- Poll/quiz tests:
  - Only one active item at a time.
  - Visibility settings control audience result display.
  - Configurable quiz scoring works.
- Survey tests:
  - Form lock after session start.
  - Auto transition on end.
  - No partial response persistence.
  - Survey-only CSV export.
- E2E tests:
  - Presenter starts session, audience joins by QR/code, sees slide sync, uses Q&A, responds to poll/quiz/reaction, completes survey, presenter views results.

## Open Questions

None for the current product planning scope.

Remaining non-product review items:

- Privacy/legal review of Korea-first contact consent copy and whether storing only consent yes/no is sufficient for launch.
- Visual design details for the audience mobile screen and presenter mode panel.
