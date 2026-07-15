# ORBIT mockup-to-production design QA

## Rehearsal Script and Decorative Gauge Visibility (2026-07-15)

- Source visual truth: `/tmp/orbit-rehearsal-script-timer-before.jpg`, captured from the annotated `localhost:5175` rehearsal route.
- Implementation screenshot: `/tmp/orbit-rehearsal-script-timer-after.jpg`.
- Combined comparison: `/tmp/orbit-rehearsal-script-timer-comparison.jpg`.
- Viewport/state: `2207x1164`, live rehearsal without microphone input, slide 1 of 8.

### Findings and comparison history

- The side-panel `발표 대본` section and the timer card's decorative audio gauge are hidden only in the rehearsal presenter shell. Both elements remain mounted and report `display: none`; their React rendering and state code was not removed.
- The selected timer region was confirmed as an `aria-hidden` visual gauge. The two meaningful timing progress rows, stopwatch controls, current-slide summary, keyword checklist, and bottom lyric teleprompter remain visible and accessible.
- The side panel closes the vacated script space without leaving an empty grid row. No typography, color, border, radius, slide imagery, or copy outside the requested regions changed.
- At `1120x720`, the requested elements remain hidden, the bottom teleprompter remains present, and the document reports no horizontal overflow.

### Verification

- Next-slide navigation moved to `2 / 8`; previous-slide navigation returned to `1 / 8`.
- DOM/computed style: both hidden elements remain present with `display: none`; both timing progress rows and the teleprompter remain present.
- Web suite: 141 files, 993 tests passed.
- Web lint/typecheck: passed.
- Web production build: passed; only the pre-existing Vite chunk-size advisory remained.
- `git diff --check`: passed.

final result: passed

---

# Presenter Notes Resize and Hide QA — 2026-07-15

## Scope

- Surface: production project editor at `http://localhost:5173/project/project_4c5368cf-d6d2-4454-9a3f-9ff2d31b384c`.
- Goal: let the presenter-notes dock resize vertically, show its full timing guidance on first open, retain the user's later height, and use one consistent collapsed presentation.
- Boundary: only production editor files were changed; mockup code, routes, assets, Deck data, and save contracts remain untouched.

## Evidence and interaction checks

- Before capture: `/Users/donghyunkim/.codex/visualizations/2026/07/15/019f645b-15d4-7983-83f3-f3a0833922a3/38-speaker-notes-before.png`
- Desktop expanded capture: `/Users/donghyunkim/.codex/visualizations/2026/07/15/019f645b-15d4-7983-83f3-f3a0833922a3/42-speaker-notes-final.png`
- Compact expanded capture: `/Users/donghyunkim/.codex/visualizations/2026/07/15/019f645b-15d4-7983-83f3-f3a0833922a3/41-speaker-notes-resizable-expanded-860x900.png`
- Unified drag-collapse capture: `/Users/donghyunkim/.codex/visualizations/2026/07/15/019f645b-15d4-7983-83f3-f3a0833922a3/44-notes-drag-collapse-unified.png`
- First open measured 360px and showed the bottom timing meter with no internal scroll (`contentClientHeight` and `contentScrollHeight` both 292px).
- After keyboard resizing to 240px, button collapse and reopen restored exactly 240px instead of recalculating the initial height.
- A downward drag past the threshold now produces the same 54px collapsed row, preview text, chevron, and accessible toggle as button collapse; no alternate restore handle remains.
- `ArrowUp` and `ArrowDown` resize the focused separator; moving below the 120px keyboard minimum uses the same collapsed row.
- At 860×900 the expanded panel remained 240px tall, page width matched the viewport, and the collapsed inspector action stayed above the notes panel without overlap.
- After resizing the compact panel to 420px, the inspector action retained a measured 16px gap above it and page width still matched the 860px viewport.

## Accessibility and design-system checks

- The resize handle is a focusable horizontal separator with explicit label, orientation, min/max/current values, visible ORBIT focus treatment, and Tabler grip icon.
- The shared collapsed row retains its labeled expand control, preview text, and visible focus treatment, so notes never become unreachable.
- Editing disables resizing/hiding to protect an in-progress draft.
- Canvas, Surface, Border, typography, focus, and hover styles use existing ORBIT semantic tokens.

## Automated verification

- `pnpm --filter @orbit/web test`: 145 files, 1005 tests passed.
- `pnpm --filter @orbit/web typecheck`: passed.
- `pnpm --filter @orbit/web build`: passed with the existing Vite chunk-size warning only.

final result: passed

---

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
- Web suite: 141 files, 993 tests passed.
- Focused rehearsal/presenter suite: 2 files, 111 tests passed.
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

---

# ORBIT Production Editor Design QA

## Scope

- Source visual: `/Users/donghyunkim/.codex/visualizations/2026/07/15/019f645b-15d4-7983-83f3-f3a0833922a3/05-reference-editor-1440x900.jpg`
- Final implementation: `/Users/donghyunkim/.codex/visualizations/2026/07/15/019f645b-15d4-7983-83f3-f3a0833922a3/15-production-editor-final-1440x900.jpg`
- Responsive evidence:
  - `/Users/donghyunkim/.codex/visualizations/2026/07/15/019f645b-15d4-7983-83f3-f3a0833922a3/12-production-editor-1180x800-reloaded.jpg`
  - `/Users/donghyunkim/.codex/visualizations/2026/07/15/019f645b-15d4-7983-83f3-f3a0833922a3/14-production-editor-860x900-fixed.jpg`
- Inspector evidence:
  - `/Users/donghyunkim/.codex/visualizations/2026/07/15/019f645b-15d4-7983-83f3-f3a0833922a3/10-production-editor-design-panel-fixed.jpg`
  - `/Users/donghyunkim/.codex/visualizations/2026/07/15/019f645b-15d4-7983-83f3-f3a0833922a3/09-production-editor-notes-panel.jpg`
- State: project editor loaded with the current five-slide production deck; AI coach is the default inspector tab.
- Reference policy: `/mockup/editor` was opened only for visual comparison. No mockup source, route, style, component, constant, or asset is used by production code.

## Full comparison

The source and implementation were reviewed together at 1440×900. The implementation preserves the source hierarchy: compact document header, neutral rounded tool dock, 224px slide rail, flexible canvas workspace, 304px inspector, lilac selection states, outline icon family, secondary share/rehearsal actions, and a single black presentation action. Production-only presence, version, brief, Deck content, AI chat, validation, and save behavior remain intentionally functional instead of copying mockup-only content.

Typography uses the existing ORBIT font stack and semantic scale. The canvas remains the ORBIT Surface while the slide retains its Deck theme. Borders, focus rings, active states, and status colors are mapped to ORBIT semantic tokens. Official production logo and Tabler outline icons are used; no mockup or replacement art assets are introduced.

## Responsive and interaction checks

- 1440×900: three regions align below the 54px tool dock with no overlap or inaccessible controls.
- 1180×800: contextual labels compress while slide rail, canvas, inspector, and header actions remain reachable.
- 860×900: the rail becomes 86px, slide addition remains available as an icon action, and the inspector becomes a bottom sheet capped below 46vh.
- Top inspector tabs support ArrowLeft/ArrowRight keyboard movement.
- Share uses the existing ORBIT dialog; Escape closes it and restores focus to the Share button.
- Icon-only editor actions expose accessible labels and visible ORBIT focus rings.
- AI coach Chat/Inspection, Design controls, and Notes content were opened and checked.
- Desktop and responsive browser console error logs were empty.

## Comparison history

1. P2 layout: the first desktop pass applied tool-dock spacing twice, leaving an oversized gap above the workspace. Fixed by keeping the dock in the stage flow and offsetting only the adjacent slide, animation, and inspector panes.
2. P2 responsiveness: the Design inspector inherited the horizontal quick-bar grid and clipped theme controls. Fixed with inspector-specific two-column field layout at matching specificity.
3. P2 responsiveness: at 860px the presentation action wrapped below the logo and the slide title broke vertically in the 86px rail. Fixed by anchoring the presentation action inside the mobile header and hiding the redundant rail title while retaining the count in desktop layouts.
4. Final same-input comparison found no remaining P0, P1, or P2 fidelity, behavior, accessibility, or responsiveness issue within the requested production-editor scope.

## Automated verification

- `pnpm --filter @orbit/web test`: 145 files, 1005 tests passed.
- `pnpm --filter @orbit/web typecheck`: passed.
- `pnpm --filter @orbit/web build`: passed; existing Vite chunk-size warnings only.
- Mockup before/after SHA-256 manifests are identical.
- `git diff -- apps/web/src/features/mockups apps/web/src/App.tsx` is empty.
- Production editor/design-system scan contains no `features/mockups` or `lucide-react` import.

final result: passed

---

# Speaker Notes Dock QA — 2026-07-15

## Evidence

- Source visual truth: `/Users/donghyunkim/.codex/visualizations/2026/07/15/019f645b-15d4-7983-83f3-f3a0833922a3/18-google-slides-notes-reference-clear.jpg`
- Desktop implementation: `/Users/donghyunkim/.codex/visualizations/2026/07/15/019f645b-15d4-7983-83f3-f3a0833922a3/19-orbit-notes-after-collapsed.jpg`
- Expanded implementation: `/Users/donghyunkim/.codex/visualizations/2026/07/15/019f645b-15d4-7983-83f3-f3a0833922a3/20-orbit-notes-after-expanded.jpg`
- Responsive implementation:
  - `/Users/donghyunkim/.codex/visualizations/2026/07/15/019f645b-15d4-7983-83f3-f3a0833922a3/21-orbit-notes-1180x800.jpg`
  - `/Users/donghyunkim/.codex/visualizations/2026/07/15/019f645b-15d4-7983-83f3-f3a0833922a3/22-orbit-notes-860x900.jpg`
  - `/Users/donghyunkim/.codex/visualizations/2026/07/15/019f645b-15d4-7983-83f3-f3a0833922a3/23-orbit-notes-860x900-expanded.jpg`
- Primary viewport: 2048×1365, collapsed presenter-notes state.
- Additional viewports: 1180×800 and 860×900.

## Comparison

The source and desktop implementation were opened in the same comparison input. Both place presenter notes as a low-emphasis horizontal strip directly below the slide canvas, separated by a single subtle border and outside the primary inspector hierarchy. ORBIT intentionally keeps its own label, current slide note preview, Pretendard typography, Tabler file icon, and semantic tokens instead of copying Google product chrome.

The full view was sufficient to judge the strip's position, width, border, spacing, typography hierarchy, and relationship to the canvas. The expanded implementation screenshot provides focused evidence for the note text, AI refinement, edit action, keyword checkpoints, length meter, and internal scrolling; a separate cropped image was not required.

## Required fidelity surfaces

- Fonts and typography: ORBIT's existing editorial Korean type scale remains consistent; the note title is stronger than the single-line preview without competing with the slide.
- Spacing and layout: the 54px collapsed dock attaches to the canvas bottom; expanded content is capped at 280px/34vh and scrolls internally.
- Colors and tokens: Canvas, Surface, Ink, muted text, Lilac focus, and semantic borders use the canonical ORBIT tokens.
- Image quality and assets: no new raster, SVG, CSS-art, or mockup asset was introduced; the existing official logo and Tabler icon remain intact.
- Copy and content: dynamic presenter notes are previewed in the collapsed strip; the empty-state prompt is `발표자 노트를 추가하려면 클릭하세요.`

## Interaction and accessibility

- Collapsed and expanded states expose `aria-expanded`, `aria-controls`, and explicit expand/collapse labels.
- Keyboard focus uses the ORBIT focus ring.
- Editing automatically keeps the dock expanded; textarea, cancel, and save controls remain reachable.
- AI refinement, checkpoints, length guidance, and existing save/patch behavior remain available.
- At 860px the AI bottom sheet is offset above the notes dock in collapsed and expanded states, so neither surface becomes unreachable.
- Desktop and responsive console error logs were empty.

## Findings and comparison history

- First same-state comparison found no actionable P0, P1, or P2 mismatch. The source's low-emphasis note-strip hierarchy is preserved while product-specific ORBIT content and controls remain intentionally different.
- No post-comparison visual fix loop was required. Responsive captures confirmed there is no panel overlap or inaccessible note action.

## Automated verification

- `pnpm --filter @orbit/web test`: 145 files, 1005 tests passed.
- `pnpm --filter @orbit/web typecheck`: passed.
- `pnpm --filter @orbit/web build`: passed with the existing Vite chunk-size warning only.

final result: passed
---

# Production Editor Density and Responsive Layout QA — 2026-07-15

## Audit scope and user goal

- Surface: production project editor at `http://localhost:5173/project/project_4c5368cf-d6d2-4454-9a3f-9ff2d31b384c`.
- Goal: keep the slide-editing task visually dominant while preserving fast access to the slide rail, document toolbar, AI/design inspector, and presenter notes without overlap, clipping, or avoidable empty regions.
- Canonical system: `apps/web/src/design-system`; mockup code and assets remained read-only and unused.

## Evidence

- 1440×900 source capture: `/Users/donghyunkim/.codex/visualizations/2026/07/15/019f645b-15d4-7983-83f3-f3a0833922a3/25-editor-density-before-1440x900.png`
- 1440×900 final capture: `/Users/donghyunkim/.codex/visualizations/2026/07/15/019f645b-15d4-7983-83f3-f3a0833922a3/37-editor-density-after-default-final.png`
- 1180×800 source capture: `/Users/donghyunkim/.codex/visualizations/2026/07/15/019f645b-15d4-7983-83f3-f3a0833922a3/26-editor-density-before-1180x800.png`
- 1180×800 final capture: `/Users/donghyunkim/.codex/visualizations/2026/07/15/019f645b-15d4-7983-83f3-f3a0833922a3/33-editor-density-after-1180x800-final.png`
- 860×900 source capture: `/Users/donghyunkim/.codex/visualizations/2026/07/15/019f645b-15d4-7983-83f3-f3a0833922a3/27-editor-density-before-860x900.png`
- 860×900 final collapsed capture: `/Users/donghyunkim/.codex/visualizations/2026/07/15/019f645b-15d4-7983-83f3-f3a0833922a3/28-editor-density-after-860x900-pass1.png`
- 860×900 inspector-open capture: `/Users/donghyunkim/.codex/visualizations/2026/07/15/019f645b-15d4-7983-83f3-f3a0833922a3/29-editor-density-after-860x900-inspector-open.png`
- 720×900 final collapsed capture: `/Users/donghyunkim/.codex/visualizations/2026/07/15/019f645b-15d4-7983-83f3-f3a0833922a3/34-editor-density-after-720x900.png`
- 720×900 expanded-notes capture: `/Users/donghyunkim/.codex/visualizations/2026/07/15/019f645b-15d4-7983-83f3-f3a0833922a3/36-editor-density-after-720x900-notes-final.png`

The 1440, 1180, and 860 source/final images were opened in same-input comparison passes. The full views were sufficient to judge the region grid, canvas scale, clipping, inspector overlap, notes placement, and responsive hierarchy. Separate inspector-open and expanded-notes captures provide focused evidence for the two bottom surfaces.

## Findings and comparison history

1. P1 responsive clipping: at 1180px the fixed 0.44 stage scale produced an 845px slide inside a 652px canvas column, requiring horizontal scrolling and hiding the slide's right side behind the inspector. The stage now observes its real canvas viewport and fits both width and height, with a guarded 0.16–0.66 scale range. Final slide width is 656px inside a 704px canvas column after the medium-width rails are compacted.
2. P1 mobile task obstruction: at 860px the inspector opened as a bottom sheet on entry, covered the lower slide and presenter notes, and hid the collapse action with the inspector header. Compact layouts now enter with the inspector collapsed, expose a 52px labeled tool action, and render a visible close control when the sheet is opened. The open sheet ends exactly where the notes dock begins.
3. P2 region alignment and empty space: the tool dock was fixed independently while the slide rail and inspector received an extra 120px offset because `:has(.selection-quickbar)` also matched the hidden Design panel. The canvas and notes stopped mid-screen, leaving a large unused region below. Desktop regions now share one grid: dock row, flexible workspace row, and notes row; the rail and inspector span the same workspace plus notes height.
4. P2 medium-width header wrapping: document actions wrapped into vertical two-line labels at 1180px. Presence is hidden at medium widths, contextual actions become accessible icon controls, and Share, Rehearsal, and Present remain single-line.
5. P2 compact notes overlap: expanded notes stacked header actions and the collapsed inspector action overlapped the note body. At 481–860px the notes header keeps a single compact row, and the inspector action moves above the expanded dock.

Post-fix comparisons found no remaining actionable P0, P1, or P2 layout, density, or responsive issue in the audited states.

## Required fidelity surfaces

- Typography: Pretendard, ORBIT UI sizes, weights, truncation, and Korean copy are unchanged; contextual labels are only visually hidden where their accessible button names remain intact.
- Spacing and layout: desktop uses a shared 66px tool row, flexible centered canvas, and 54px notes row. Medium rails are capped at 196px and 280px. Compact layouts preserve the 86px thumbnail rail and use the full remaining width.
- Colors and tokens: Canvas, Surface, Border, Ink, Lilac focus/active states, radii, and shadows continue to resolve through ORBIT semantic tokens.
- Image and asset fidelity: Deck rendering, slide theme, thumbnails, official logo, and Tabler icons are unchanged. No new image, SVG, CSS-art, mockup asset, or placeholder was introduced.
- Copy and content: document, toolbar, inspector, and presenter-note copy remains unchanged.

## Interaction and accessibility verification

- Presenter notes expand/collapse was exercised at 720px; expanded content and actions remain reachable with internal scrolling.
- Compact inspector open/close was exercised at 860px; the open panel does not overlap the notes dock.
- `AI 코치` and `디자인` keyboard navigation was exercised with ArrowRight and ArrowLeft; `aria-selected` followed focus.
- The responsive icon actions retain explicit accessible names.
- Browser console error log was empty in the final desktop state.
- Measured page width matched viewport width at 1440, 1180, 860, and 720; audited canvas regions had no horizontal overflow after the fixes.

## Automated verification

- `pnpm --filter @orbit/web test`: 145 files, 1005 tests passed.
- `pnpm --filter @orbit/web typecheck`: passed.
- `pnpm --filter @orbit/web build`: passed with the existing Vite chunk-size warning only.

final result: passed
