# ORBIT Mockup Flow Design QA

## 비교 대상

- 로그인 전 source: `/Users/donghyunkim/.codex/generated_images/019f4a82-dbb4-70c1-b088-38f82789210b/exec-813a2241-cc11-4589-a67b-9b002f4eae49.png`
- 로그인 후 source: `/Users/donghyunkim/.codex/generated_images/019f4a82-dbb4-70c1-b088-38f82789210b/exec-be17a163-6a55-4778-a1b6-e7059ac4ccb0.png`
- AI 생성 source: `/Users/donghyunkim/.codex/generated_images/019f4a82-dbb4-70c1-b088-38f82789210b/exec-839e99ea-3b50-4682-ae84-c4ca481d7dc0.png`
- 구현 route: `/mockup`, `/mockup/home`, `/mockup/create`
- Desktop viewport: 1440×1024
- Mobile viewport: 390×844 (document client width 375px)

## 구현 캡처

- 로그인 전: `artifacts/mockups/public-desktop-v2.jpg`, `artifacts/mockups/public-mobile.jpg`
- 로그인 후: `artifacts/mockups/home-desktop.jpg`, `artifacts/mockups/home-mobile.jpg`
- AI 생성 입력·검토·완료: `artifacts/mockups/create-desktop.jpg`, `artifacts/mockups/create-review-desktop.jpg`, `artifacts/mockups/create-success-desktop.jpg`, `artifacts/mockups/create-mobile.jpg`

## 비교 근거

- Full-view: `artifacts/mockups/public-comparison.png`, `artifacts/mockups/home-comparison.png`, `artifacts/mockups/create-comparison.png`
- Focused region: `artifacts/mockups/public-focus.png`, `artifacts/mockups/home-focus.png`, `artifacts/mockups/create-focus.png`
- 세 source와 구현 캡처를 원본 해상도로 열어 hero, header, 주요 CTA, surface hierarchy, content density를 직접 비교했다.

## 화면별 fidelity

### 로그인 전 메인

- 얇은 흰 header, 큰 editorial headline, 라일락 제품 preview, 검은 프로세스 strip, 라임·크림 feature panel 순서를 유지했다.
- Source의 제품 이미지는 실제 DOM preview로 구현해 텍스트와 구조를 선명하게 유지했다.
- 리허설 섹션에는 생성한 고해상도 editorial photo를 사용했고 CSS drawing이나 placeholder로 대체하지 않았다.
- `무료로 발표 만들기`는 로그인 후 프로젝트 허브로, `예시 보기`는 프로세스 영역으로 이동한다.

### 로그인 후 프로젝트 허브

- Source의 큰 환영 문구, 검은 AI CTA, 이어서 작업하기 strip, 프로젝트 table, 라임·크림 시작 card의 우선순위를 유지했다.
- 검색과 단계 필터를 실제 동작하게 구현해 프로젝트 탐색 경로를 짧게 만들었다.
- 가짜 사진 avatar 대신 공통 Tabler user icon과 이름을 사용했다.

### AI 발표자료 만들기

- Source의 라일락 workspace, 검은 입력 panel, segmented start mode, 단계 표시, 넓은 하단 action 구조를 유지했다.
- UX 확인을 위해 `입력 → 구성 검토 → 생성 완료`의 세 상태를 구현했다.
- 입력 field, 발표 유형·분량 select, 자료 첨부, 시작 방식 전환, 이전 단계가 모두 동작한다.

## 필수 fidelity surface

### Typography and wrapping

- 디자인 시스템의 Pretendard → Inter → system sans-serif fallback과 display scale을 사용했다.
- 한국어 heading은 `word-break: keep-all`로 단어 중간 분리를 방지했다.
- Desktop과 mobile에서 label, table, step indicator의 clipping이 없다.

### Spacing and responsive layout

- 1280px 중심 canvas와 넓은 section rhythm을 세 화면에 공통 적용했다.
- Mobile에서는 hero, panel, table/action 구조가 단일 column으로 재배치된다.
- 세 mobile route 모두 `clientWidth=375`, `scrollWidth=375`로 global horizontal overflow가 없다.

### Colors and components

- Ink `#090909`, Lilac `#c5b0f4`, Lime `#dceeb1`, Cream `#f4ecd6`, Mint `#c8e6cd`, Navy `#1f1d3d`의 semantic role을 유지했다.
- Button, status, field, segmented control, upload, table을 기존에 만든 디자인 시스템 component로 구성했다.
- UI icon은 Tabler outline family로 통일했다.

## 상호작용 검증

- `/mockup`의 `무료로 발표 만들기` → `/mockup/home` 이동 확인.
- `/mockup/home`의 검색어 `IR Deck` 입력 시 1개 행, 단계 `리허설 중` 선택 시 1개 행으로 필터링 확인.
- `/mockup/home`의 `AI 발표자료 만들기` → `/mockup/create` 이동 확인.
- `/mockup/create`의 `자료로 시작` 선택 후 `aria-pressed="true"` 확인.
- `구성 확인` → 검토 화면, `이 구성으로 생성` → 완료 화면, `프로젝트 허브로` → 홈 복귀 확인.
- Desktop console warning/error 0건.

## Comparison history

- 1차 로그인 전 비교에서 hero 한국어 headline이 단어 중간에서 과도하게 분리되고 header primary CTA의 배경이 투명해지는 P2 차이를 발견했다.
- Headline에 `word-break: keep-all`과 조정된 display scale을 적용하고, header의 투명 button selector를 첫 번째 보조 action으로 한정했다.
- 2차 비교 `public-desktop-v2.jpg`에서 CTA 대비와 headline cadence가 source 수준으로 회복됨을 확인했다.
- Mobile AI 생성 화면의 heading wrapping도 같은 규칙으로 보정하고 최신 캡처에서 수평 overflow 0px를 재확인했다.

## 남은 차이

- P0/P1/P2 finding 없음.
- P3: 생성 source의 미세한 raster gradient는 재사용 가능한 solid semantic color로 정규화했다.
- P3: 로그인 후 filter는 빠른 UX 검토 목적에 맞게 검색과 단계만 노출했다.
- P3: 로그인 전 제품 preview는 정적인 source raster 대신 실제 DOM으로 재구성했다.

## 검증 명령

- `pnpm --filter @orbit/web typecheck` 통과.
- `APP_ENV=test API_BASE_URL=http://localhost:3000 WEB_PORT=5173 pnpm --filter @orbit/web test` 통과: 95 files, 669 tests.
- `APP_ENV=test API_BASE_URL=http://localhost:3000 WEB_PORT=5173 pnpm --filter @orbit/web build` 통과. 기존 bundle size warning만 남는다.
- `git diff --check` 통과.

## 에디터 목업 추가 QA

### 비교 대상

- Source visual truth: `artifacts/design-system-desktop-top.png`
- Structural source: `apps/web/src/features/editor/shell/EditorShell.tsx`, `apps/web/src/features/editor/editor-shell.css`
- Implementation route: `http://localhost:5174/mockup/editor`
- Desktop screenshot: `artifacts/mockups/editor-desktop-v3.png`
- Mobile screenshot: `artifacts/mockups/editor-mobile-final-v2.png`
- Full-view comparison: `artifacts/mockups/editor-design-system-comparison.png`
- Focused comparison: `artifacts/mockups/editor-design-system-focus.png`
- Viewport: desktop 1440×1024, mobile 390×844
- State: slide 1 selected, select tool active, AI coach active, suggestion unapplied

### Full-view comparison evidence

- 디자인 시스템의 흰 canvas, 검은 primary action, 라일락 핵심 작업면, 얇은 hairline, 낮은 shadow 위계를 에디터 전체에 유지했다.
- 기존 에디터의 슬라이드 rail, 중심 canvas, 우측 inspector 구조는 보존하되 topbar를 문서 수준 작업과 canvas 도구의 두 행으로 분리했다.
- 캔버스 주변의 neutral surface가 실제 슬라이드 색면과 명확히 분리되어 편집 대상이 가장 먼저 보인다.
- 버튼과 icon은 Tabler outline family와 ORBIT pill/control radius를 사용한다.

### Focused comparison evidence

- Source의 display weight, lilac block, black pill action을 구현의 slide canvas와 AI suggestion card에 나란히 비교했다.
- Lilac `#c5b0f4`, lilac soft, ink, border가 같은 semantic 역할로 적용됐다.
- 작은 panel text는 display typography를 축소 복제하지 않고 body-small 계층을 사용해 inspector 밀도를 유지했다.

### 필수 fidelity surface

- Fonts and typography: Pretendard → Inter → system sans-serif를 유지하고 slide title만 650 display weight와 negative tracking을 사용한다. Mobile canvas에서는 subtitle과 metrics를 숨겨 title clipping을 방지했다.
- Spacing and layout rhythm: desktop 224px slide rail, fluid canvas, 304px inspector의 3열 구조다. 390px에서는 86px thumbnail rail과 bottom inspector navigation으로 재배치한다.
- Colors and visual tokens: ORBIT semantic token만 사용한다. Black은 완료 행동, lilac은 active/AI/core workspace, lime/cream/navy는 slide theme 역할이다.
- Image quality and asset fidelity: ORBIT logo는 기존 raster asset을 사용했다. 에디터 목업에는 별도 illustration/photo asset이 없으며 UI icon은 모두 Tabler package를 사용한다.
- Copy and content: 프로젝트, 슬라이드, AI 제안, 발표 메모 문구는 현재 발표 편집 흐름에 맞는 현실적인 한국어 mock data다.

### 상호작용 검증

- 슬라이드 선택과 새 슬라이드 추가 확인: 6개에서 7개로 증가.
- 편집 도구 선택 시 `aria-pressed`와 canvas cursor label 변경 확인.
- `AI 제안 적용` 후 `적용됨` 상태와 slide title 변경 확인.
- `디자인` tab, 색상 theme selection, `메모` tab과 저장 동작 확인.
- `발표하기`가 `/mockup/presenter`로 이동하고 발표자 모드의 `발표 종료` dialog가 열림을 확인.
- 프로젝트 허브의 `계속 편집`과 AI 생성 완료의 `에디터에서 열기`가 모두 `/mockup/editor`로 이동함을 확인.
- Mobile `clientWidth=390`, `scrollWidth=390`, `clientHeight=844`, `scrollHeight=844`로 viewport overflow 없음.

### Comparison history

- 1차 desktop 비교에서 topbar의 `편집 중` status가 세로로 줄바꿈되는 P2 문제를 발견했다.
- Status에 flex 고정과 `white-space: nowrap`을 적용한 뒤 `editor-desktop-v3.png`에서 한 줄 pill로 회복됨을 확인했다.
- 1차 mobile 비교에서 `발표하기` primary action이 우측에서 잘리고 canvas body·metrics가 겹치는 P2 문제를 발견했다.
- Mobile에서 문서 제목과 보조 action을 숨기고 primary action을 유지했으며, canvas는 eyebrow와 title만 노출하도록 조정했다.
- `editor-mobile-final-v2.png`에서 primary action, canvas title, bottom panel navigation이 clipping 없이 보이고 수평 overflow가 없음을 확인했다.

### Findings

- P0/P1/P2 finding 없음.
- P3: 390px portrait에서는 편집보다 검토·발표 전환을 우선하며 inspector의 상세 form은 tab 선택 후 별도 sheet로 확장하는 다음 단계가 필요하다.
- P3: 실제 Konva selection box, drag, resize는 목업 범위에서 제외하고 tool selection과 state preview만 구현했다.

### 디자인 시스템 채택 확인

- `apps/web/src/main.tsx`가 ORBIT 디자인 시스템 CSS를 전역 로드한다.
- `apps/web/src/design-system/index.ts`가 신규 화면의 공식 import surface다.
- application semantic token compatibility layer가 surface, text, border, action, font, radius를 ORBIT token에 연결한다.
- `docs/orbit-design-system.md`에 에디터 규칙과 현재 시스템 채택 규칙을 추가했다.

## Browser annotation revision QA

### Source and implementation

- Source visual truth: Browser Comment 2의 Google Slides 상단 chrome 첨부 이미지와 Comment 1·3의 annotated editor screenshots.
- Pre-change implementation screenshot: `artifacts/mockups/editor-desktop-v3.png`
- Revised implementation screenshot: `artifacts/mockups/editor-google-toolbar-final.png`
- Revised mobile screenshot: `artifacts/mockups/editor-google-toolbar-mobile-final.png`
- Full-view before/after comparison: `artifacts/mockups/editor-annotation-comparison.png`
- Focused toolbar comparison: `artifacts/mockups/editor-toolbar-annotation-focus.png`
- Desktop viewport: 1984×1324, matching the browser annotation viewport.
- Mobile viewport: 390×844.
- State: slide 1 selected, select tool active, AI coach active, suggestion unapplied.

### Findings and comparison history

- [P2 resolved] 제목 옆 `편집 중` pill이 title baseline과 분리되어 떠 보였다. Pill을 제거하고 title row 안에 `저장됨` icon+text를 배치해 문서 상태를 한 baseline으로 정렬했다.
- [P2 resolved] 기존 상단 2행이 모두 흰색 평면이라 문서 작업과 캔버스 도구의 구분이 약했다. 문서 제목·메뉴·협업 action을 첫 영역으로 묶고, 실행 취소와 편집 도구는 neutral surface의 14px rounded tool dock으로 분리했다.
- [P2 resolved] 오른쪽 inspector, slide rail, tool label의 작은 글씨가 1984px viewport에서 읽기 어려웠다. Panel body는 12px, list title 13px, section title 14px 이상으로 올리고 thumbnail text도 각 1px 확대했다.
- Post-fix evidence: `editor-google-toolbar-final.png`에서 title, save state, menu row, right actions가 수직 충돌 없이 정렬되며 tool dock이 독립된 surface로 보인다.
- Mobile post-fix evidence: `editor-google-toolbar-mobile-final.png`에서 document menu는 접고 primary `발표하기`와 icon tool dock을 유지하며 `clientWidth=390`, `scrollWidth=390`이다.

### Required fidelity surfaces

- Fonts and typography: 기존 Pretendard/Inter stack은 유지했고 dense editor text만 한 단계 확대했다. Title과 menu는 각각 16px/13px, inspector hierarchy는 11–17px 범위다.
- Spacing and layout rhythm: Document header 80px와 tool dock 54px을 분리했다. Tool dock은 viewport 양옆 12px inset, 14px radius, 34px control height를 사용한다.
- Colors and visual tokens: ORBIT Ink primary, Lilac selected state, neutral surface, subtle border 역할을 유지한다. Google Slides의 blue palette는 복제하지 않았다.
- Image quality and asset fidelity: 기존 ORBIT raster logo를 유지하고 모든 신규 icon은 Tabler outline family에서 사용했다. 별도 placeholder나 CSS illustration은 없다.
- Copy and content: 파일/수정/보기/삽입/서식/슬라이드/정렬/도구/도움말과 저장됨 상태는 문서 편집 문맥에 맞는 실제 UI copy다.

### Interaction and browser verification

- `AI 제안 적용` 후 `적용됨` 상태 확인.
- `발표하기` → `/mockup/presenter` 진입과 발표자 모드의 `발표 종료` dialog 확인.
- Browser console warning/error 0건.
- Desktop `clientWidth=1984`, `scrollWidth=1984`, `clientHeight=1324`, `scrollHeight=1324`.
- Mobile `clientWidth=390`, `scrollWidth=390`, `clientHeight=844`, `scrollHeight=844`.

### Documentation impact

- 공통 color, radius, button token은 변경하지 않았다.
- `docs/orbit-design-system.md`의 에디터 chrome, save-state alignment, tool dock, minimum dense-editor type size 규칙을 갱신했다.
- 기존 코드베이스 `DESIGN.md`는 이 디자인 시스템의 source로 사용하지 않았고 변경하지 않았다.

### Remaining findings

- P0/P1/P2 finding 없음.
- P3: 좁은 화면에서는 문서 메뉴와 inspector body를 접고 검토·발표 동작을 우선한다.

## Rehearsal and presenter mockup QA

### Source and implementation

- Rehearsal structural source: `artifacts/mockups/rehearsal-current-source.png`, `apps/web/src/features/rehearsal/panel/RehearsalPanel.tsx`
- Rehearsal implementation: `artifacts/mockups/rehearsal-desktop-v1.png`, route `/mockup/rehearsal`
- Rehearsal comparison: `artifacts/mockups/rehearsal-comparison.png`
- Presenter visual-language source: `artifacts/design-system-desktop-top.png`, `apps/web/src/features/rehearsal/presenter/PresenterRemoteWindow.tsx`
- Presenter implementation: `artifacts/mockups/presenter-white-logo-final.png`, route `/mockup/presenter`
- Presenter comparison: `artifacts/mockups/presenter-comparison.png`
- Dark logo source: `/Users/donghyunkim/Downloads/orbit-logo-white.png`
- Dark logo focused comparison: `artifacts/mockups/presenter-logo-focus.png`
- Mobile captures: `artifacts/mockups/rehearsal-mobile-v1.png`, `artifacts/mockups/presenter-mobile-v1.png`
- Desktop viewport: 1440×1024. Mobile viewport: 390×844.

### Full-view comparison evidence

- Rehearsal keeps the existing preflight's slide readiness, microphone, script and timing concepts while moving the active practice state into a clear `slide + teleprompter + AI coach` hierarchy.
- Presenter mode maps the design system palette into a focused Ink surface. Current slide is the brightest and largest region; next slide, notes and current cue remain visible without competing with it.
- Both screens preserve the editor's project identity and connect directly from its `리허설` and `발표하기` actions.

### Focused comparison evidence

- The supplied white ORBIT logo and presenter header were placed in one dark comparison board. The implementation uses the exact 815×355 raster asset, at the original aspect ratio, without a white pill or CSS recoloring.
- Rehearsal's live coaching panel uses the same Lilac active state, Lime coaching surface, neutral borders, pill actions and 12–15px dense-editor typography defined by the system.

### Required fidelity surfaces

- Fonts and typography: Pretendard/Inter stack, 12–16px tool and coaching text, and the existing editorial slide title treatment are preserved. Presenter notes use 16px/1.65 for glance readability.
- Spacing and layout rhythm: rehearsal is a fluid stage plus 354px coach panel; presenter is a fluid stage plus 340px cue rail. Both use 12–18px panel gaps and 12–16px radii.
- Colors and tokens: rehearsal uses Canvas/Surface/Lilac/Lime; presenter uses Ink with subtle white borders and Lilac playback control. Slide foreground colors are explicitly owned by each slide theme.
- Image quality and asset fidelity: both official logos are real raster assets. The new white logo loads at natural size 815×355 and is shown without a substitute or generated approximation.
- Copy and content: realistic Korean speaker notes, key phrases, timing, WPM, microphone state, current cue and completion summaries match the presentation workflow.

### Comparison history

- [P1 resolved] First presenter capture inherited the parent dark surface's white foreground into Lime and Cream slides, making slide content low contrast. Explicit Ink foreground rules were added for Lilac, Lime, Cream and Canvas slide themes; `presenter-white-logo-final.png` confirms readable black content.
- [P2 resolved] The first presenter header placed the standard dark-text logo inside a white pill. The user supplied `orbit-logo-white.png`; the exact asset now sits directly on Ink with clear space and no container.
- No P0/P1/P2 findings remain.

### Interaction and browser verification

- Rehearsal: start → voice-recognition state → next slide → completion dialog verified.
- Presenter: pause/continue, next slide, blank audience screen and end dialog verified.
- Editor `리허설` → `/mockup/rehearsal`, `발표하기` → `/mockup/presenter` verified.
- Browser console warning/error 0.
- Desktop routes: `clientWidth=1440`, `scrollWidth=1440`, `clientHeight=1024`, `scrollHeight=1024`.
- Mobile routes: `clientWidth=390`, `scrollWidth=390`, `clientHeight=844`, `scrollHeight=844`.
- 95 test files, 669 tests and production build passed. Existing bundle-size warning remains.

### Documentation and system impact

- `docs/orbit-design-system.md` now defines rehearsal, presenter-mode and light/dark logo rules.
- `/design-system` shows the light and dark logo assets together; both load at natural size 815×355.
- Product Design saved context now records `orbit-logo-white.png` as the canonical dark-surface brand asset.
- Existing `DESIGN.md` was not used as a source and was not changed.

### Remaining P3

- Real microphone permission, STT, display selection and cross-window synchronization remain outside the visual mockup scope.

## Rehearsal display selection QA

### Source and implementation

- Source visual truth: `artifacts/mockups/rehearsal-display-source.png`, the approved rehearsal mockup before opening display settings.
- Existing behavior reference: `apps/web/src/features/rehearsal/presenter/DisplayControls.tsx` (`발표자 보기`, separate slide window and fullscreen/display options).
- Implementation: `artifacts/mockups/rehearsal-display-panel.png`, route `/mockup/rehearsal`, `발표 화면 설정` open.
- Full-view combined comparison: `artifacts/mockups/rehearsal-display-comparison.png`.
- Slideshow implementation: `artifacts/mockups/rehearsal-slideshow.png`.
- Mobile focused evidence: `artifacts/mockups/rehearsal-display-panel-mobile.png`, 390×844.
- Desktop evidence viewport: 2090×1164. Mobile evidence viewport: 390×844.

### Full-view comparison evidence

- The base rehearsal composition, stage, teleprompter and coach panel remain unchanged when the feature is closed. `화면 설정` occupies the former presenter-mode action slot without changing the header hierarchy.
- When open, the right drawer overlays rather than reflows the rehearsal workspace, so slide context remains visible while choosing an output mode.
- The panel preserves the current ORBIT system: Lilac selected surface, Ink primary action, neutral border cards, 12–15px control text and Tabler outline icons.

### Focused region comparison evidence

- The panel is the new focused region: `발표자 모드` and `슬라이드쇼 화면` are one explicit radiogroup with a single checked state, short outcome descriptions and a mode-specific Primary action.
- Device availability is separated into a quiet summary row, keeping the main decision limited to the two requested modes.
- On 390×844, the drawer becomes a bottom sheet; both option cards and the sticky action remain visible with `scrollWidth=390`.

### Required fidelity surfaces

- Fonts and typography: panel heading is 22px desktop/20px mobile; option titles are 15px and descriptions are 12px/1.55. These values match the existing dense-editor minimums and remain readable on mobile.
- Spacing and layout rhythm: 28px desktop drawer padding, 10px card gaps, 14px card radius and a bottom-aligned action area preserve ORBIT panel rhythm without crowding the decision.
- Colors and visual tokens: selection uses `Lilac Soft` plus `Lilac Strong`; availability uses the existing success status; the slideshow uses Ink with subtle white borders.
- Image quality and asset fidelity: slideshow uses the canonical `orbit-logo-white.png` directly on Ink. All controls use Tabler icons; no placeholder or custom CSS icon substitutes were introduced.
- Copy and content: labels clearly distinguish presenter tools from audience-only slides, and the CTA updates to `발표자 모드 열기` or `슬라이드쇼 열기` after selection.

### Interaction and browser verification

- `화면 설정` → mode selection → `슬라이드쇼 열기` verified.
- Slideshow previous/next controls and `Esc` close verified; close returns to the unchanged rehearsal state.
- `발표자 모드 열기` navigates to `/mockup/presenter`.
- Desktop and mobile body dimensions match their viewports with no horizontal overflow.
- Browser console error count: 0.

### Comparison history

- No actionable P0/P1/P2 differences were found in the first same-state combined comparison, so no visual-fix iteration was required.
- P3: the mock device row represents availability only; real browser screen enumeration and automatic monitor placement remain production integration work.

## Rehearsal report flow QA

### Source and implementation

- Rehearsal transition source: `artifacts/mockups/rehearsal-display-source.png`, the approved ORBIT rehearsal workspace.
- Report-list visual-language source: `artifacts/mockups/home-desktop.jpg`, the approved authenticated ORBIT list/table screen.
- Existing report content source: `artifacts/mockups/report-current-source.png`, route `/report_mockup`.
- Implementations: `artifacts/mockups/report-transition-desktop.png`, `artifacts/mockups/report-list-desktop.png`, `artifacts/mockups/report-detail-desktop.png`.
- Full-view combined comparison: `artifacts/mockups/report-flow-comparison.png`.
- Focused detail comparison: `artifacts/mockups/report-detail-focus-comparison.png`.
- Additional state: `artifacts/mockups/report-detail-timeline.png`.
- Mobile evidence: `artifacts/mockups/report-transition-mobile.png`, `artifacts/mockups/report-list-mobile.png`, `artifacts/mockups/report-detail-mobile.png`.
- Desktop evidence viewport: 2090×1164. Mobile evidence viewport: 390×844.

### Full-view comparison evidence

- The transition screen inherits the rehearsal workspace's project identity, calm Surface background, Ink/Lilac/Lime hierarchy and pill actions, while replacing the practice workspace with a focused completion decision.
- The report list keeps the approved home screen's broad heading, highlighted continuation surface and dense table pattern; it reassigns those elements to recent results, score trend and next-practice focus.
- The detail page preserves the existing report's AI summary and four primary metrics but reduces the first viewport from a long document to `score + AI summary + metrics + actionable tabs`.

### Focused region comparison evidence

- The focused detail board places the existing report hero/AI summary/KPI block beside the new implementation. The new version retains the same data meaning while increasing scan hierarchy with Lilac score and Lime summary surfaces.
- Metric labels remain visible above values, comparison copy remains directly below, and `다시 리허설` stays a persistent hero action.
- No product imagery is required. The official ORBIT logo is reused and all interaction symbols come from Tabler Icons.

### Required fidelity surfaces

- Fonts and typography: the Pretendard/Inter stack is unchanged. Desktop titles use 38–44px with tight editorial tracking; dense list/detail labels remain 10–13px and body guidance uses 11–16px with readable line heights. Mobile headings reflow at 32–34px without clipping.
- Spacing and layout rhythm: all three screens use the existing 68px header, 12–16px radii, 14–34px section gaps and restrained 1px borders. Mobile collapses wide grids to one or two columns and keeps primary actions at practical tap sizes.
- Colors and visual tokens: Lilac identifies score/recency, Lime identifies AI insight, Cream identifies the next action, Success/Warning identify coaching outcomes. No new palette or gradient was introduced.
- Image quality and asset fidelity: `orbit-logo.png` is used directly at its natural aspect ratio. No placeholder image, CSS illustration, handcrafted SVG or substitute icon appears.
- Copy and content: realistic Korean report data covers completion, trend, duration, WPM, keyword coverage, filler words, strengths, improvements, slide-level evidence and the next rehearsal goal.

### Interaction and browser verification

- Rehearsal `리허설 종료` → completion dialog → `리포트 보기` routes to `/mockup/rehearsal-complete`; `리포트 목록` and `리포트 확인하기` continue to the requested screens.
- Report search narrows four rows to one matching result. `점수 향상` filters the list to two improved sessions.
- Selecting a report routes to `/mockup/report`. `핵심 피드백`, `슬라이드 분석`, and `발표 기록` each render their corresponding content.
- Desktop body width equals viewport width on all three routes. Mobile `scrollWidth=375` within the 390px viewport on all three routes; vertical scroll is intentional for report content.
- Browser console error count: 0.

### Findings and comparison history

- [P2 resolved] The first 390×844 transition capture composited the 97%-opaque sticky header over a black screenshot surface, hiding the dark logo wordmark. `report-mockup-header` now uses an opaque white background; `report-transition-mobile.png` confirms the full logo, avatar and divider are visible.
- No P0/P1/P2 findings remain after the header fix.
- P3: PDF export is represented as a visual control only; real document generation remains outside the design-mockup scope.

## Live presentation flow QA

### Source and implementation

- Audience-display source: `artifacts/mockups/rehearsal-slideshow.png`, the approved ORBIT fullscreen slideshow treatment.
- Presenter-mode source: `artifacts/mockups/presenter-white-logo-final.png`, the approved ORBIT dark presenter workspace.
- Implementations: `artifacts/mockups/live-presentation-desktop.png`, route `/mockup/live`; `artifacts/mockups/live-presenter-desktop.png`, route `/mockup/live-presenter`.
- Full-view combined comparison: `artifacts/mockups/live-flow-comparison.png`.
- Focused presenter comparison: `artifacts/mockups/live-presenter-focus-comparison.png`.
- End state: `artifacts/mockups/live-presenter-end-dialog.png`.
- Mobile evidence: `artifacts/mockups/live-presentation-mobile.png`, `artifacts/mockups/live-presenter-mobile.png`.
- Desktop evidence viewport: 2090×1164. Mobile evidence viewport: 390×844.

### Full-view comparison evidence

- The audience screen preserves the approved Ink stage and dominant 16:9 slide, then adds only live state, connection, navigation and fullscreen controls at the perimeter.
- The presenter screen preserves the current/next/notes hierarchy and Lilac playback control. The rehearsal-only current cue is intentionally replaced with audience count, questions and speaking requests.
- Both screens use the same official white ORBIT logo directly on the dark surface and keep slide colors independent from the presenter theme.

### Focused region comparison evidence

- The focused comparison confirms the same 64px dark header, central timer, high-contrast exit action, large current slide and 340px supporting rail.
- Live state is visible as a compact Coral `LIVE` badge without competing with the presentation title. Connection status remains text plus a real Tabler icon.
- Current and next slide labels, counts, speaker notes and persistent lower controls retain the established glance hierarchy.

### Required fidelity surfaces

- Fonts and typography: Pretendard/Inter remains the UI stack and JetBrains Mono remains the timer/count stack. Dense live controls stay at 10–13px while active speaker notes remain 14px/1.6 for distance readability.
- Spacing and layout rhythm: the audience view uses a 64/72px header-footer frame; presenter uses 64/76px. The 16px presenter grid, 340px rail and 10–12px support-card radii match the approved presenter proportions.
- Colors and visual tokens: Ink and subtle white borders define the operational shell; Lilac identifies playback, Coral identifies live state and Mint/green identifies connection. Slide palettes remain explicitly owned by each slide.
- Image quality and asset fidelity: the exact `orbit-logo-white.png` is used. All controls use Tabler outline icons; no custom SVG, CSS illustration or placeholder asset was introduced.
- Copy and content: live status, audience connection, 12 participants, three questions, one speaking request, current/next slide, notes, timer, synchronization and exit confirmation form a coherent real-presentation workflow.

### Interaction and browser verification

- Audience screen previous/next, blank/unblank and presenter-mode navigation verified.
- Presenter pause/continue, blank audience screen and end-confirmation dialog verified.
- `발표자 모드` routes to `/mockup/live-presenter`; `청중 화면` routes back to `/mockup/live`.
- Both desktop routes match viewport width/height. Both mobile routes report `390×844` with `scrollWidth=390` and no clipped persistent controls.
- Browser console error count: 0.

### Findings and comparison history

- No actionable P0/P1/P2 differences were found in the first same-state combined comparison, so no visual-fix iteration was required.
- P3: audience counts and questions are realistic static mock data; realtime session transport remains outside the design-mockup scope.

## Authentication mockup QA

### Source and implementation

- Existing authentication source: `artifacts/mockups/auth-current-source.png`, route `/login` before the mockup redesign.
- Approved visual-language reference: `artifacts/mockups/public-desktop-v2.jpg` and the current ORBIT design-system tokens.
- Implementations: `artifacts/mockups/auth-login-desktop.png`, route `/mockup/login`; `artifacts/mockups/auth-signup-desktop.png`, route `/mockup/signup`.
- Full-view combined evidence: `artifacts/mockups/auth-flow-comparison.png`.
- Focused form evidence: `artifacts/mockups/auth-form-focus-comparison.png`.
- Mobile evidence: `artifacts/mockups/auth-login-mobile.png`, `artifacts/mockups/auth-signup-mobile.png`.
- Desktop browser viewport: 2090×1164. Responsive verification viewport: 390×844.

### Full-view comparison evidence

- The former centered utility card is replaced by a clear two-part desktop composition: the approved Lilac brand/value surface and a quiet white task surface. This makes account access feel part of the ORBIT product rather than an isolated system form.
- Login and signup share one shell, spacing rhythm and transition location, so switching intent does not force the user to relearn the screen.
- On mobile, the value proposition collapses and the form becomes the first task. DOM measurements confirm no horizontal overflow and a full-width 44px primary action.

### Focused region comparison evidence

- The focused board places the old form, new login and new signup together at readable size. Labels, icons, input borders, password affordance, social action, divider and primary action use one consistent hierarchy.
- Login keeps secondary decisions on one line: persistent-session choice on the left and password recovery on the right. Signup groups legal choices on a neutral surface and distinguishes required and optional copy.
- The official ORBIT logo raster is used directly and every interface symbol is from Tabler Icons. No custom SVG, CSS illustration, emoji or placeholder imagery was introduced.

### Required fidelity surfaces

- Fonts and typography: Pretendard/Inter remains the UI stack. Form titles use 40px desktop and 34px mobile; labels use 12px/700; input and action text use 13px with restrained tracking and readable Korean wrapping.
- Spacing and layout rhythm: desktop uses a 420/560px minimum two-column contract, a 520px maximum form, 46–48px fields and 12–22px section gaps. Mobile uses 18px page gutters and collapses the name/email row without changing task order.
- Colors and visual tokens: Lilac carries the brand and focused states; Ink is the single primary action; Surface, Border Strong, Danger Soft and Success retain their existing semantic roles. No new palette or gradient was added.
- Image quality and asset fidelity: `orbit-logo.png` is loaded at its natural aspect ratio. The screen contains no decorative or product imagery that requires substitution.
- Copy and content: login copy emphasizes returning to saved work; signup copy emphasizes reaching the first presentation. Error messages identify missing credentials, minimum password length and required agreement separately.

### Interaction and browser verification

- Login: empty submit shows the combined credentials error; password visibility toggles from `password` to `text`; valid credentials route to `/mockup/home`.
- Signup: empty submit shows the required-fields error; valid fields without consent show the required-terms error; accepting required terms routes to `/mockup/home`.
- Login ↔ signup transition actions route in both directions. Public-page `로그인` and `무료로 시작` actions now target the corresponding mockups.
- At 390×844, login reports `scrollWidth=390`; signup reports `scrollWidth=375` inside the viewport with intentional vertical scrolling only. Primary actions remain 44px high.
- Browser console error count: 0.

### Findings and comparison history

- No actionable P0/P1/P2 differences were found in the first combined full-view and focused-form comparison, so no visual-fix iteration was required.
- P3: Google authentication, password recovery and server-side account creation remain visual mock interactions; production identity-provider integration is outside this mockup scope.

## Microphone permission check QA

### Source and implementation

- Source visual truth: `artifacts/mockups/rehearsal-display-source.png`, the approved ORBIT rehearsal workspace that follows this check.
- Entry-point source: `artifacts/mockups/microphone-check-source-editor.png`, the approved editor chrome and rehearsal action.
- Implementations: `artifacts/mockups/microphone-check-idle-desktop.png`, `artifacts/mockups/microphone-check-ready-desktop.png`, and `artifacts/mockups/microphone-check-blocked-desktop.png`, route `/mockup/microphone-check`.
- Full-view combined evidence: `artifacts/mockups/microphone-check-comparison.png`.
- Focused state comparison: `artifacts/mockups/microphone-check-state-focus-comparison.png`.
- Mobile evidence: `artifacts/mockups/microphone-check-idle-mobile.png` and `artifacts/mockups/microphone-check-ready-mobile.png`.
- Desktop browser viewports: 2090×1162 and 1440×900. Responsive verification viewport: 390×844.
- The source and implementation represent adjacent workflow states rather than the same screen; comparison therefore evaluates ORBIT visual-language continuity, hierarchy and transition fidelity instead of pixel identity.

### Full-view comparison evidence

- The microphone check inherits the rehearsal screen's white 68px header, Surface canvas, Ink primary action, Lilac active state, Cream guidance surface and restrained one-pixel borders.
- The editor `리허설` action now enters the check before the rehearsal workspace. Project identity and back navigation remain visible, so the permission step does not feel like a detached browser utility page.
- The primary task and three-item readiness summary form a clear 1.58/0.82 desktop grid. Mobile collapses the grid in task-first order without horizontal overflow.

### Focused region comparison evidence

- The focused board compares the ready and blocked states at readable size. The card footprint, status placement, input-device control, native progress element, recovery steps and single next action remain stable between states.
- Ready uses Success only for verified permission and level; blocked uses Danger Soft for the microphone icon and Warning for the status copy without turning the whole page into an alarm surface.
- The exact ORBIT raster logo is reused. All interface symbols are Tabler outline icons; no custom SVG, CSS illustration, emoji or placeholder image was introduced.

### Required fidelity surfaces

- Fonts and typography: Pretendard/Inter remains the UI stack. The 38–58px editorial heading, 29px task heading, 12–15px control text and 11px guidance copy match the existing ORBIT hierarchy and preserve Korean word boundaries.
- Spacing and layout rhythm: 68px header, 1180px content maximum, 18px panel gap, 16px panel radius, 42–48px desktop card padding and 44px primary actions align with the approved rehearsal and authentication screens.
- Colors and visual tokens: Surface, Canvas, Ink, Lilac Soft/Strong, Cream, Success Soft and Danger Soft map directly to the existing design-system tokens. No new palette or gradient was added.
- Image quality and asset fidelity: `orbit-logo.png` is rendered at its natural aspect ratio. This utility flow does not require product imagery or illustration assets.
- Copy and content: the idle state explains why permission is needed and that the mock does not record; the ready state provides a realistic test phrase and device; the blocked state gives two concrete recovery steps.

### Interaction and browser verification

- Editor `리허설` → `/mockup/microphone-check` verified.
- `마이크 권한 허용하기` shows a short checking state and resolves to connected permission, selected input device and sufficient level.
- Input device selection, start/complete microphone test, and `리허설로 이동` → `/mockup/rehearsal` verified.
- `권한 문제 해결 화면 보기` renders the blocked state; `다시 확인하기` returns to the permission check sequence.
- At 1440×900, document width is 1425px inside the scrollbar and the 1180px layout stays within the viewport. At 390×844, document width is 375px with intentional vertical scrolling only; the primary action is 301×44px and visible in the first idle viewport.
- Browser console error count: 0.
- 95 test files, 677 tests, TypeScript validation and production build passed. Existing large-bundle warnings remain.

### Findings and comparison history

- No actionable P0/P1/P2 differences were found in the first full-view and focused-state comparison, so no visual-fix iteration was required.
- P3: the permission request, device list and audio levels are deterministic mock interactions; production `getUserMedia`, real device enumeration and persisted browser permission remain outside this design-mockup scope.

## Project access and project rehearsal overview QA

### Source and implementation

- Access-request source visual truth: `artifacts/mockups/project-access-current-source.png`, actual route `/project/project_demo_1/request` in the request-before-submit state.
- Project-report source visual truth: `artifacts/mockups/project-report-current-source.png`, actual route `/reports/project_demo_1` in the backend-provided empty state.
- Implementations: `artifacts/mockups/project-access-mockup-request.png`, the annotation revision `artifacts/mockups/project-access-radio-state-final.png`, and `artifacts/mockups/project-access-mockup-pending.png`, route `/mockup/project-request`; `artifacts/mockups/project-report-mockup-desktop.png`, route `/mockup/report-project`.
- Full-view combined evidence: `artifacts/mockups/project-access-comparison.png` and `artifacts/mockups/project-report-comparison.png`.
- Focused region evidence: `artifacts/mockups/project-screens-focus-comparison.png`.
- Mobile evidence: `artifacts/mockups/project-access-mockup-mobile.png`, `artifacts/mockups/project-access-pending-mobile.png`, and `artifacts/mockups/project-report-mockup-mobile.png`.
- Desktop browser viewport: approximately 2060–2207×1162, depending on route content and scrollbar. Responsive verification viewport: 390×844.
- The actual project-report source is an empty state while the requested mockup intentionally demonstrates a populated project. The comparison therefore evaluates ORBIT visual-language continuity, information architecture and realistic multi-session density rather than pixel identity.

### Full-view comparison evidence

- The access screen preserves the actual editor/viewer request contract while replacing the isolated utility card with a project-context panel and a single focused decision card. Request and pending states keep the same footprint, so approval status does not cause a jarring page reflow.
- The project overview expands the actual empty shell into a populated decision surface: latest score, AI summary, four aggregate metrics, selectable trend, strengths, next goal and recent rehearsal rows appear in descending decision priority.
- Both screens reuse the current ORBIT header, Ink/Lilac/Lime/Cream/Mint hierarchy, restrained one-pixel borders and compact operational controls established across authentication and rehearsal report mockups.

### Focused region comparison evidence

- The focused access comparison confirms that role labels, explanatory copy, selected state, request CTA, pending timeline and cancel/refresh actions remain legible without introducing a second competing primary action.
- The focused report comparison confirms that the score and AI summary dominate first scan, while aggregate metrics and the score/duration selector remain aligned and readable before the session table.
- The official ORBIT raster logo is used directly. All visible UI symbols are Tabler Icons; there are no custom SVGs, CSS drawings, emoji, text-glyph icons or placeholder assets.

### Required fidelity surfaces

- Fonts and typography: Pretendard/Inter remains the UI stack. Editorial headings use the established 38–52px desktop scale; card labels use 11–13px with strong weights; metric values use 26–44px. Mobile headings wrap cleanly and dense supporting copy keeps readable line height.
- Spacing and layout rhythm: desktop access uses a balanced two-column task composition; the report uses a 1180px maximum content grid with 14–24px section gaps and 14–18px radii. At 390px, all grids collapse in task order with 347px usable content and no horizontal overflow.
- Colors and visual tokens: Lilac identifies project context and score, Lime identifies AI synthesis, Cream identifies the next goal, Mint identifies positive trend, and Ink remains the sole primary-action color. No new palette or gradient was added.
- Image quality and asset fidelity: `orbit-logo.png` is rendered at its natural aspect ratio. Neither utility flow requires decorative illustration or product imagery, and no generic placeholder image appears.
- Copy and content: access copy explains why the project is protected, what each role permits, who approves it and what happens while waiting. Report copy uses realistic Korean rehearsal scores, durations, WPM, keyword coverage, strengths and next-practice guidance.

### Interaction and browser verification

- Access request: editor/viewer selection, `접근 권한 요청` → pending, `승인 여부 다시 확인` notice, and `요청 취소` → request state verified.
- Project report: score/duration trend selection, rehearsal-row selection → `/mockup/report`, and `새 리허설` → `/mockup/microphone-check` verified.
- Mobile access and report routes report `scrollWidth=375` inside the 390px viewport, with intentional vertical scrolling only.
- Browser console error count: 0 on the two mockup routes during the visual and interaction pass.
- 95 test files, 679 tests, TypeScript validation, production build and `git diff --check` passed. Existing large-bundle warnings remain.

### Findings and comparison history

- [P2 resolved] The first request-state capture and browser Comment 1 showed the unselected role indicator as a solid Lilac circle without a check, making it visually compete with the selected state. The indicator now uses a transparent center and `1.5px` `Border Strong` outline; only the selected option receives Lilac fill and the Tabler check. `artifacts/mockups/project-access-radio-state-final.png` confirms the corrected request state, and browser-computed styles confirm the unselected indicator is transparent with `rgb(201, 201, 197)` border in both role-selection directions.
- No actionable P0/P1/P2 differences remain after the selection-indicator fix. Typography, layout, copy, brand assets and responsive structure are unchanged from the passed comparison.
- P3: project membership approval, aggregate report data and trend updates are deterministic mock interactions; production authorization and API integration remain outside this design-mockup scope.

## Report-list project overview entry QA

### Source and implementation

- Source visual truth: `artifacts/mockups/report-list-project-entry-before.png`, route `/mockup/reports`, plus browser Comment 1 selecting the former `최근 리포트` card as the desired project-overview entry.
- Implementation: `artifacts/mockups/report-list-project-entry-after.png`, route `/mockup/reports`, with mobile evidence at `artifacts/mockups/report-list-project-entry-mobile.png`.
- Desktop viewport: 1985×1162. Mobile viewport: 390×844.
- State: populated four-session report list, no search or score filter applied.
- Full-view comparison evidence: the before and after captures were opened together in one comparison input. The page composition is unchanged while the highlighted Lilac card now names and exposes the project-level destination.
- A separate focused crop was not needed because the annotated target is a single isolated full-width card and its label, score and action remain readable in the original-size comparison. Browser DOM and computed layout checks additionally confirmed the whole card is one native button.

### Required fidelity surfaces

- Fonts and typography: existing Pretendard/Inter hierarchy is unchanged; `프로젝트 종합 리포트` and `종합 리포트 보기` now use the 13px/700 operational label treatment, while the 26px insight headline remains dominant.
- Spacing and layout rhythm: the card retains its 1200px desktop width, 26×30px padding and existing Lilac panel radius. Mobile collapses to 347px, keeps the action at 44px and has no horizontal overflow (`scrollWidth=375`).
- Colors and visual tokens: the existing Lilac summary surface remains fixed in default and hover states. Hover changes only the Ink `종합 리포트 보기` action to `Lilac Strong`; keyboard focus still uses a visible Lilac focus ring around the full native button.
- Image quality and asset fidelity: no new imagery was required. The official ORBIT raster logo and existing Tabler icons remain unchanged; the route action reuses `IconArrowRight`.
- Copy and content: `최근 리포트` was replaced with `프로젝트 종합 리포트`, the summary now explicitly says it analyses four sessions, and the visible CTA names the destination. Individual rows continue to describe and open one rehearsal report.

### Interaction and findings

- [P1 resolved] The list previously had no discoverable route to the already-built project overview; the highlighted card's arrow opened only the latest individual report. The entire card is now a native button and routes to `/mockup/report-project`; browser navigation confirmed the destination heading `프로젝트 종합 리포트`.
- [P2 resolved] Browser Comments 1–2 identified that the full Lilac card changed color and gained an inset outline on hover, even though only the CTA needed interaction emphasis. The card-level hover rule was removed. `artifacts/mockups/report-list-cta-hover-final.png` and settled computed styles confirm the card remains `rgb(197, 176, 244)` with no shadow while only the CTA changes from Ink to `rgb(104, 70, 216)` and its arrow moves 2px.
- [P3 resolved] The first mobile pass let the `+5` delta stretch away from the score. `justify-self: start` now keeps `86 +5` together; the final mobile capture confirms the corrected grouping.
- Keyboard focus, hover, desktop and 390px responsive states remain within the current ORBIT system. Browser console error count: 0.
- Targeted mockup and route tests: 56 passed. Production build and `git diff --check` passed; the existing large-bundle warning remains.
- No actionable P0/P1/P2 findings remain.

## Typography readability system QA

### Source and implementation

- Source visual truth: `/var/folders/rg/k27jblsn7sn4qsddc_5ckkvw0000gn/T/codex-clipboard-63b1c339-4eca-419c-9598-051395b85810.png` (3969×2324), showing the report list with 9–11px metadata and a large title-to-body contrast.
- Browser implementation: `artifacts/mockups/report-list-typography-system-final.png`, route `/mockup/reports`, default 1280px browser viewport.
- Responsive implementation: `artifacts/mockups/report-list-typography-mobile-final.png`, route `/mockup/reports`, viewport 390×844.
- Design-system evidence: `artifacts/mockups/design-system-typography-final.png` for Display through Page title and `artifacts/mockups/design-system-typography-detail-final.png` for Heading through Caption, route `/design-system`, default 1280px browser viewport.
- Full-view comparison evidence: the source, revised desktop report and revised mobile report were opened together in one comparison input. The revised screen preserves the original composition while increasing the readable information layer.
- Focused region evidence was provided by browser-computed font measurements for the heading, summary card, table heading, filters, row metadata and status badge; these were the exact regions identified as too small in the source screenshot.

### Required fidelity surfaces

- Fonts and typography: the canonical scale is now Display 48–86, Title 40–64, Page title 36–48, Heading 26, Subheading 20, Body large 18, Body 16, Body small/UI 14, UI small 13 and Caption 12px. Report measurements confirm 14px summary copy, 13px controls and row metadata, 12px table/status captions, 20px section heading and 26px card headline. No visible readable UI text under 12px was found on the report, project overview, login or operational mockup routes.
- Spacing and layout rhythm: existing content widths, card padding and row heights remain intact. The added type steps reduce the jump between 36–48px page titles and supporting text without compressing the layout. At 390px, the report remains 347px wide with `scrollWidth=375` and no horizontal overflow.
- Colors and visual tokens: the Ink/Lilac/Lime/Cream/Mint palette and semantic colors are unchanged. Muted text retains the existing token while gaining legibility through size instead of darker color.
- Image quality and asset fidelity: logo and Tabler assets are unchanged. Small text that remains below 12px is limited to content rendered inside scaled slide thumbnails/canvases and the non-interactive legacy test marker, which the typography policy explicitly excludes.
- Copy and content: no product copy was removed or shortened to make the larger type fit. The design-system preview now names Page title, Subheading, UI and Caption roles and explains when Caption is permitted.

### Findings and comparison history

- [P1 resolved] Readable report metadata, controls, table headings and status badges used 9–11px values outside the documented system. New semantic CSS/TypeScript tokens establish a 12px hard floor, 13px UI-small and 14px UI/body-small tiers, and the mockups plus editor operational UI now consume those values.
- [P2 resolved] The earlier scale jumped from 42px page title and 24px card title to 9–12px information text. Page title, Heading and Subheading steps now bridge the hierarchy; the report renders at 38.4px/26px/20px/14px/13px/12px in the 1280px verification viewport.
- [P2 resolved] The first mobile verification retained a legacy 34px override instead of the new 36px minimum Page-title token. The override now consumes `--orbit-ds-type-page-title`; the post-fix browser measurement is 36px with no overflow.
- Main interactions and information architecture are unchanged. Browser console error count: 0 on `/design-system` and `/mockup/reports`.
- Targeted design-system, mockup and route tests: 58 passed. Production build and `git diff --check` passed; the existing large-bundle warning remains.
- No actionable P0/P1/P2 findings remain.

## Editor project-sharing dialog QA

### Source and implementation

- Source visual truth: `artifacts/mockups/editor-share-source.png`, route `/mockup/editor`, showing the approved editor chrome and the `공유` secondary action before opening the flow.
- Existing functional contract: `apps/web/src/features/editor/shell/components/ShareAccessModal.tsx`, which defines member status, email invite, role management and pending-request handling in the current product.
- Browser implementation: `artifacts/mockups/editor-share-dialog-desktop.png`, route `/mockup/editor`, with the `함께 작업 중` panel open.
- Additional state: `artifacts/mockups/editor-share-requests-desktop.png`, with the `승인 요청` panel open.
- Desktop viewport: 1972×1162; dialog 720×786px. Responsive verification viewport: 390×844; dialog 366×802px with `scrollWidth=390`.
- The source and implementation are adjacent states rather than the same visible screen. The comparison therefore evaluates editor-context continuity, ORBIT component fidelity and coverage of the existing sharing contract rather than pixel identity.

### Full-view and focused comparison evidence

- The source editor and open-dialog implementation were viewed together in one comparison input. The two-row editor chrome, canvas and inspector remain in place under a neutral dark scrim, keeping the user anchored to the document they are sharing.
- The dialog is the sole foreground surface. Project context appears before tabs, member management remains the primary panel and link sharing is separated by a divider near the footer.
- A separate crop was unnecessary because the 720px dialog occupies the central readable region in the original-size implementation capture. Email, permission selectors, participant rows and copy action are all legible in the full-view comparison.

### Required fidelity surfaces

- Fonts and typography: Pretendard/Inter is unchanged. The 22px dialog title, 14px project/member headings and 12–13px controls follow the current ORBIT scale without introducing sub-12px operational text.
- Spacing and layout rhythm: the 18px panel radius, 24–26px outer padding, 8–18px section gaps, 42–44px controls and restrained one-pixel borders match existing editor and report surfaces. Mobile collapses the invite and link grids while keeping the dialog inside 390px.
- Colors and visual tokens: Canvas, Surface, Ink, Lilac Soft/Strong, Mint, Cream, Success Soft and Danger Soft retain their current semantic roles. No gradient or new palette was introduced.
- Image quality and asset fidelity: no imagery is required. The underlying editor keeps the official ORBIT raster logo and every dialog symbol uses Tabler Icons; no handcrafted SVG, CSS icon or placeholder illustration appears.
- Copy and content: project identity, owner scope, Korean role labels, invite guidance, participant count, approval-request count, link permission and success/error messages make the sharing state understandable without developer terminology.

### Interaction and browser verification

- Editor `공유` opens the modal; the close action removes it without navigation.
- Invalid email shows a specific error. A valid email with `편집 가능` adds the invited member and shows a success message.
- `함께 작업 중` and `승인 요청` tabs switch state. Approving 최소라 removes the request and adds the user to the member data.
- Link-role selection and `복사` produce a permission-specific copied state. Member role selects and remove controls remain interactive.
- Dialog semantics (`role=dialog`, `aria-modal`), named inputs/selects, tab roles and practical tap targets are present. Browser console error count: 0.
- Targeted mockup and route tests: 56 passed. TypeScript validation, production build and `git diff --check` passed; the existing large-bundle warning remains.

### Findings and comparison history

- No actionable P0/P1/P2 differences were found in the first combined comparison, so no visual-fix iteration was required.
- P3: email delivery, project-member persistence and clipboard writes are deterministic visual mock interactions; production API and browser-clipboard integration remain outside this design-mockup scope.

## Report-header Home navigation QA

### Source and implementation

- Source visual truth: `artifacts/mockups/report-list-project-entry-after.png`, route `/mockup/reports`, plus browser Comment 1 identifying that the visible navigation started at `프로젝트` instead of the app-wide `홈` item.
- Browser implementation: `artifacts/mockups/report-header-home-final.png`, route `/mockup/reports`, with `홈 → 프로젝트 → 리허설 → 리포트` visible.
- Desktop viewport: 1972×1162. State: populated report list with `리포트` active.
- Full-view comparison evidence: the before and after screenshots were opened together in one comparison input. The only composition change is the restored `홈` item in the centered header navigation.
- A focused crop was unnecessary because the header labels are readable at original size and the DOM snapshot independently confirms the exact item order and current-page state.

### Required fidelity surfaces

- Fonts and typography: the added `홈` consumes the same 13px navigation treatment as the adjacent items, with no change to line height, weight or tracking.
- Spacing and layout rhythm: the existing 4px item gap, pill hit area, three-column header and page-content alignment remain unchanged. Four labels fit without overlap at the desktop target.
- Colors and visual tokens: `홈` uses the same muted default state; `리포트` retains Lilac Soft/Strong current-page styling.
- Image quality and asset fidelity: the official ORBIT raster logo and project icon are unchanged; no new image or substitute asset was introduced.
- Copy and content: report list, individual detail and project overview now use the same app navigation vocabulary as the main screen.

### Interaction and findings

- [P1 resolved] The report-family headers omitted the app-wide `홈` entry, forcing users to infer that the logo or `프로젝트` returned to the main screen. `홈` is now first in all three report headers and routes explicitly to `/mockup/home`.
- Browser navigation from `/mockup/reports` to `/mockup/home` passed. `/mockup/report` and `/mockup/report-project` each expose one `홈` item while keeping `리포트` active.
- Browser console error count: 0. Targeted mockup and route tests: 56 passed. Production build and `git diff --check` passed; the existing large-bundle warning remains.
- No actionable P0/P1/P2 findings remain.

## Production UI primitives T1 QA

### Source and implementation

- Source visual truth: the canonical `/design-system` preview captured before the T1 extension at `artifacts/migration/t1/design-system-before.jpg`.
- Browser implementation: `artifacts/migration/t1/design-system-after-retry.jpg` and the focused component view `artifacts/migration/t1/components-desktop.jpg`.
- Desktop viewport: 1440×1024. Responsive dialog verification viewport: 390×844.
- The before and after top-of-page captures were opened together in one comparison input. The Foundations composition, typography, palette, logo treatment, spacing and navigation remain visually unchanged; T1 adds specimens only inside the Components section.

### Required fidelity surfaces

- Fonts and typography: the primitives inherit Pretendard/Inter and the existing semantic scale. Field labels, helper/error text, tabs, empty-state copy and dialog content do not introduce readable text below the 12px floor.
- Spacing and layout rhythm: action controls retain the 44px minimum; form, tab and feedback surfaces follow the existing 8px grid and restrained one-pixel borders. Desktop width verification reported `clientWidth=1425`, `scrollWidth=1425`; the 390px dialog becomes a bottom sheet without horizontal overflow.
- Colors and visual tokens: Ink, Lilac, Canvas, Surface, Success and Danger roles are reused without adding gradients or ad-hoc colors.
- Image quality and asset fidelity: the official light/dark raster logos remain unchanged. `IconX` and all other symbols use Tabler Icons; no handcrafted SVG, CSS drawing or placeholder asset was added.
- Copy and content: control examples use realistic ORBIT project-sharing and presentation copy, including default, disabled, invalid and empty states.

### Interaction and findings

- `OrbitField` links labels, controls, hints and errors through `htmlFor`, `aria-describedby`, `aria-invalid` and `role=alert`.
- `OrbitTabs` exposes `tablist`/`tab`/`tabpanel` semantics and supports Arrow Left/Right plus Home/End keyboard selection. Browser verification moved `함께 작업 중` to `승인 요청` with Arrow Right and rendered `검토가 필요한 접근 요청 1건`.
- `OrbitDialog` supports initial focus, Escape dismissal, Tab focus trapping, backdrop dismissal and trigger-focus restoration. Desktop and mobile open/close states were verified in the in-app browser.
- `OrbitEmptyState` provides a named status region and optional action; icon-only actions require an accessible label.
- Targeted design-system tests: 7 passed. Web TypeScript validation and production build passed; the existing large-bundle warning remains.
- No actionable P0/P1/P2 findings remain.

## Production product-header T2 QA

### Source and implementation

- Source visual truth: `/mockup/home` at `artifacts/migration/t2/home-mock-source.jpg`, with the approved logo, centered `홈 → 프로젝트 → 리허설 → 리포트` navigation and right-side account region.
- Legacy production baseline: `/project` at `artifacts/migration/t2/project-before.jpg`, showing the previous 250px left sidebar.
- Browser implementation: `/project` at `artifacts/migration/t2/project-header-after.jpg`; responsive state at `artifacts/migration/t2/project-header-mobile.jpg`.
- Desktop viewport: 1440×1024. Mobile viewport: 390×844 (`clientWidth=375`). The source and implementation were opened together in one comparison input, followed by a legacy-before/implementation comparison.

### Required fidelity surfaces

- Fonts and typography: the header uses Pretendard/Inter with 13px UI labels and 12px account metadata. No readable text below the system floor was introduced.
- Spacing and layout rhythm: the desktop shell uses a 72px sticky header and 1280px inner rhythm. The compact mobile header is 109px tall with brand/account on row one and four equal navigation targets on row two.
- Colors and visual tokens: Canvas, Surface, Border, Ink, Muted, Lilac Soft/Strong and Mint tokens replace the previous blue-gray sidebar active treatment.
- Image quality and asset fidelity: the official `orbit-logo.png` raster asset is used at both desktop and mobile sizes. Account/logout symbols use Tabler Icons; no handcrafted asset was added.
- Copy and content: the approved four-label order is identical at every verified route. Unauthenticated state shows `로그인`; authenticated state retains the existing user identity and logout action.

### Interaction and findings

- [P1 resolved] The production shell used a route-specific left sidebar, so navigation position and content width differed from the approved mockups. A shared sticky top header now wraps `/`, `/project`, `/reports` and `/createdeck` without changing route content or API behavior.
- `/project`, `/reports` and `/createdeck` browser smoke confirmed one header each and the expected `aria-current=page` state. The rehearsal entry routes to `/project?intent=rehearsal` and receives its own active state while a project is selected.
- Desktop checks reported `scrollWidth === clientWidth` on all three directly accessible production routes. Mobile `/project` reported `scrollWidth=375`, `clientWidth=375`, and retained all four navigation labels without clipping.
- The account trigger exposes menu semantics, closes on outside pointer or Escape, and delegates logout to the existing `/api/v1/auth/logout` handler. Focus states use the canonical ORBIT focus token.
- `App.test.tsx`: 42 passed. Web TypeScript validation passed. No actionable T2 P0/P1/P2 findings remain; the existing project-page title/refresh wrapping at 390px is scoped to the T4 page migration rather than the shared header.

## Production public and auth T3 QA

### Source and implementation

- Source visual truth: `/mockup`, `/mockup/login`, and `/mockup/signup` at the fixed desktop `1440×1024` target.
- Browser implementation: `/`, `/login`, and `/signup`, using the same ORBIT logo, editorial rehearsal image, Ink/Lilac/Lime/Cream palette, and approved two-column authentication composition.
- The public source and implementation captures were opened together in one comparison input. The implementation preserves the source hero split, four-item public navigation, product preview hierarchy, black process strip, two support cards, and final CTA.

### Required fidelity surfaces

- Fonts and typography: Pretendard/Inter, the approved eyebrow, display, body, UI and caption scales are inherited from the canonical tokens. Text below 12px exists only inside the intentionally scaled slide-preview simulation.
- Spacing and layout rhythm: the 72px public header, asymmetric hero, 510px desktop stage, 18px support-card gap, 44px controls, and mobile single-column form follow the source composition without horizontal overflow.
- Colors and visual tokens: Canvas, Surface, Ink, Lilac, Lime, Cream, Muted, Success and Danger roles are reused. No gradients or replacement palette were added.
- Image quality and asset fidelity: the official ORBIT raster logo and the source editorial rehearsal image are reused. All interface symbols use Tabler Icons; no placeholder, handcrafted SVG, or CSS illustration was introduced.
- Copy and content: the public value proposition and auth benefit hierarchy match the approved mockups. Production exposes only the supported email/password contract; Google login and password-reset actions are absent.

### Interaction and findings

- Authentication submit preserves `/api/v1/auth/login` and `/api/v1/auth/register`, `credentials: include`, query invalidation, loading, success navigation, and server-error rendering.
- Mobile collapses the value proposition while keeping the form, mode switch and primary submit action in the first interaction flow.
- [P2 resolved] The first implementation omitted the source slide rail and editorial support image; both source assets and the four-item public menu are now restored.
- `App.test.tsx`: 46 passed. Web TypeScript validation, production build and `git diff --check` passed. The existing large-bundle warning remains.
- The in-app browser connection became temporarily unresponsive during the final auth-state recapture. The already captured desktop public comparison remains valid; login/signup mobile recapture is retained as a required final-rollout check in T19.

final result: passed

## Production rehearsal display and presenter mode T15 QA

### Source and implementation

- Source visual truth: the approved rehearsal mockups for display selection and the dark presenter-control surface, including the official white ORBIT logo treatment.
- Browser implementations: `/rehearsal/project_demo_1` display options at `artifacts/migration/t15/display-options.png` and the connected presenter window at `artifacts/migration/t15/presenter-dark.png`.
- Desktop viewport: 1440×1024. The display-options panel and presenter remote both rendered without horizontal overflow.

### Required fidelity surfaces

- Fonts and typography: operational labels remain at the canonical readable scale while slide titles, timing and presenter cues receive the stronger hierarchy required for distance viewing.
- Spacing and layout rhythm: the display options stay anchored to one compact control, while the presenter window separates current slide, next slide, script, timing and navigation into stable regions.
- Colors and visual tokens: the presenter shell uses the approved Navy/Ink dark surface with high-contrast white text; Lilac remains the interactive accent.
- Image quality and asset fidelity: the presenter header uses the official `orbit-logo-white.png` directly, without a light container or improvised logo treatment. All interface symbols use Tabler Icons.
- Copy and content: display placement, reset, fullscreen and slide-window options describe existing behavior only. Presenter content continues to use the loaded deck and rehearsal state.

### Interaction and findings

- The display-options panel exposes presenter-view, first-slide reset, monitor placement, fullscreen and separate/current-window modes without requesting screen permissions during QA.
- The connected presenter window retained current/next slide, script cue, timer, keyword, STT and slide-navigation controls; no audience metric or unsupported live data was introduced.
- Presenter component tests: 26 passed. Web TypeScript validation, production build and `git diff --check` passed. The existing large-bundle warning remains.
- No actionable P0/P1/P2 findings remain.

final result: passed

## Production rehearsal active and completion T14 QA

### Source and implementation

- Source visual truth: `/mockup/rehearsal` and `/mockup/rehearsal-complete`, including slide-first practice, glanceable timing/coach side rail and factual completion summary.
- Browser implementation: actual `/rehearsal/project_demo_1`; active DOM state and completion DOM state were reached through `음성 없이 연습하기 → 리허설 마치기`. Captures: `artifacts/migration/t14/rehearsal-active.png`, `artifacts/migration/t14/rehearsal-complete.png`.
- Desktop viewport: 1440×1024 with `scrollWidth === clientWidth` in both states.

### Required fidelity surfaces

- Fonts and typography: timer, slide index, coach data and 40px completion title preserve glanceable hierarchy and the 12px operational floor.
- Spacing and layout rhythm: the slide remains primary in a `1fr / 360px` layout, while the timer, keywords, Live STT and coach stack use restrained 14px panels.
- Colors and visual tokens: Canvas/Surface frame practice, Lilac supports timer context, Lime highlights the factual completion duration and Ink holds the teleprompter/primary actions.
- Image quality and asset fidelity: slides continue through the real `SlideshowRenderer`; no screenshot or fake slide asset replaces deck rendering.
- Copy and content: timer, WPM, keyword coverage, slide timing, report job state and completion metrics all come from existing runtime/report state.

### Interaction and findings

- Start/pause/resume/finish, recording, Live STT, keyword detection, auto advance, upload, job polling and report navigation handlers are unchanged.
- Completion text no longer promises unsupported `청중 반응`; pending copy names only time, keyword and speaking analysis that the report contract supports.
- The completion summary distinguishes local-only practice from report-backed practice and keeps a single state-dependent final action beside `다시 연습`.
- `RehearsalWorkspace.test.tsx`: 81 passed. Web TypeScript validation, production build and `git diff --check` passed. The existing large-bundle warning remains.
- No actionable P0/P1/P2 findings remain.

final result: passed

## Production microphone preflight T13 QA

### Source and implementation

- Source visual truth: `/mockup/microphone-check`, interpreted against the real permission and Live STT states in `RehearsalPreflightScreen`.
- Browser implementation: `/rehearsal/project_demo_1` prompt state, verified by DOM and viewport metrics; capture artifact at `artifacts/migration/t13/preflight-prompt.png`.
- Desktop viewport: 1440×1024 with `scrollWidth === clientWidth`.

### Required fidelity surfaces

- Fonts and typography: a 40px preflight heading and 12–14px status/device copy use canonical typography.
- Spacing and layout rhythm: a centered 760px card, 18px radius, compact goal banner, connected status chain and one primary start action follow the approved preflight hierarchy.
- Colors and visual tokens: Lime carries the current rehearsal goal, Lilac identifies the microphone checkpoint, and neutral status rows preserve actual permission meaning.
- Image quality and asset fidelity: microphone and state symbols remain library icons; no fake level illustration is introduced.
- Copy and content: permission, device labels, voice-check transcript/latency, command phrases and slide count come from actual browser/deck state.

### Interaction and findings

- Permission is queried read-only on load and requested only from the explicit `권한 허용 요청` action. Prompt, granted, denied and unsupported states retain different guidance.
- After permission, real `audioinput` devices populate the selector. The selected device is persisted and added to the existing microphone constraints for preflight and rehearsal capture.
- Voice check, command matching, latency, silent-practice fallback and disabled-start explanation remain unchanged.
- `RehearsalWorkspace.test.tsx`: 80 passed. Web TypeScript validation, production build and `git diff --check` passed. The existing large-bundle warning remains.
- The browser permission prompt was intentionally not accepted during automated QA; granted/denied manual verification remains in Checkpoint E. No code-level P0/P1/P2 findings remain.

final result: passed

## Production editor share dialog T12 QA

### Source and implementation

- Source visual truth: `/mockup/editor` share dialog, interpreted against the production member/request API boundary.
- Production implementation: `ShareAccessModal` rendered through the shared `OrbitDialog`, `OrbitTabs`, field, select, button and empty-state primitives.

### Required fidelity surfaces

- Fonts and typography: 16px section headings and 12–13px participant, role and feedback copy follow the dense editor scale.
- Spacing and layout rhythm: the 720px desktop dialog, 44px controls, two-tab hierarchy and 64px participant rows match the approved sharing flow; mobile becomes a bottom sheet.
- Colors and visual tokens: Lilac Soft holds the invitation block, Mint identifies participant avatars, and Success/Danger surfaces carry API feedback.
- Image quality and asset fidelity: user, approval and removal actions use Tabler Icons; no avatar image is fabricated.
- Copy and content: participants and approval requests come only from the existing project-member API. Public-link and link-copy UI is absent.

### Interaction and findings

- Invite, role change, owner transfer confirmation, permission removal, request approval and rejection retain existing API handlers and owner-only gating.
- Shared dialog behavior adds initial focus, focus trap, Escape/backdrop close and focus restoration. Shared tabs add Arrow Left/Right and Home/End keyboard operation.
- Empty, loading, success and error states remain inside the dialog and are exposed through status/alert semantics.
- Share modal and editor tests: 53 passed. Web TypeScript validation, production build and `git diff --check` passed. The existing large-bundle warning remains.
- Authenticated editor dialog recapture remains in T19 because the local project-access guard did not provide an accepted membership. No code-level P0/P1/P2 findings remain.

final result: passed

## Production editor three-area layout T11 QA

### Source and implementation

- Source visual truth: `/mockup/editor`, with slide rail, dominant canvas and secondary `AI 제안 / 디자인 / 메모` inspector.
- Production implementation: the actual `EditorShell` three-area markup and inspector render contract, verified together with the T10 document chrome in the editor test fixture.

### Required fidelity surfaces

- Fonts and typography: dense inspector controls stay at 12px or above; section headings use 16–18px hierarchy.
- Spacing and layout rhythm: the 184px slide rail and 332px inspector leave the canvas as the visual focal point. Resizers and collapse controls preserve the existing adjustable layout.
- Colors and visual tokens: the neutral editor workspace, white rail/inspector, Lilac active slide/tab and restrained canvas shadow replace blue-heavy emphasis.
- Image quality and asset fidelity: no new image is required. Existing slide thumbnails remain generated from actual deck state.
- Copy and content: AI validation/suggestions, actual slide theme colors and current speaker notes populate the three inspector tabs.

### Interaction and findings

- AI suggestion application and validation handlers are unchanged. Design tab reflects the selected element and actual slide/theme colors. Notes tab shares the existing draft, cancel and save handlers.
- The original canvas-bottom notes surface remains available on desktop; mobile prioritizes the sheet-like inspector and hides the duplicate lower notes region.
- Slide selection, rail collapse/resize, inspector collapse/resize, canvas editing and animation pane behavior remain connected to the existing store.
- `EditorShell.test.tsx`: 51 passed. Web TypeScript validation, production build and `git diff --check` passed. The existing large-bundle warning remains.
- Authenticated editor visual recapture remains in T19 for the same local access-boundary limitation. No code-level P0/P1/P2 findings remain.

final result: passed

## Production editor document chrome T10 QA

### Source and implementation

- Source visual truth: `/mockup/editor` at the fixed editor review viewport `1984×1324`, including the Google Slides-like document/menu row and neutral tool dock.
- Production implementation: the actual `EditorShell` document chrome. The guarded `/project/project_demo_1` route was exercised in the in-app browser and correctly retained its access-error boundary; authenticated chrome structure was verified through the production editor render test.

### Required fidelity surfaces

- Fonts and typography: 12px menu/save labels and a 14px document title improve dense-editor readability without dropping below the system floor.
- Spacing and layout rhythm: a 78px document/menu row and fixed 48px neutral tool dock create the approved two-level chrome while preserving the slide rail, canvas and inspector below.
- Colors and visual tokens: the previous blue-gray chrome is replaced by white, Surface, Border, Ink and Lilac focus semantics without gradients.
- Image quality and asset fidelity: the official ORBIT raster logo appears in the document title row. Existing editor actions keep their installed icon components; no new drawn asset was introduced.
- Copy and content: the real deck title, save state, file/edit menus, presence, share, rehearsal and presentation actions remain connected to existing state.

### Interaction and findings

- Autosave/manual save, undo/redo, home exit confirmation, file/resize/edit menus, presentation menu and share dialog handlers are unchanged.
- The topbar now gives the document identity first-row priority; file/edit controls form the compact menu row; selection/text/shape/chart/image/animation tools occupy the neutral second row.
- `EditorShell.test.tsx`: 51 passed. Web TypeScript validation, production build and `git diff --check` passed. The existing large-bundle warning remains.
- Authenticated editor visual recapture remains part of the final T19 browser pass because the local project-access endpoint did not provide an accepted membership in this run. No code-level P0/P1/P2 findings remain.

final result: passed

## Production rehearsal-run report T9 QA

### Source and implementation

- Source visual truth: `/mockup/report`, including a strong report hero, AI summary, factual metric cards, slide analysis, coaching and final retry flow.
- Browser implementation: `/report_mockup` at `artifacts/migration/t9/report-detail.png`; DOM verification covered the complete long report.
- Desktop viewport: 1440×1024 with `scrollWidth === clientWidth`.

### Required fidelity surfaces

- Fonts and typography: the 48px run heading, 20px section headings and 12–16px report labels inherit canonical typography.
- Spacing and layout rhythm: the 1120px document, 146px Lilac hero, 14px factual cards and 18px vertical rhythm match the approved report hierarchy.
- Colors and visual tokens: Lilac is reserved for AI summary context, Lime highlights duration, Cream supports speaking details and Ink closes the next-practice flow.
- Image quality and asset fidelity: report actions and headings now use Tabler Icons consistently; charts remain driven by report arrays.
- Copy and content: only `RehearsalReport`, the current run, previous official reports and deck metadata are rendered. No frontend score is calculated.

### Interaction and findings

- The final Ink action repeats `coaching.nextPracticeFocus` when available and routes to a new rehearsal.
- `transcriptRetained=false` keeps transcript content and transcript controls out of the DOM. Retained transcript expiry/download behavior remains unchanged.
- The existing AI-summary fallback, metrics, slide analysis, utterance outcome, semantic cue evidence, filler and coaching sections preserve their contract-backed behavior.
- Report document and rehearsal workspace tests: 80 passed. Web TypeScript validation, production build and `git diff --check` passed. The existing large-bundle warning remains.
- No actionable P0/P1/P2 findings remain.

final result: passed

## Production project report T8 QA

### Source and implementation

- Source visual truth: `/mockup/report-project`, with a project context header, Lilac summary, trend region and direct run-detail rows.
- Browser implementation: `/reports/project_demo_1` zero-run state at `artifacts/migration/t8/project-report-empty.png`.
- Desktop viewport: 1440×1024 with `scrollWidth === clientWidth`.

### Required fidelity surfaces

- Fonts and typography: the 56px report title, 24px factual summary and 12–20px chart/list labels use canonical typography.
- Spacing and layout rhythm: a 72px document topbar, 1180px report body, 150px Lilac summary and 64px run rows establish a clear project-to-run hierarchy.
- Colors and visual tokens: Lilac marks project context, Cream provides single-run guidance and neutral surfaces hold contract-backed charts and rows.
- Image quality and asset fidelity: all controls and report markers use Tabler Icons. Existing chart renderers remain data-driven.
- Copy and content: the summary, duration series, slide averages, run count and dates come from `RehearsalProjectSummary` and rehearsal-run responses only.

### Interaction and findings

- Zero runs show a first-rehearsal CTA; one run explains that a second run enables trend comparison; two or more runs render only available official trend series.
- The unsupported `실전 리포트 0건` placeholder and fake latest-presentation row were removed.
- Run rows route to `/rehearsal/:projectId/report/:runId`; the topbar returns to the report hub and starts a new rehearsal.
- Targeted report and route tests: 52 passed. Web TypeScript validation, production build and `git diff --check` passed. The existing large-bundle warning remains.
- No derived score, demo summary, or unsupported live-report state is present. No actionable P0/P1/P2 findings remain.

final result: passed

## Production report hub T7 QA

### Source and implementation

- Source visual truth: `/mockup/reports` for the heading, Lilac summary entry, restrained table shell and project-level navigation intent.
- Browser implementation: `/reports` error state at `artifacts/migration/t7/reports-error-retry.png`.
- Desktop viewport: 1440×1024 with `scrollWidth === clientWidth`.

### Required fidelity surfaces

- Fonts and typography: the 60px report title, 22px summary statement and 12–14px table copy use the ORBIT scale.
- Spacing and layout rhythm: the 1280px page, 126px Lilac summary, 14px table shell and 70px project rows preserve the approved report hierarchy.
- Colors and visual tokens: Lilac marks the project summary entry while Canvas, Surface and Ink keep the report hub neutral. No score color or invented status is displayed.
- Image quality and asset fidelity: file, microphone, refresh and chevron symbols use Tabler Icons.
- Copy and content: row titles, latest dates and counts are derived from existing project and rehearsal-run APIs only.

### Interaction and findings

- Project rows navigate to `/reports/:projectId`; they are visually and semantically distinct from individual rehearsal-run rows.
- Loading, API error, no-report and populated states share one stable table shell. Error retry re-runs the existing aggregation request.
- The aggregation helper excludes projects without completed report runs and sorts remaining projects by the latest real run.
- Targeted report-list and route tests: 51 passed. Web TypeScript validation, production build and `git diff --check` passed. The existing large-bundle warning remains.
- No derived 0–100 score or demo report value is rendered. No actionable P0/P1/P2 findings remain.

final result: passed

## Production project access T6 QA

### Source and implementation

- Source visual truth: `/mockup/project-request`, including the Lilac project-context panel, white approval card, native role choice hierarchy and explicit project-list escape path.
- Browser implementation: `/project/project_demo_1/request` error state at `artifacts/migration/t6/access-error-desktop-retry2.png`; request and pending states are covered by the same production component and existing access query.
- Desktop viewport: 1440×1024 with `scrollWidth === clientWidth`.

### Required fidelity surfaces

- Fonts and typography: the 42px project title, 32px approval heading and 12–14px supporting labels use canonical tokens.
- Spacing and layout rhythm: two balanced rounded panels, a 54px project mark, 44px controls and a single-column 390px layout follow the approved access mockup.
- Colors and visual tokens: Lilac communicates private-project context; unselected native radios are white with a gray outline and selected radios alone receive the Lilac fill/check state.
- Image quality and asset fidelity: project context uses a Tabler file icon and the shared application header keeps the official raster logo.
- Copy and content: project title, ID and created date come from the existing access response. Request, pending, accepted redirect and fetch-error states use contract-backed data only.

### Interaction and findings

- The native radiogroup keeps a single `editor` or `viewer` selection and submits the existing access-request API payload.
- Pending state localizes the requested role, supports status refresh and provides a project-list return; unsupported request cancellation is not shown.
- Accepted membership still redirects to the editor. Fetch failure now renders an in-context retry state instead of an ungrounded request form.
- `App.test.tsx`: 50 passed. Web TypeScript validation, production build and `git diff --check` passed. The existing large-bundle warning remains.
- No actionable P0/P1/P2 findings remain.

final result: passed

## Production AI deck creation T5 QA

### Source and implementation

- Source visual truth: `/mockup/create`, including breadcrumb, large creation heading, three-step progress, Lilac workspace, split input/preview hierarchy and one state-dependent final action.
- Browser implementation: `/createdeck` at `artifacts/migration/t5/create-desktop-retry.png`; responsive state at `artifacts/migration/t5/create-mobile.png`.
- Desktop viewport: 1440×1024. Mobile viewport: 390×844. Both reported `scrollWidth === clientWidth`.

### Required fidelity surfaces

- Fonts and typography: the display heading, mono eyebrow, 12–16px form labels and 22px section heading use canonical ORBIT tokens.
- Spacing and layout rhythm: the 1280px page, 16px Lilac workspace, split form/preview, 44px controls, dashed upload target and three-step line retain the approved source hierarchy.
- Colors and visual tokens: Lilac Soft holds the work area, Lime previews the deck output and Ink is reserved for the state-dependent project/create actions.
- Image quality and asset fidelity: no image asset is required in this task. Upload and deck-preview symbols use the installed icon system rather than placeholder drawings.
- Copy and content: labels explain the actual PPTX OOXML behavior, target-project selection and source-file constraint; the UI does not claim unsupported arbitrary document generation.

### Interaction and findings

- The existing target-project create/select, PPTX validation, upload, payload, job polling, failure and editor-navigation behavior remains intact.
- The form now exposes `입력 → 구성 확인 → 생성`; the action label changes from `구성 확인` to `발표자료 생성 시작`, then `발표자료 생성 중...` without creating a second competing primary action.
- Loading and API error content remains inside the same work surface. Mobile stacks the preview after the form and keeps the final action accessible without horizontal overflow.
- `App.test.tsx`: 49 passed. Web TypeScript validation, production build and `git diff --check` passed. The existing large-bundle warning remains.
- No actionable P0/P1/P2 findings remain.

final result: passed

## Production workspace and project hub T4 QA

### Source and implementation

- Source visual truth: `/mockup/home` for the recent-work strip, project-table hierarchy, quick-start blocks and single page-level primary action.
- Browser implementation: `/project` at `artifacts/migration/t4/project-desktop-retry.png`; responsive state at `artifacts/migration/t4/project-mobile-retry.png`.
- Desktop viewport: 1440×1024. Mobile viewport: 390×844. Both states reported `scrollWidth === clientWidth`.

### Required fidelity surfaces

- Fonts and typography: the approved eyebrow, display heading, table labels and 12px minimum operational text use Pretendard/Inter tokens.
- Spacing and layout rhythm: the 1280px page rhythm, 14px table shell, 44px search/sort controls, 66px rows and mobile priority columns follow the mockup hierarchy.
- Colors and visual tokens: Ink is reserved for the single page-level AI creation action; Lilac, Navy, Lime and Ink thumbnail tones provide secondary project identity without adding unsupported status data.
- Image quality and asset fidelity: the shared ORBIT header asset is unchanged and all project actions use Tabler Icons.
- Copy and content: project titles, IDs and creation dates come only from the existing project query. Loading, error, empty and search-empty states do not invent project data.

### Interaction and findings

- `/` now prioritizes recent work, one page-level `AI 발표자료 만들기` action, all-project navigation and two quick-start paths. `/project` is the full search/sort table.
- Search filters locally by real project title; sorting supports newest, oldest and name. Refresh, blank-project creation, edit, rehearsal and delete retain existing API/route behavior.
- Mobile keeps the project identity and destructive icon action while hiding lower-priority date and text actions; all four app navigation targets remain available.
- `App.test.tsx`: 48 passed. Web TypeScript validation, production build and `git diff --check` passed. The existing large-bundle warning remains.
- No actionable P0/P1/P2 findings remain.

final result: passed

## Production live presenter T16 QA

### Source and implementation

- Source visual truth: the approved dark presenter-mode mockup and the production presentation contract for deck navigation, script cues and timing.
- Browser implementation: `/presentation/project_demo_1` at `artifacts/migration/t16/live-presenter.png`.
- Desktop viewport: 1440×1024 with `scrollWidth === clientWidth`.

### Required fidelity surfaces

- Fonts and typography: slide context, timer, script and status labels use the canonical readable operational scale with stronger current-state emphasis.
- Spacing and layout rhythm: the current slide remains dominant, the next-slide cue stays adjacent, and timing/script information occupies a stable secondary rail.
- Colors and visual tokens: Navy/Ink surfaces establish the live-presentation context; white text and restrained Lilac/Mint accents preserve contrast without introducing new semantic colors.
- Image quality and asset fidelity: the dark header uses the official white ORBIT raster logo directly. The exit action uses a Tabler presentation icon.
- Copy and content: slide title, notes, keywords, timing and navigation come from the loaded deck and existing presentation state only.

### Interaction and findings

- Keyboard and explicit previous/next controls still drive the existing slideshow-step model; timer start, pause, reset and editable duration behavior are unchanged.
- Loading and failure states retain the shared presenter status shell. The live presenter contains no fabricated audience count, question count or engagement metric.
- Web test suite: 700 passed. Web TypeScript validation, production build and `git diff --check` passed. The existing large-bundle warning remains.
- No actionable P0/P1/P2 findings remain.

final result: passed
