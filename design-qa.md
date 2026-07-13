# ORBIT mockup-to-production design QA

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
