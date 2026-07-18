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
