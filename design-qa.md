# ORBIT mockup-to-production design QA

## Rehearsal Presenter Chrome Visibility (2026-07-15)

- Source visual truth: `/tmp/orbit-rehearsal-ui-hide-before.jpg`, captured from the annotated `localhost:5173` rehearsal route.
- Implementation screenshot: `/tmp/orbit-rehearsal-ui-hide-after.jpg`, captured from the worktree `localhost:5175` route.
- Combined comparison: `/tmp/orbit-rehearsal-ui-hide-comparison.jpg`.
- Viewport/state: `2207x1164`, live rehearsal without microphone input, slide 9 of 29.

### Full-view and focused comparison evidence

The source and implementation were placed side by side at the same viewport, project, and slide. The implementation removes the five annotated visual surfaces: the Live STT/auto-advance card, teleprompter progress badge, next-slide preview, current-stage label, and in-stage slide index. The slide renderer, navigation, timer, system status, keyword/script content, teleprompter, typography, colors, borders, radii, icons, and deck imagery remain unchanged.

The selected regions are readable in the full comparison, so a separate crop was not necessary. DOM and computed-style inspection provides focused evidence that all five elements remain mounted while each reports `display: none`. The former next-slide grid row and Live STT column collapse instead of leaving blank internal gaps; the presenter main reports two rows and the keyword section occupies the full `334px` panel width.

### Findings and comparison history

- No actionable P0/P1/P2/P3 mismatch remains.
- The requested change is CSS-only. Rehearsal assistance, auto-advance settings, teleprompter progress, preview, and stage-label rendering code remains present and continues to execute.
- At `1120x720`, all five targets remain hidden, the presenter main has two grid rows, and there is no horizontal overflow.
- Fonts/typography, spacing rhythm outside the intentionally removed regions, ORBIT color tokens, image quality, icons, and remaining app copy passed visual review.

### Verification

- Previous-slide navigation moved to `8 / 29`; next-slide navigation returned to `9 / 29`.
- Browser console: no errors or warnings.
- Web suite: 141 files, 992 tests passed.
- Focused rehearsal/presenter suite: 2 files, 110 tests passed.
- Web lint/typecheck: passed.
- Web production build: passed; only the pre-existing Vite chunk-size advisory remained.
- `git diff --check`: passed.

final result: passed

---

## Source visual truth

- Presentation brief: `/tmp/orbit-production-design/brief-reference.png`
- Version history: `/tmp/orbit-production-design/history-reference.png`
- Practice plan: `/tmp/orbit-production-design/plan-reference.png`
- Focused practice: `/tmp/orbit-production-design/focus-reference.png`
- Challenge Q&A: `/tmp/orbit-production-design/qna-reference.png`
- AI PPT wizard: `/tmp/orbit-production-design/ai-reference.png`
- Canonical tokens and components: `apps/web/src/design-system/`

## Implementation evidence

- Presentation brief: `/tmp/orbit-production-design/brief-production.png`
- Version history: `/tmp/orbit-production-design/history-production.png`
- Practice plan production component preview: `/tmp/orbit-production-design/plan-production.png`
- Focused practice production component preview: `/tmp/orbit-production-design/focus-production.png`
- Challenge Q&A production component preview: `/tmp/orbit-production-design/qna-production.png`
- AI PPT production route: `/tmp/orbit-production-design/ai-production.png`
- Editor entry points: `/tmp/orbit-production-design/editor-entry-points.png`
- Mobile captures: `/tmp/orbit-production-design/mobile-brief.png`, `/tmp/orbit-production-design/mobile-history.png`, `/tmp/orbit-production-design/mobile-ai.png`
- Desktop viewport: 1440 × 1000
- Mobile viewport: 390 × 844
- States: authenticated production shell; existing project; brief fallback draft; two real snapshot records; production-component preview data for coaching ready states; AI wizard Brief step

## Findings

- No actionable P0/P1/P2 mismatch remains in the checked states.
- Fonts and typography: production uses the Pretendard/Inter ORBIT stack, mono eyebrows, editorial Korean display weights, and stable mobile wrapping. Version-history heading size was reduced to preserve the mockup's single-line desktop hierarchy.
- Spacing and layout rhythm: production retains the mockup's two-column brief/history/plan structure, bordered focused-practice and Q&A shells, compact 20px panel gaps, pill actions, and 16px panel radii. App header and authenticated account controls are intentional production additions.
- Colors and tokens: Ink, Canvas, Surface, Lilac, Lilac Soft, Lime, Cream, and Navy map to the canonical design-system tokens. No gradient or untracked color system was introduced.
- Image quality and assets: existing ORBIT raster logos are preserved. Focused practice uses the real `ReadOnlySlideCanvas` for live production data; its mockup preview uses a metadata fallback so server-side tests do not require the native canvas package.
- Copy and content: app-specific copy mirrors the selected mockups while dynamic labels, snapshot reasons, deck titles, coaching goals, and feedback remain API-driven.
- Icons: newly added product surfaces use Tabler icons. The AI PPT wizard was migrated from Lucide to Tabler in the prior mockup pass and is now the production `/createdeck` experience.
- Accessibility and responsiveness: fields retain labels and helper text; choices expose pressed/selected state; dialogs trap focus; buttons maintain practical targets. All six checked routes report `scrollWidth === clientWidth` at 390 × 844.

## Comparison history

1. P1 — `/createdeck` still opened the older two-step PPTX-only flow rather than the selected detailed AI wizard. Routed production creation to the API-connected detailed wizard and kept the previous implementation exported for compatibility.
2. P1 — a failed or unavailable saved Brief request replaced the entire screen with an error state, preventing users from creating a first Brief. Added a usable default draft with an inline status message while preserving save errors and revision conflict handling.
3. P2 — every snapshot sharing the current deck version was labelled as the current version. Restricted the current marker and disabled restore action to the latest snapshot row.
4. P2 — the production version-history title wrapped to two desktop lines while the selected mockup held one line. Removed the forced break and aligned the compact heading scale.
5. P2 — coaching mockups and production components could drift after implementation. Existing mockup routes now render the actual `PracticePlanPage`, `FocusedPracticePage`, and `ChallengeQnaPage` with isolated preview data; production routes continue to use live API state.
6. Post-fix comparison — desktop source/implementation pairs were opened together for all six surfaces. The visible remaining differences are authenticated production chrome, real data, and API-contract constraints rather than design drift.
7. Mobile verification — brief, history, AI wizard, practice plan, focused practice, and challenge Q&A were checked at 390 × 844 with no horizontal overflow.

## Focused region comparison

- Brief: audience/purpose pills, duration/outcome row, lens selection cards, impact note, and save action.
- History: current-version badge, snapshot row metadata, restore action state, and restore-point content region.
- Coaching: selected goal row, focused-practice target card and attempt history, Q&A assistance/tabs/voice panel/result state.
- Editor: new `브리프` and `버전` entry points are visible beside save/presentation/share actions.
- AI wizard: step rail, Brief fields, live deck preview, Side AI, and mobile horizontal step scrolling.

## Interaction verification

- Practice plan: selecting the ARR goal updates the focused action and success criteria.
- Focused practice: start/stop preview recording adds a second attempt.
- Challenge Q&A: text mode accepts an answer and renders feedback.
- Brief: audience, purpose, lens, and fields remain editable; production API revision conflicts retain typed error handling.
- History: list refresh, row selection, confirmation dialog, restore request, and cache invalidation are connected.
- AI PPT: wizard navigation and inputs remain connected to the existing generation workflow.
- Browser console errors: none.

## Verification

- `pnpm --filter @orbit/web typecheck` — passed.
- `pnpm --filter @orbit/web lint` — passed.
- Full Web suite after the final preview split — 123 files, 852 tests passed.
- Final targeted regression — App and mockup flow, 74 tests passed.
- `git diff --check` — passed.

## Login password visibility control annotation

- Source: browser annotation at `http://localhost:5175/login`, desktop viewport 2019 × 1104.
- The visibility control is now positioned from the password input's top edge rather than the whole field's bottom edge, so optional helper text cannot displace it.
- Browser measurement after reload: the 44px control is fully inside the 46px input and its vertical center differs by 0.5px.
- Visual comparison: icon, input border, padding, label spacing, and surrounding login layout match the supplied screen; no P0/P1/P2 issue remains.
- Regression verification: Web suite — 123 files, 852 tests passed.

## Public landing annotations

- Source: four browser annotations at `http://localhost:5175/`, desktop viewport 2019 × 1104.
- Header and final-bar `무료로 시작` actions both navigate to `/signup`; each route transition was verified independently in the in-app browser.
- The product preview now uses `user-select: none` and cancels drag-start events, preventing text/image dragging without changing its visual treatment.
- The hero `예시 보기` secondary action was removed; the primary CTA remains aligned with the existing copy column.
- Post-fix capture preserves the annotated layout, typography, product-preview framing, and responsive section structure. No P0/P1/P2 issue remains.
- Regression verification: Web suite — 123 files, 852 tests passed; `git diff --check` passed.

final result: passed

---

## Rehearsal Stopwatch and Lyric Prompter Annotations (2026-07-14)

- Source visual truth: `/tmp/orbit-rehearsal-before.png` and Browser Comments 1-2 at the rehearsal route.
- Implementation evidence: `/tmp/orbit-rehearsal-branch-lyrics.png`, `/tmp/orbit-rehearsal-lyrics-scrolled.png`, and `/tmp/orbit-rehearsal-lyrics-returned.png`.
- Viewport/state: `2207x1164`, slide 1 of 8, rehearsal running; source used the existing countdown card and static three-line script, implementation used the current branch on `http://localhost:5174`.

### Full-view and focused comparison

The presenter stage, side-panel width, controls, typography, borders, and current ORBIT blue timing card remain aligned with the supplied screen. The countdown input is replaced by a read-only stopwatch beginning at `00:00`. Total-presentation and current-slide expected-time rows sit directly below it and fill independently. Their warning contract is default before the five-second target window, orange from target minus five seconds through target plus five seconds, and red after that tolerance.

The lower script surface keeps the existing footprint while becoming a vertically scrollable, dark lyric view. All script sentences remain available, the active sentence uses the strongest white weight, and surrounding lines recede without disappearing. Keyboard/manual scrolling moved the viewport independently; pausing and resuming triggered the same auto-follow key used by incoming speech and returned the active line to the centered reading position.

### Interaction and lifecycle verification

- Stopwatch start, pause, resume, and reset controls remained reachable in the in-app browser.
- A P3 session regression test proves pause unsubscribes from STT results/errors and resume subscribes again before restarting the port, while preserving monotonic transcript timestamps and covered sentences.
- Workspace resume now rejects a non-running STT state and reacquires a dead live-demo microphone stream instead of reporting a silent successful resume.
- Incoming non-empty STT results increment the lyric auto-follow key, so speech returns a manually scrolled script to the current sentence.
- The current branch's fresh `localhost:5174` origin reached the Web Speech language-pack install guard (`SpeechRecognition.install` requires a user gesture after async preparation), so end-to-end spoken-audio recognition could not be completed in that temporary QA origin. This is an environment-specific residual check; lifecycle behavior is covered by the port/session tests.

### Findings and verification

- P0/P1 visual mismatch: none.
- P2: none after moving the lyric overrides to the shared stylesheet with sufficient specificity; the first pass rendered white lyric text on the later white global surface.
- Accessibility: the stopwatch is an `output`, both progress rows expose current/expected labels, the lyric viewport is keyboard focusable, and the active sentence exposes `aria-current` with polite live updates.
- Web typecheck: passed.
- Web suite: 141 files, 962 tests passed.
- `git diff --check`: passed.

final result: passed with the noted temporary-origin spoken-audio verification gap

---

## Compact Editor Annotations (2026-07-14)

- Source visual truth: `/tmp/orbit-editor-720-before-responsive-fix-ready.png` and the current task's Browser Comments for the element quickbar scrollbar and the header-to-slide-strip gap.
- Implementation screenshots: `/tmp/orbit-editor-720-final-ready.png`, `/tmp/orbit-editor-720-element-quickbar-final.png`, `/tmp/orbit-editor-desktop-quickbar-after.png`.
- Full comparison: `/tmp/orbit-editor-720-responsive-comparison.png`.
- Focused comparison: `/tmp/orbit-editor-720-responsive-focused-comparison.png`.
- Viewport/state: `720x900`, project editor slide 1 in the default and chart-selected states; desktop regression at `2163x1324` with the chart selected.

### Full-view comparison evidence

The compact editor now follows one vertical reading flow: the two-row application header is followed immediately by the horizontal slide strip, responsive editor controls, a fully visible slide canvas, and the AI tools panel. The desktop-only fixed control offsets and side-panel columns no longer reserve or overlap space at `720px`.

### Focused region comparison evidence

The supplied header annotation showed a `116px` empty band between the application header and slide strip. Compact editor rows now use intrinsic `max-content` sizing and zero desktop control offset, removing that band. The chart-selected quickbar wraps its fields into two rows and reports no horizontal or vertical overflow; the slide strip remains horizontally operable while its visual scrollbar is hidden.

### Comparison history

1. P1: fixed desktop positions caused the slide rail, canvas, and AI panel to overlap or clip in the initial `720x900` rendering.
2. P1: the first compact pass still allowed the stage grid row to shrink, which overlaid the AI panel and produced a vertical scrollbar inside the element quickbar.
3. P2: the desktop quickbar reservation left the annotated `116px` blank area above the slide strip.
4. Fixes: compact rows now size to content, desktop padding is removed, the stage scale derives from available viewport width, and element controls wrap without nested scrollbars.
5. Post-fix measurements: page `clientWidth` and `scrollWidth` are both `720px`; stage shell `clientWidth` and `scrollWidth` are both `688px`; element quickbar `clientWidth` and `scrollWidth` are both `692px`.

### Required fidelity surfaces

- Layout and hierarchy: passed. Existing ORBIT header, slide strip, toolbar, canvas, and tools order is preserved.
- Typography, color, radius, and border tokens: passed. No new visual language or one-off token was introduced.
- Responsive behavior: passed. Compact controls reflow; the canvas fits; the tools panel returns to document flow; desktop controls remain fully visible.
- Accessibility: passed. Existing control labels remain available, and hidden scrollbars do not remove horizontal slide-strip input behavior.
- Browser console: no errors.

### Verification

- Web suite: 133 files, 926 tests passed.
- Web lint: passed.
- Latest Docker Web build: passed.
- `git diff --check`: passed.
- Findings after the final full and focused comparisons: no actionable P0/P1/P2/P3 issue.

final result: passed

---

## Rehearsal Design-System Token Migration (2026-07-14)

- Source visual truth: `/tmp/orbit-rehearsal-token-before.jpg` and the canonical ORBIT guidance in `docs/orbit-design-system.md`.
- Implementation screenshots: `/tmp/orbit-rehearsal-token-final-desktop.jpg`, `/tmp/orbit-rehearsal-token-final-timing.jpg`, and `/tmp/orbit-rehearsal-token-status-panel.jpg`.
- Viewport/state: `1280x720`, rehearsal running without microphone input, slide 1 of 8, stopwatch active.
- Route: `http://localhost:5174/rehearsal/project_3e0e3c8e-5766-4158-8e91-09cf1a52735a?snapshotPreparationId=38f55d3c-b72e-4387-a7e7-cbe63b146f15`.

### Full-view comparison evidence

The source and final desktop screenshots were opened together at the same viewport and rehearsal state. The initial capture retained a blue legacy primary action, pushed the 360px coaching column beyond the viewport, and left only a partial presenter canvas visible. The final capture keeps the current slide, timer, coach panel, next-slide preview, and lyric prompter inside the `1280px` viewport. The stage remains the dominant surface while the timer and presenter action use canonical Lilac and Ink roles.

### Focused region comparison evidence

The timer/prompter and coaching-panel captures were inspected separately because their small labels and semantic states are not readable in the full-view comparison. The stopwatch uses the ORBIT mono token; total and per-slide tracks use Ink by default, Warning near the target, and Danger beyond the five-second tolerance. The lyric surface uses Ink with white focus text, muted surrounding lines, the existing scroll affordance, and Lilac focus treatment. The formerly unstyled system-status list now uses Info Soft, semantic icon colors, 12–13px support text, and a bounded count pill.

### Required fidelity surfaces

- Fonts and typography: passed. Pretendard/Inter/system fallbacks, ORBIT UI/caption sizes, mono stopwatch numerals, and existing slide typography are preserved.
- Spacing and layout rhythm: passed. The `24px` page grid, `20–24px` primary gaps, `8/12/16px` internal rhythm, panel radii, and hairline borders use the documented scale. At `1120px` and below the workspace becomes a vertical flow rather than clipping the coach panel.
- Colors and visual tokens: passed. Canvas, Surface, Ink, Lilac, Lilac Strong, Lime, Info Soft, Warning, Danger, Border, and Focus tokens replace the legacy blue/teal styling in the migrated rehearsal surface.
- Image quality and asset fidelity: passed. The current and next-slide renderers reuse the original deck assets without replacement, filtering, or distortion.
- Copy and content: passed. Rehearsal labels, timing values, script text, live-STT state, and system-status explanations remain unchanged.
- Icons and accessibility: passed. Existing outline icons remain visually consistent; icon-only controls retain accessible names and at least 44px targets in the migrated timer and slide controls. Keyboard focus uses `--orbit-ds-focus`.

### Comparison history

1. P1 — the first design-system pass still allowed later global CSS to win, leaving the primary display action and timer card blue. Fixed with rehearsal-shell-scoped selectors that resolve directly to canonical tokens.
2. P1 — the initial `1280px` capture pushed the coaching column outside the viewport. Fixed by preserving the 360px desktop column at available widths and adding a tested single-column fallback at `1120px`.
3. P2 — an early responsive fallback collapsed the slide row because the full-height shell still overrode the feature stylesheet. Fixed with higher-specificity responsive height/grid rules and verified computed dimensions.
4. P2 — `SemanticCapabilityStatus` had no visual styles and rendered as a plain list. Added a token-based Info Soft status surface with semantic warning/error colors.
5. Post-fix evidence — the final `1280x720` screenshot reports layout bounds `30.3–1249.7px`, main width `787.4px`, side width `360px`, and no horizontal overflow.

### Interaction and verification

- Timer pause changed the action to `리허설 다시 시작`; resuming restored `타이머 일시정지`.
- The current rehearsal remained active after exceeding the slide target and exposed the Danger progress state instead of auto-ending.
- The coach panel retained independent scrolling; the lyric prompter remained independently scrollable.
- Browser console: no errors or warnings (only Vite debug and React DevTools informational entries).
- Web suite: 141 files, 962 tests passed.
- Web lint/typecheck: passed.
- Web production build: passed; only the pre-existing Vite chunk-size advisory remained.
- `git diff --check`: passed.

No actionable P0/P1/P2 visual findings remain. No focused crop was needed beyond the timer/prompter and coach-panel captures because the slide imagery and primary toolbar were fully readable in the full-view comparison.

final result: passed

---

## Reference Upload Annotations (2026-07-13)

- Source visual truth: current task attachment, `Browser Comment 2` (`/createdeck`, 2192 x 1164)
- Implementation screenshot: `/private/tmp/orbit-reference-panel-multi-file.png`
- Viewport: 2192 x 1164; focused panel capture: 740 x 743
- State: References step with two files attached

## Full-view comparison evidence

The existing three-column wizard shell, step rail, main work panel, and right preview column remain unchanged. The References panel intentionally replaces the single selected-file drop surface from the source with a compact add-files surface followed by a row list. The surrounding ORBIT hierarchy and panel proportions remain consistent with the source screen.

## Focused region comparison evidence

The focused implementation capture was compared with the selected References panel in Browser Comment 2. File names are now visible as separate rows below the drop surface, each row has a Tabler file icon, type and size metadata, and an accessible delete action. A count badge and `전체 삭제` action provide list-level feedback. Reference and image policies are separated into labeled groups instead of one undifferentiated chip area.

## Findings

- Fonts and typography: Passed. Pretendard/ORBIT type tokens, heading hierarchy, 13-14px interactive text, and non-negative letter spacing are retained.
- Spacing and layout rhythm: Passed. The upload, list, and policy groups follow the 8/12/16/24px spacing scale. Rows grow vertically and are not placed in a nested card.
- Colors and visual tokens: Passed. Canvas, Surface, Lilac, Success, Danger, and border tokens are used semantically. Success is limited to the small file-count badge.
- Image quality and asset fidelity: Passed. No new raster assets were needed; visible UI uses the existing Tabler outline icon family.
- Copy and content: Passed. Accepted formats, the 50MB per-file limit, multiple selection, file count, and policy purposes are explicit.
- Accessibility: Passed. The file input has an accessible name, policy buttons expose `aria-pressed`, and per-file delete buttons include the filename in `aria-label`.

## Comparison history

- Earlier P1: only one selected filename was summarized inside the drop surface, so users could not scan or remove individual files. Fixed with an unbounded row list, per-file delete, and `전체 삭제`.
- Earlier P2: image and reference policies appeared as visually identical adjacent chip groups without labels. Fixed with separate fieldsets, legends, and helper copy.
- Post-fix evidence: `/private/tmp/orbit-reference-panel-multi-file.png` shows both fixes in the same two-file state. No actionable P0/P1/P2 visual findings remain.

## Verification

- Primary behavior: file-list normalization, append/deduplication, and removal covered by 17 focused unit tests.
- Browser rendering: two-file list state rendered successfully; `multiple` is present on the file input.
- Browser console: no errors or warnings.
- Residual test gap: the operating-system file picker and physical drag gesture were not automated in the in-app browser.

## Follow-up polish

- P3: validate very long filenames and a larger file set with real user documents during manual QA.

final result: passed

---

## Policy Tooltip Annotations (2026-07-13)

- Source: current task Browser Comments 1-2 at `/createdeck`, viewport 2192 x 1164.
- Implementation evidence: `/private/tmp/orbit-policy-tooltip-media.png`.
- Each reference and media policy now has an info icon and a hover/focus tooltip connected with `aria-describedby` and `role="tooltip"`.
- Tooltip copy reflects the current shared schema, contracts, and Python worker behavior, including the placeholder-only limits for public and AI images and the blocking source requirement for web research.
- Browser verification covered the focused `research-first` and `ai-generated` states; no console errors or warnings were reported.
- Focused tests: 18 passed. Web typecheck and `git diff --check` passed.
- No actionable P0/P1/P2 issue remains.

final result: passed

---

## Editor Toolbar Annotations (2026-07-14)

- Source: `/tmp/orbit-editor-toolbar-before.png`
- Implementation: `/tmp/orbit-editor-toolbar-after-default-final.png`
- Full comparison: `/tmp/orbit-editor-full-comparison.png`
- Focused comparison: `/tmp/orbit-editor-toolbar-tabs-comparison.png`
- Responsive evidence: `/tmp/orbit-editor-toolbar-after-720.png`
- Viewport/state: `2163x1324`, project editor, slide 1, AI chat panel
- Responsive viewport/state: `720x900`, same project and slide

### Full-view and focused comparison

The existing editor hierarchy, canvas placement, toolbar heights, typography, colors, and active-tab treatment remain unchanged at the source viewport. The right panel now exposes only `AI 채팅` and `AI 도구`; the semantic cue panel contract remains available without showing the annotated `발표 메시지 3` tab.

At `720px`, tool labels collapse to accessible icon controls and the slide properties use a bounded responsive grid. The page, toolbar, and quickbar each reported matching `clientWidth` and `scrollWidth` at both tested widths.

### Findings and verification

- P0: none
- P1: none
- P2: none
- P3: none
- Accessibility: responsive icon-only tools retain Korean `aria-label` values.
- Browser console: no errors.
- Web suite: 133 files, 919 tests passed.
- Web lint: passed.
- `git diff --check`: passed.

final result: passed
