# Rehearsal waiting screen design QA

- Source visual truth: `C:\Users\Runner\Desktop\Frame 12.png`
- Implementation screenshot: `C:\Users\Runner\.codex\visualizations\2026\07\19\019f7960-a82c-7e11-b04e-91cc188840ca\rehearsal-waiting-implementation.png`
- Combined comparison: `C:\Users\Runner\.codex\visualizations\2026\07\19\019f7960-a82c-7e11-b04e-91cc188840ca\rehearsal-waiting-comparison.png`
- Viewport: 1280 × 720 implementation; source content region normalized to the same comparison width
- State: presentation window waiting for its first presenter snapshot

## Full-view comparison evidence

The implementation matches the reference hierarchy and composition: a flat near-black surface, the existing white ORBIT logo centered in the viewport, and one concise waiting message directly below it. The responsive logo width preserves the reference proportion at desktop sizes.

## Focused region comparison evidence

A separate focused crop was not needed because the only visible content is the centered logo and one text line; both remain clearly readable in the normalized full-view comparison.

## Findings

- No actionable P0, P1, or P2 differences.
- Fonts and typography: existing Pretendard token roles preserve the reference weight and single-line hierarchy.
- Spacing and layout rhythm: centered grouping and logo-to-copy gap match the reference intent.
- Colors and visual tokens: background and foreground use `inverse-surface` and `inverse-on-surface` tokens without a custom palette.
- Image quality and asset fidelity: the existing white ORBIT logo asset is reused without recreation or distortion.
- Copy and content: secondary label and explanatory paragraph were removed; the waiting message now matches the reference wording.

## Comparison history

- Pass 1: no P0/P1/P2 findings; no post-comparison fixes required.

## Validation

- Browser-rendered waiting state inspected at the local `/present/...?...sessionId=style-preview` route.
- `PresentWindow.test.tsx`: 21 tests passed.

final result: passed

---

# Rehearsal microphone modal — Frame 13 refinement

- Source visual truth: `C:/Users/Runner/Desktop/Frame 13.png`.
- Implementation evidence: `C:/Users/Runner/.codex/visualizations/2026/07/19/019f7960-a82c-7e11-b04e-91cc188840ca/rehearsal-mic-modal-frame13.png`.
- The source and browser-rendered modal were compared together at desktop scale.
- The title and supporting copy now match the reference hierarchy, with the existing redesign title/body tokens and 32px modal padding.
- Permission and recognition steps use the existing primary, outline, success, and error tokens; the live waveform and microphone selection behavior remain intact.
- Browser verification confirmed the permission-granted state, device selector, recognition prompt, and CTA layout. `RehearsalWorkspace.test.tsx`: 113 tests passed.

final result: passed

---

# 리허설 마이크 확인 모달 design QA

## Visual truth

- 선택 시안(3번): `C:\Users\Runner\.codex\generated_images\019f7960-a82c-7e11-b04e-91cc188840ca\exec-47a9ca5d-ce47-469d-98be-944966d23a39.png`
- 파형 참고 이미지: `codex-clipboard-51d5907a-51f6-4e00-9959-b17caa28248e.png`, `codex-clipboard-c3a78fb4-4308-4b98-aab9-9c560b5b8a66.png`, `codex-clipboard-8de8efa4-31c8-46fc-bf1a-8a035288f88d.png`

## Implementation evidence

- 전체 화면: `C:\Users\Runner\.codex\visualizations\2026\07\19\019f7960-a82c-7e11-b04e-91cc188840ca\rehearsal-mic-modal.png`
- 모달 집중 화면: `C:\Users\Runner\.codex\visualizations\2026\07\19\019f7960-a82c-7e11-b04e-91cc188840ca\rehearsal-mic-modal-focused.png`
- viewport: 1440 × 1024
- 상태: 마이크 권한 허용, fake audio input 선택, 실시간 파형 활성, 음성 감지 성공, `마이크 없이 시작` 표시

## Comparison and findings

- 전체 화면과 집중 화면을 선택 시안과 나란히 비교했다.
- 제목, 설명, 3단계 계층, 중앙 모달 비율, CTA와 보조 동작의 시각적 우선순위가 시안과 일치한다.
- 사용자 요청에 따라 1단계에 실제 마이크 선택 UI를 추가했고, 2단계는 `AudioContext`/`AnalyserNode` 기반 실제 입력 파형으로 대체했다.
- 배경 페이지는 진입 위치를 유지하는 page-agnostic modal 요구 때문에 시안과 달라도 의도된 차이다.
- 별도의 P0/P1/P2 시각 결함은 확인되지 않았다. 초기 비교에서 빠졌던 `마이크 없이 시작` 보조 동작은 수정 후 재검증했다.

## Interaction verification

- 마이크 권한 허용 후 장치 목록 3개 노출 확인
- 선택한 마이크 장치 ID 저장 및 리허설 스트림 재사용 확인
- 실시간 canvas 파형 크기 396 × 82 및 입력 분석 루프 활성 확인
- `리허설 시작`의 `preflight=complete` 경로와 `마이크 없이 시작`의 `preflight=without-voice` 경로 확인
- 브라우저 `pageerror`는 없었다. 로컬 인증/API가 준비되지 않은 상태에서 기존 401/404 및 네트워크 차단 콘솔 메시지는 관찰됐으며 이번 UI 코드와 직접 관련된 오류는 아니다.
- TypeScript 검사와 `RehearsalWorkspace.test.tsx` 113개 테스트를 통과했다.

final result: passed

---

# Rehearsal display options design QA

- Source visual truth: `C:/Users/Runner/Desktop/Frame 7.png`, `C:/Users/Runner/Desktop/Frame 8.png`.
- Implementation evidence: current in-app browser capture of `/rehearsal/project_6c000fc2-a814-4c85-a5ad-bc5931ec94a6` with the display options popover open.
- State: presenter mode enabled, automatic placement disabled, fullscreen enabled, new-window display selected.

## Comparison evidence

- The source references and implementation capture were compared together at desktop scale.
- The panel measures 360px wide with 32px top/side padding and 25px bottom padding, matching the annotated reference.
- Header hierarchy, presenter-mode helper copy, switch treatment, slideshow grouping, conditional display-position surface, and bottom-anchored primary action match the reference structure.
- Turning fullscreen off removes the display-position radio group; turning presenter mode off removes the automatic-placement switch.
- Enabling automatic placement requests display permission from the original click activation before updating local UI state.
- Existing redesign color, radius, type, space, and shadow tokens are used; no new visual asset was introduced.

## Verification

- `DisplayControls.test.tsx`: 10 tests passed.
- `node node_modules/typescript/bin/tsc -p apps/web/tsconfig.json --noEmit`: passed.
- In-app browser console: no warnings or errors.
- `git diff --check`: passed with the existing LF-to-CRLF warning only.
- No P0, P1, or P2 visual mismatch remains in the requested popover states.

final result: passed

---

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

# Rehearsal timer split-surface design QA

- Source visual truth: `C:/Users/Runner/Desktop/Frame 6.png` (lower warning-state reference).
- Implementation screenshot: `D:/Projects/Orbit/.tmp/design-qa/rehearsal-timer-split.png`.
- Combined full-view comparison: `D:/Projects/Orbit/.tmp/design-qa/rehearsal-timer-split-comparison.png`.
- Focused timer comparison: `D:/Projects/Orbit/.tmp/design-qa/rehearsal-timer-split-focused-comparison.png`.
- Route: `/rehearsal/project_6c000fc2-a814-4c85-a5ad-bc5931ec94a6`.
- Viewport: 1212 x 874 CSS px.
- State: running rehearsal, default timing state. The reference shows the warning timing state.

## Full-view comparison evidence

The existing rehearsal layout, slide area, side panel, and teleprompter remain unchanged. The timer card now matches the reference hierarchy: a blue stopwatch header is directly joined to a bright timing-threshold panel inside one clipped card.

## Focused region comparison evidence

The source and implementation timer cards were placed in one focused comparison. Both use a full-width blue header, a full-width bright timing panel, two compact timing rows, and the existing rounded outer card. The implementation uses the existing 16px horizontal spacing token and 12px vertical spacing token. A separate asset comparison was unnecessary because this scoped change contains no new imagery or icons.

## Required fidelity surfaces

- Fonts and typography: existing rehearsal type tokens and hierarchy are unchanged; small timing labels remain readable on the bright surface.
- Spacing and layout rhythm: header padding is 16px; timing-panel padding is 12px 16px with a 12px row gap, matching the surrounding rehearsal spacing system.
- Colors and visual tokens: header uses `--redesign-color-primary`, the lower panel uses `--redesign-color-surface-container-lowest`, default progress uses `--redesign-color-on-surface`, warning uses the requested `#f0be36`, and danger uses `--redesign-color-error`.
- Image quality and asset fidelity: no new raster or vector asset is required; the existing Lucide controls are preserved.
- Copy and content: stopwatch and timing labels are unchanged.

## Comparison history

1. P2 - The previous state treatment placed warning/error container fills behind each row, making the compact timer visually heavy. Removed per-row containers.
2. P2 - The stopwatch and timing thresholds previously shared one blue surface, reducing hierarchy and forcing all copy to white. Split the card into blue and bright surfaces while preserving one outer card.
3. Post-fix evidence - The focused comparison shows matching surface proportions, padding, row rhythm, and outer radius. No actionable P0/P1/P2 issue remains in the requested timer region.

## Findings

No remaining P0, P1, or P2 visual issue in the requested region. The live capture is in the default state; the warning and danger selectors were verified in the loaded stylesheet, while the existing timing-state logic remains unchanged.

## Follow-up polish

- P3: capture a natural warning transition during a timed rehearsal if a final state-by-state visual archive is needed.

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

---

# 총 리허설 리포트 design QA

- Source visual truth: `C:\Users\home\.codex\generated_images\019f7622-57ed-7922-986f-c35f80971944\exec-e600489b-0396-4c86-8752-3b713953d6e9.png`.
- Implementation screenshots: `C:\Users\home\.codex\visualizations\2026\07\18\019f7622-57ed-7922-986f-c35f80971944\project-summary-final-v2.png`, `C:\Users\home\.codex\visualizations\2026\07\18\019f7622-57ed-7922-986f-c35f80971944\project-summary-final-v2-lower.png`.
- Responsive screenshot: `C:\Users\home\.codex\visualizations\2026\07\18\019f7622-57ed-7922-986f-c35f80971944\project-summary-mobile-table-v2.png`.
- Viewports: desktop 870 × 1808, focused region 870 × 900, mobile 390 × 844.
- State: 23회차 완료, 8개 슬라이드, 최신 회차와 직전 회차 비교 데이터가 있는 프로젝트.

## Comparison history

1. P1 — 721~980px 구간의 내비게이션과 사이드 레일이 세로로 쌓이고 KPI가 분리 카드 2열로 노출됐다. 프로젝트 리포트 전용 반응형 경계와 단일 4열 KPI 카드로 수정했다.
2. P1/P2 — 회차별 변화가 전체 폭 차트와 3열 미니 차트로 배치되고 슬라이드 표의 열 밀도와 썸네일 비율이 시안과 달랐다. 큰 총 소요시간 차트와 우측 3단 미니 차트, 7열 썸네일 표로 수정했다.
3. P2 — 모바일 표가 패널 전체 폭을 밀어냈다. 대시보드와 카드의 최소 폭을 해제하고 표 래퍼만 가로 스크롤되도록 수정했다.
4. 수정 후 참조 시안과 구현 화면을 동일 입력에서 재비교했으며 데스크톱과 모바일 모두 P0/P1/P2 시각 문제는 남지 않았다.

## Verification

- 헤더, 고정 회차 레일, 프로젝트 히어로, 4개 KPI, 8개 썸네일 행의 순서와 시각 계층을 참조 시안과 대조했다.
- 총 소요시간 목표 밴드와 기준선, 최댓값과 최신값 라벨, 긴 침묵·핵심 메시지·시간 초과 추이를 대조했다.
- 최신 리포트, 개선 필요 슬라이드 행, `상세 리포트에서 보기`가 모두 최신 회차 상세 리포트와 해당 슬라이드 앵커를 가리키는 것을 확인했다.
- 본문 폭 375px에서 가로 오버플로가 없고 슬라이드 표 래퍼만 309px 안에서 633px 콘텐츠를 가로 스크롤한다.
- 새로고침 시점을 기준으로 새로 발생한 console error/warn 없음.
- 비로그인 QA 상태는 아바타 대신 기존 `로그인` 버튼을 사용하며 다음 행동 카드는 실제 상세 리포트 이동 CTA를 유지한다.

final result: passed

---

# 발표 개선 요약 시각화 design QA

- Source visual truth: `codex-clipboard-2efec99c-2335-49a9-93ab-31cbeb1173dd.png`와 생성된 `발표 변화` 지표 시안.
- Implementation surface: `RehearsalProjectOverviewPage`, `RehearsalProjectSummaryDashboard`.
- QA state: 실제 컴포넌트와 6회차 고정 fixture를 사용한 임시 Vite 진입점이며 캡처 후 제거했다.

## Comparison history

1. 데스크톱 1440×900에서 시안과 구현 KPI를 같은 입력으로 비교했다. 4개 지표의 이전→현재 아이콘 흐름, 큰 수치, 개선 문구 계층이 일치했다.
2. 우선 행동 배너 참조 이미지와 구현을 같은 입력으로 비교했다. 배너가 개선 요약 바로 위에 배치되고 상세 리포트 CTA를 유지했다.
3. 태블릿 820×1000에서 KPI가 2열로, 모바일 390×844에서 1열로 전환됨을 확인했다.
4. 태블릿과 모바일 모두 document `scrollWidth`와 `clientWidth`가 같아 가로 오버플로가 없었다.

## Accessibility and behavior

- 각 KPI는 단위, 비교 기준, 개선량을 포함한 전체 `aria-label`을 유지한다.
- 우선 행동 배너는 `다음 연습 우선 행동` 레이블을 제공한다.
- 렌더링 테스트로 우선 행동 배너가 KPI 요약보다 DOM에서 먼저 오는지 검증한다.
- 누적 지표가 모두 미측정이고 비교 이슈가 없는 슬라이드는 `측정 불가`로 표시한다.

final result: passed

---

# 리허설 회차별 총 소요시간 차트 design QA

- Route: `http://localhost:5174/reports/project_66b1fbe6-5543-441a-9b39-cecd9ef51e41`.
- Source visual truth: 사용자가 제공한 기존 차트 화면.
- QA state: 로그인된 로컬 5174 화면의 실제 렌더링.

## Findings

- 주요 회차 라벨을 14px 굵은 글씨로 표시해 가독성을 높였다.
- 마지막 회차와 가까운 중간 눈금을 생략해 `21회차`와 `23회차`가 붙지 않는다.
- 목표 라벨을 차트 왼쪽으로 옮겨 최신 값 `8:42`와 분리했다.
- 총 리허설 리포트의 8개 슬라이드가 실제 Deck 화면으로 렌더링된다.
- 관련 Vitest 10개와 Web TypeScript 검사를 통과했다.

final result: passed
