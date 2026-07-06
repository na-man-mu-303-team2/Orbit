# Implementation Plan: Google Slides-Style Presentation Display

## Objective

Implement the presentation display model described in `docs/spikes/google-slides-presentation-display-analysis.md`: the audience-facing slide surface and the presenter control surface are separate roles, synchronized by a session-scoped channel, with fullscreen and multi-display behavior treated as best-effort browser capabilities with clear fallback UI.

The target v1 flow is:

```text
User clicks "슬라이드 창 열기"
current rehearsal window -> slide-receiver
new popup/window          -> presenter
BroadcastChannel          -> state sync by { deckId, sessionId }
```

## Scope

Primary code area:

- `apps/web/src/features/rehearsal`
- `apps/web/src/features/rehearsal/presenter`
- `apps/web/src/App.tsx`
- `apps/web/src/styles.css`

Out of scope:

- API, Worker, Python worker, DB, and shared schema changes.
- Live STT engine changes.
- Audience mobile session features.
- Treating `sessionId` as an auth token or secret.

## Architecture Decisions

- Use explicit window roles: `presenter`, `slide-receiver`, and existing `single-screen`.
- The presenter role is the only state owner and mutation surface for slide/step/highlight state.
- The slide receiver is receive-only. It sends only ready/heartbeat-style lifecycle messages.
- Use `BroadcastChannel` scoped by `{deckId, sessionId}`. Do not rely on `window.opener` or cross-window DOM access for presentation state.
- Send sanitized deck snapshots only. Slide receiver payloads must not include speaker notes, transcript text, raw audio references, run meta, checklist state, or presenter-only markers.
- Fullscreen, `window.open`, `moveTo`, `resizeTo`, and Window Management API calls are best-effort. A blocked or unsupported path must keep the presentation usable with a manual CTA.
- The default display flow follows Google Slides presenter view: current window becomes the audience slide surface and a new popup becomes the presenter surface.

## Task Breakdown

### 1. Formalize Rehearsal Display Roles and Route Bootstrap

Add a stable route contract for presenter popups and display role selection inside `RehearsalWorkspace`.

Implementation:

- Extend the rehearsal route parser to read:
  - `presenterSessionId`
  - `presenterWindow=1`
  - optional `slideIndex`
  - optional `stepIndex`
- Add `getRehearsalPresenterWindowPath(projectId, sessionId, state)` for popup bootstrap URLs.
- Add `displayRole: "presenter" | "slide-receiver"` state in `RehearsalWorkspace`.
- Initialize presenter popup state from `slideIndex` and `stepIndex` when present.
- Keep normal rehearsal route behavior unchanged when query params are absent.

Acceptance criteria:

- `/rehearsal/:projectId` still opens normal presenter mode.
- `/rehearsal/:projectId?presenterSessionId=...&presenterWindow=1&slideIndex=2&stepIndex=1` opens presenter mode with the supplied session and initial state.
- Invalid or negative `slideIndex`/`stepIndex` are ignored.

Verification:

- `pnpm --filter @orbit/web test -- App`
- `pnpm --filter @orbit/web test -- RehearsalWorkspace`

Files likely touched:

- `apps/web/src/App.tsx`
- `apps/web/src/App.test.tsx`
- `apps/web/src/features/rehearsal/RehearsalWorkspace.tsx`
- `apps/web/src/features/rehearsal/RehearsalWorkspace.test.tsx`

Estimated scope: Medium

### 2. Make Slide Receiver a Reusable Receive-Only Surface

Refactor the existing `/present/:deckId` rendering path so the current rehearsal window can reuse the same slide-only receiver component.

Implementation:

- Extract or expose a `PresentWindowReceiver` component that accepts:
  - `identity`
  - optional `initialSnapshot`
  - optional fullscreen fallback message
  - optional exit callback
- Keep `/present/:deckId?sessionId=...` using the same receiver.
- Keep the receiver waiting state for missing snapshots.
- Render only `SlideshowRenderer` and receiver-safe fallback actions.
- Keep fullscreen requests inside the receiver document and tied to explicit user actions when automatic fullscreen fails.

Acceptance criteria:

- A receiver with `initialSnapshot` renders immediately without waiting for a channel message.
- A receiver without a snapshot waits for `presenter-snapshot`.
- `presenter-state` updates change slide/step without mutating local presenter state.
- Receiver DOM and snapshot payloads do not contain `speakerNotes`, transcript text, raw audio references, run meta, or presenter-only UI.

Verification:

- `pnpm --filter @orbit/web test -- PresentWindow`
- Privacy fixture test with known speaker notes and transcript marker strings.

Files likely touched:

- `apps/web/src/features/rehearsal/presenter/PresentWindow.tsx`
- `apps/web/src/features/rehearsal/presenter/PresentWindow.test.tsx`
- `apps/web/src/features/rehearsal/presenter/presentationChannel.ts`
- `apps/web/src/styles.css`

Estimated scope: Medium

### 3. Enforce Presenter-Only State Ownership

Ensure only the presenter popup publishes state and handles slide navigation after the current window becomes a slide receiver.

Implementation:

- Add `sessionId` override support to `usePresentationChannelPublisher`.
- Add `enabled` support so the current window can stop publishing after switching to `slide-receiver`.
- Disable presenter keyboard navigation and presenter-only controls while `displayRole === "slide-receiver"`.
- Keep STT, recorder, timer controls, speaker notes, transcript, and checklist mounted only in presenter role.
- Preserve current slide and step when switching roles.

Acceptance criteria:

- The popup presenter publishes `presenter-snapshot` and `presenter-state` using the same `sessionId` as the receiver.
- The slide receiver does not publish presenter state.
- Keyboard next/previous handlers do not mutate state in slide-receiver mode.
- Switching back from receiver mode restores normal presenter UI without resetting slide/step state.

Verification:

- `pnpm --filter @orbit/web test -- usePresentationChannelPublisher`
- `pnpm --filter @orbit/web test -- RehearsalWorkspace`
- Manual two-window smoke test: advance from popup, observe current window update.

Files likely touched:

- `apps/web/src/features/rehearsal/presenter/usePresentationChannelPublisher.ts`
- `apps/web/src/features/rehearsal/presenter/usePresentationChannelPublisher.test.ts`
- `apps/web/src/features/rehearsal/RehearsalWorkspace.tsx`
- `apps/web/src/features/rehearsal/RehearsalWorkspace.test.tsx`

Estimated scope: Medium

### 4. Replace Display Control Flow with Presenter Popup Flow

Update `슬라이드 창 열기` so it performs the Google Slides-style role transition instead of opening a separate slide preview window.

Implementation:

- In the click handler, synchronously attempt:
  - `window.open(getRehearsalPresenterWindowPath(...))`
  - `setDisplayRole("slide-receiver")`
  - `requestFullscreen()` on the current document as best effort
- Pass the current `{slideIndex, stepIndex}` into the presenter popup URL.
- If popup opening fails, keep the current window in receiver mode with a visible recovery message and an exit button.
- If fullscreen fails, show a receiver-side `전체화면` CTA.
- Keep the button label stable for now as `슬라이드 창 열기`, but update status copy to say a presenter window is being opened.

Acceptance criteria:

- One click opens a presenter popup and converts the current window to slide receiver mode.
- The current window renders a sanitized slide surface, not the presenter workspace.
- The popup opens the same rehearsal project with matching `presenterSessionId`.
- Popup-blocked and fullscreen-blocked states show actionable copy.
- The flow does not require Window Management API support.

Verification:

- `pnpm --filter @orbit/web test -- DisplayControls`
- `pnpm --filter @orbit/web test -- RehearsalWorkspace`
- Manual browser smoke test on Chrome:
  - click `슬라이드 창 열기`
  - current window becomes slide receiver
  - popup shows presenter controls
  - popup next/previous updates current window

Files likely touched:

- `apps/web/src/features/rehearsal/presenter/DisplayControls.tsx`
- `apps/web/src/features/rehearsal/presenter/DisplayControls.test.tsx`
- `apps/web/src/features/rehearsal/RehearsalWorkspace.tsx`
- `apps/web/src/styles.css`

Estimated scope: Medium

### 5. Add First-Class Manual Display Placement Fallback

Make display placement guidance explicit rather than treating it only as an error message.

Implementation:

- Add receiver-side copy for:
  - fullscreen blocked
  - popup blocked
  - user needs to move current window to the presentation display
- Add presenter-side copy for:
  - receiver connected
  - receiver stale
  - receiver closed or not responding
- Keep `DisplayManager` available for future optional screen discovery, but do not make Window Management API required for this flow.
- If Window Management support is reintroduced, use it only as progressive enhancement and preserve the current-window receiver fallback.

Acceptance criteria:

- Users can recover without developer console or hidden browser actions.
- Unsupported browsers still have a usable current-window receiver path.
- Copy distinguishes popup failure from fullscreen failure.
- No sensitive presentation content appears in fallback messages.

Verification:

- `pnpm --filter @orbit/web test -- DisplayControls`
- Manual popup-blocked check.
- Manual fullscreen-blocked check by using browser/permission conditions where available.

Files likely touched:

- `apps/web/src/features/rehearsal/presenter/DisplayControls.tsx`
- `apps/web/src/features/rehearsal/presenter/PresentWindow.tsx`
- `apps/web/src/styles.css`

Estimated scope: Small

### 6. Harden Heartbeat, Reopen, and Reload Recovery

Make the two-window flow resilient when either browsing context reloads or closes.

Implementation:

- Keep `slide-window-ready` and `slide-window-heartbeat` from the receiver.
- Keep `presenter-heartbeat` from the presenter.
- Mark peer stale after the existing heartbeat timeout without resetting presenter state.
- On receiver reload, send ready again and receive the latest full snapshot.
- Add a recover action that reopens the presenter popup or receiver path using the same `sessionId`, depending on current role.
- Avoid using `window.opener` for state recovery.

Acceptance criteria:

- Receiver reload restores the current slide/step from a full snapshot.
- Closing the presenter popup leaves the receiver with actionable recovery/exit UI.
- Closing or staling the receiver shows a recoverable presenter warning.
- Reopen preserves current slide/step.

Verification:

- `pnpm --filter @orbit/web test -- PresentWindow`
- `pnpm --filter @orbit/web test -- usePresentationChannelPublisher`
- `pnpm --filter @orbit/web test -- RehearsalWorkspace`
- Manual close/reload smoke test.

Files likely touched:

- `apps/web/src/features/rehearsal/presenter/presentationChannel.ts`
- `apps/web/src/features/rehearsal/presenter/usePresentationChannelPublisher.ts`
- `apps/web/src/features/rehearsal/presenter/PresentWindow.tsx`
- `apps/web/src/features/rehearsal/RehearsalWorkspace.tsx`

Estimated scope: Medium

### 7. Add Browser E2E Coverage for the Display Contract

Cover the role split and sync behavior in a real browser test so this does not regress.

Implementation:

- Add or update `tests/e2e/presenter-screen.spec.ts`.
- Use a deterministic demo deck or mocked API state.
- Open rehearsal presenter mode.
- Click `슬라이드 창 열기`.
- Assert:
  - current page switches to receiver UI
  - popup URL contains `presenterSessionId`
  - popup contains presenter controls
  - receiver does not contain speaker notes or transcript marker strings
  - advancing from popup updates receiver slide/step
- Add a fallback assertion for blocked fullscreen: visible CTA is enough.

Acceptance criteria:

- E2E test proves the two-window role split.
- E2E test proves state sync from popup presenter to current-window receiver.
- E2E test proves privacy boundary in receiver DOM.

Verification:

- `pnpm test:smoke -- tests/e2e/presenter-screen.spec.ts`

Files likely touched:

- `tests/e2e/presenter-screen.spec.ts`
- `tests/e2e` fixtures or helpers if needed

Estimated scope: Medium

## Checkpoints

### Checkpoint A: Role Split Works

- [ ] Route query parsing supports presenter popup bootstrap.
- [ ] Current window can render `slide-receiver` from an initial sanitized snapshot.
- [ ] Presenter popup owns state publishing.
- [ ] Unit tests for `App`, `PresentWindow`, `usePresentationChannelPublisher`, and `RehearsalWorkspace` pass.

### Checkpoint B: User Flow Works

- [ ] `슬라이드 창 열기` opens a presenter popup.
- [ ] Current window switches to slide receiver mode.
- [ ] Popup navigation changes receiver slide/step.
- [ ] Popup/fullscreen blocked paths are recoverable.

### Checkpoint C: Merge Gate

- [ ] `pnpm --filter @orbit/web test -- App PresentWindow DisplayControls usePresentationChannelPublisher RehearsalWorkspace`
- [ ] `pnpm --filter @orbit/web typecheck`
- [ ] `pnpm test:smoke -- tests/e2e/presenter-screen.spec.ts` or explicit note explaining why browser smoke was deferred.
- [ ] Manual Chrome smoke notes include popup opened, receiver rendered, sync verified, and privacy strings absent.

## Risks and Mitigations

| Risk | Impact | Mitigation |
| --- | --- | --- |
| Browser blocks popup or fullscreen | High | Keep fallback UI and receiver-side fullscreen CTA. |
| Presenter popup and receiver both mutate state | High | Disable publisher and keyboard handlers in `slide-receiver` role. |
| Sensitive presenter data leaks to receiver | High | Keep sanitized snapshot tests and DOM privacy assertions. |
| Current window and popup overlap on the same monitor | Medium | Add explicit manual placement guidance; treat Window Management API as optional future enhancement. |
| BroadcastChannel unavailable | Medium | Keep single-screen fallback and show unsupported guidance; do not silently fail. |
| API-dependent manual verification fails locally | Medium | Use deterministic demo fixtures or mocked API state in browser tests. |

## Open Questions

- Should ORBIT later expose a Google Slides-like display options modal with `발표자 보기`, `첫 슬라이드부터 표시`, `전체화면`, and target display selection?
- Should the default button text remain `슬라이드 창 열기`, or should it become `발표자 보기 시작` to better describe the new role split?
- For physical multi-monitor demos, is the preferred flow current-window receiver plus presenter popup, or an alternate mode where presenter remains current and the slide receiver is a popup moved to the external display?
