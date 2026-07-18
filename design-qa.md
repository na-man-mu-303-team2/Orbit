# Create deck first-step design QA

- Source visual truth: `/var/folders/bz/br99y0bj2395vd1507vwbqmm0000gn/T/codex-clipboard-e806a6c4-f0be-4044-8753-75c50caadb56.png` plus the current task requirements for a two-stage connected indicator and a single content flow.
- Implementation screenshots: `/private/tmp/orbit-createdeck-772-final.png`, `/private/tmp/orbit-createdeck-detail-772-final.png`, `/private/tmp/orbit-createdeck-tone-divider-final.png`, `/private/tmp/orbit-createdeck-step-outline-final.png`, `/private/tmp/orbit-createdeck-step-gray-outline-final.png`, `/private/tmp/orbit-rehearsal-picker-772-final.png`, and `/private/tmp/orbit-reports-772-final.png`.
- Earlier mobile evidence: `/private/tmp/orbit-createdeck-qa-mobile.png` at 442px; current responsive rules were rechecked at the same `max-width: 620px` and `max-width: 900px` breakpoints.
- Route: `/createdeck`.
- Viewports: 772 × 721 current annotation viewport, plus the earlier 442 × 665 mobile capture.
- State: authenticated workspace shell, first stage active, empty content form, default policy and tone selections.

## Full-view comparison evidence

The annotated 772px implementation was reviewed against the supplied 772px and 442px browser evidence. The policy controls now switch to one column before their descriptions become cramped, while the project and report tables switch to title-plus-action rows. No project identifier is exposed in the rehearsal list, and no horizontal overflow or clipped persistent action was observed.

## Focused region comparison evidence

The source and implementation indicators were placed in one focused comparison. Both use a connected capsule with rounded outside edges and a directional first segment. ORBIT intentionally maps the source's green status color to the redesign primary-to-secondary gradient and reduces the flow to the requested two stages. The implementation keeps the same visual direction while using production labels and design tokens.

## Required fidelity surfaces

- Fonts and typography: Pretendard and redesign type tokens are used. Stage labels, form labels, placeholders, policy values, attachment copy, and tone labels keep lighter weights; internal project IDs are removed from user-facing copy.
- Spacing and layout rhythm: `OrbitIconLabel` fixes every icon slot to the shared 20px icon token and applies the same spacing token to form, policy, attachment, and script-tone headings. Policy controls stack at 900px; project and report rows also adopt compact two-column layouts at that breakpoint.
- Colors and visual tokens: form and policy controls use `primary-subtle` instead of the dull neutral fill, icons use `primary-emphasis`, dividers use `outline-variant`, and active states use the redesign primary/secondary palette.
- Image quality and asset fidelity: the flow indicator is native UI rather than a raster asset. All semantic icons use the existing Tabler icon dependency; no placeholder or improvised glyph was introduced.
- Copy and content: `내용 구성` and `이미지 구성` expose the selected value plus a subdued, dynamically updated explanation. Redundant helper copy beneath `참고 자료` and `대본 톤` was removed while upload formats remain visible inside the drop zone.

## Interaction verification

- Opened the shared white `DropdownMenu` for `내용 구성`, confirmed four `menuitemradio` options and checked state, selected `참고자료 우선`, verified the helper description updated, then restored `사용자 입력만`.
- Selected a different script tone and restored `전문적인`; the selected button remained exposed through `aria-pressed`.
- Confirmed two stages, no duplicated tone panel, no `핵심 컨텍스트` title, and no horizontal overflow at desktop and mobile viewports.
- The `/createdeck`, `/project?intent=rehearsal`, and `/reports` captures reported no console warnings or errors.
- `pnpm --filter @orbit/web typecheck` passed.
- AI PPT tests passed: 14 tests.
- Targeted `/createdeck` app-route test passed.
- `pnpm --filter @orbit/web build` passed with the existing chunk-size warning only.

## Comparison history

1. P1 — the initial numbered indicator was visually heavy and disconnected from the requested pipeline reference. Replaced it with a compact connected capsule and directional active segment.
2. P1 — `핵심 컨텍스트` and `발표 톤` were presented as two competing panels. Merged them into one content flow and demoted tone to a compact `대본 톤` fieldset.
3. P2 — labels and placeholder copy looked overly bold. Reduced the active stage, field, helper, policy, attachment, and tone text weights while preserving contrast.
4. P2 — native policy selects did not match shared product menus and gave no selection rationale. Replaced them with `DropdownMenu`/`DropdownMenuItem` and added tokenized, live helper descriptions.
5. P2 — icon labels used ad hoc gaps and inconsistent semantic icons. Added the shared `OrbitIconLabel`, fixed the icon slot, and replaced content/tone icons with clearer document and message symbols.
6. P1 — the 772px policy and list layouts retained desktop columns, producing cramped descriptions and overlapping metadata. Added a 900px intermediate breakpoint and removed project IDs from user-facing rows.
7. P2 — neutral field fills made the creation flow look dull. Mapped form and policy surfaces to `primary-subtle` and icon accents to `primary-emphasis`.
8. Post-fix evidence — the latest 772px captures show aligned labels, one-column policy controls, compact list rows, and no actionable P0/P1/P2 issue in the requested regions.
9. P2 — the `fieldset` top border intersected the `대본 톤` legend. Removed the top border, retained a single bottom divider before the CTA, and verified the revised hierarchy in `/private/tmp/orbit-createdeck-tone-divider-final.png`.
10. P3 — the inactive second stage carried more color than needed. Removed its fill so the inactive stage uses the white surface and primary outline only; `/private/tmp/orbit-createdeck-step-outline-final.png` confirms the quieter hierarchy.
11. P3 — the inactive outline still carried too much brand color. Replaced it with the light neutral `outline-variant` token and verified the result in `/private/tmp/orbit-createdeck-step-gray-outline-final.png`.

## Findings

No remaining P0, P1, or P2 visual issue in the requested regions.

## Follow-up polish

- P3: validate helper-copy length against translated or server-provided policy descriptions before localization ships.

final result: passed

---

# Style loading spinner design QA

- Source visual truth: `.tmp/design-qa/style-loading-final.png`의 기존 로딩 화면 레이아웃과 사용자 지정 스피너 요구.
- Implementation screenshot: `.tmp/design-qa/style-loading-spinner.png`.
- Route: `/createdeck?preview=style-loading`.
- Viewport/state: 1453×874 CSS px, Style & Color 시작 로딩 상태.

## Comparison evidence

- Full view: 단계 표시, 상태 문구 너비·위치, 화면 여백은 기존 로딩 레이아웃과 동일하게 유지했다.
- Focused region: 폐기된 블록 영역만 기존 AI PPT 로딩 화면에서 사용 중인 Tabler `IconLoader2` 기반 스피너로 교체했다.
- Typography, spacing, color tokens, copy는 기존 상태를 유지했다. 추가 이미지 자산은 없다.
- 300ms 간격의 computed transform 값이 달라 회전 동작을 확인했다.
- 브라우저 콘솔 warning/error 없음. P0/P1/P2 시각 차이 없음.

## Verification

- AI PPT UI Vitest 4개 통과.
- `tsc -p tsconfig.json --noEmit` 통과.

final result: passed

---

# Style loading block animation design QA

> 2026-07-19: 사용자 요청으로 블록 애니메이션 렌더링과 CSS를 삭제하지 않고 주석 처리했다. 상태 문구의 중앙 정렬만 유지한다.

- Source visual truth: `C:/Users/Runner/Desktop/Frame 3.png`.
- Implementation captures: `.tmp/design-qa/style-loading-a.png`, `.tmp/design-qa/style-loading-b.png`, `.tmp/design-qa/style-loading-final.png`.
- Route: `/createdeck?preview=style-loading`.
- Viewport: 1453×874 CSS px.

## Fidelity and motion checks

- `ai-ppt-status`는 960px 너비로 중앙 정렬하고 단계 표시와 로딩 모션 사이에 기준 이미지와 유사한 수직 여백을 확보했다.
- Tabler `IconSquareFilled`로 구성한 블록이 위에서 회전하며 낙하하고, 하단의 불규칙한 블록 더미 위로 쌓이는 동작을 확인했다.
- 700ms 간격의 두 캡처에서 낙하 블록 위치가 달라 실제 애니메이션 재생을 확인했다.
- `prefers-reduced-motion: reduce` 환경에서는 낙하 애니메이션을 정지하도록 처리했다.
- 브라우저 콘솔 warning/error 없음. P0/P1/P2 시각 차이 없음.

## Verification

- AI PPT UI Vitest 4개 통과.
- `tsc -p tsconfig.json --noEmit` 통과.
- `git diff --check` 통과(CRLF 변환 안내만 존재).

final result: discarded

---

# AI 컬러 팔레트 생성 흐름 design QA

- Source visual truth: `C:/Users/Runner/Desktop/Frame 1.png`, `C:/Users/Runner/Desktop/Frame 2.png`.
- Implementation captures: `.tmp/design-qa/ai-palette-initial.png`, `.tmp/design-qa/compare-ai-palette-open-normalized.png`, `.tmp/design-qa/compare-ai-palette-result-normalized.png`.
- Route: `/project/:projectId/style-color/:jobId`.
- Viewport: 1453×874 CSS px.

## Fidelity and interaction checks

- 초기 상태는 `workspace-home-create` 스타일의 `AI로 컬러 팔레트 만들기` 타일만 표시한다.
- 타일을 누르면 오른쪽 두 열에 프롬프트 패널이 열리고, 생성 후 선택 가능한 팔레트·LLM 설명·재생성 입력창으로 전환한다.
- 기존 AI 팔레트 API와 선택 동작을 재사용하며 생성 및 재생성 결과가 즉시 선택 상태로 반영된다.
- 콘솔 warning/error 없음. P0/P1/P2 시각 차이 없음.

## Verification

- UI 및 design-system boundary Vitest 11개 통과.
- `tsc -p tsconfig.json --noEmit` 통과.
- 실제 브라우저에서 초기 → 열기 → 생성 → 프롬프트 변경 → 재생성 흐름 통과.

final result: passed

---

# Project 02 — Style & Color design QA

- Source visual truth: `/var/folders/bz/br99y0bj2395vd1507vwbqmm0000gn/T/codex-clipboard-103a0d56-0330-426e-98a7-81f9a705b4ff.png`.
- Implementation capture: `/private/tmp/orbit-style-color-latest.png`.
- Route: `/project/:projectId/style-color/:jobId`.
- Viewport: in-app browser default desktop viewport plus 390px responsive check.

## Fidelity and interaction checks

- Palette cards follow the reference's large color-led thumbnail, category badge, hex/RGB metadata, swatches, token role, and version rhythm.
- The nine fixed palette presets render varied presentation structures: cover, metrics, timeline, quote, comparison, roadmap, chart, agenda, and matrix.
- Font choices render actual `Aa`, Korean, Latin, and number samples with the selected font family instead of name-only selection.
- Selecting a palette updates the live slide title, layout, colors, and AI image; the selected state is exposed with `aria-pressed`.
- Korean presentation copy replaces the earlier English placeholder content across the fixed mockup data.
- AI-generated raster assets are present in the project and rendered in the strategy and roadmap slide previews.
- Mobile check: `scrollWidth` equals `clientWidth` at 390px; no horizontal overflow was observed.

## Verification

- `pnpm --filter @orbit/web typecheck` passed.
- `pnpm --filter @orbit/web exec vitest run src/features/ai-ppt/AiPptMockupPage.ui.test.ts src/features/ai-ppt/AiPptMockupPage.test.ts` passed: 14 tests.

final result: passed
