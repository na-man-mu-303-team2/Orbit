# Design QA — Contextual Brief Drawer Prototype

## 비교 기준

- Source visual truth: `/Users/donghyunkim/.codex/generated_images/019f5d2d-f632-72c0-a5e1-9e77d1b3d07a/exec-ff4372d6-404a-4e2b-9835-460b1e4d734f.png`
- Implementation screenshot: `qa/editor-brief-postfix-1440.png`
- Viewport: desktop `1440 × 1024`, mobile `390 × 844`
- State: AI 발표자료 생성에서 작성한 Brief를 에디터의 `발표 기준` 액션으로 다시 연 기본 보기 상태

## 비교 증거

- Full-view comparison: `qa/comparison-postfix-full.png`
- Focused drawer comparison: `qa/comparison-postfix-drawer.png`
- AI creation Brief screen: `qa/ai-brief.png`
- PPTX import Brief review: `qa/pptx-import.png`
- Mobile creation screen: `qa/ai-brief-mobile-full.png`
- Mobile editor drawer: `qa/editor-brief-mobile-final.png`

## Findings

- 최종 비교에서 handoff를 막는 P0/P1/P2 이슈는 없다.
- 선택 시안의 핵심 구조인 기존 editor canvas 유지, 392px 우측 drawer, 문서 수준 `발표 기준` trigger, summary-first Brief, cream impact note, black save action을 재현했다.
- AI 생성과 PPTX 가져오기에서는 Brief를 전체 단계로 보여주고, editor에서는 필요할 때 여는 drawer로 축소해 요청한 정보 구조를 유지한다.

## Comparison history

### Iteration 1

- **P2 — drawer hierarchy drift:** 구현에만 `PRESENTATION BRIEF` eyebrow가 추가되어 선택 시안보다 header가 한 단계 더 복잡했고, 보기 상태의 footer CTA가 `브리프 수정`으로 표시됐다.
- **Fix:** drawer eyebrow를 제거하고 footer CTA를 선택 시안과 같은 `변경사항 저장`으로 통일했다. 편집 진입은 header의 `수정` action이 담당한다.
- **Post-fix evidence:** `qa/editor-brief-postfix-1440.png`, `qa/comparison-postfix-drawer.png`.

### Iteration 2

- **P2 — mobile route continuity:** 긴 AI creation 화면에서 editor로 이동하면 이전 scroll 위치가 남아 mobile drawer header action이 첫 화면 밖으로 밀릴 수 있었다.
- **Fix:** screen 변경 시 scroll position을 상단으로 복원하고, mobile drawer header의 provenance text를 한 줄로 제한하며 action 영역을 고정 폭으로 보호했다.
- **Post-fix evidence:** `qa/editor-brief-mobile-final.png`; `scrollWidth === clientWidth` verified at 390px.

## Required fidelity surfaces

- **Fonts and typography:** ORBIT의 Pretendard/Inter stack과 compact editor UI scale을 사용했다. 제목, source metadata, section label, helper text의 위계와 줄바꿈이 선택 시안과 같은 밀도로 유지된다.
- **Spacing and layout rhythm:** editor background, slide rail, canvas, drawer의 비율을 유지했다. drawer는 `top: 126px`, `width: 392px`이며 header/content/footer grid로 persistent save action을 유지한다.
- **Colors and tokens:** Ink, Canvas, Surface, Border, Lilac, Cream, Mint semantic token을 사용했다. gradient와 과도한 shadow는 없다.
- **Image quality and assets:** ORBIT 제공 logo와 기존 editor reference raster를 원본 비율로 사용했다. UI icon은 Tabler outline family로 통일했으며 custom SVG/CSS art는 없다.
- **Copy and content:** Brief 변경이 향후 AI 제안과 rehearsal feedback에만 반영되고 기존 slide는 자동 변경되지 않는다는 핵심 결과를 명시했다. AI 생성과 PPTX 가져오기 source provenance도 구분된다.
- **Responsiveness and accessibility:** field label, native select/file input, pressed state, expanded state, status live region, focus ring을 제공한다. mobile drawer는 full-width surface로 전환되고 persistent footer action이 viewport 안에 남는다.

## Primary interactions tested

- AI creation Brief의 primary action이 editor로 이동하고 source provenance를 `AI 생성 시 작성`으로 표시한다.
- `PPTX 가져오기` 진입, AI 추출 Brief 확인, project import 후 editor 이동이 동작한다.
- `다시 선택`이 file upload state를 열고 native PPTX file control을 노출한다.
- editor에서 drawer 닫기와 `발표 기준`으로 다시 열기가 동작한다.
- editor에서 `수정` → field 변경 → `변경사항 저장` → success toast가 동작한다.
- desktop과 mobile clean browser tab의 console `error`/`warn`: 0건.

## Open questions

- 실제 production 연결 시 기존 slide에 새 Brief를 적용하는 별도 AI action은 명시적 사용자 요청과 backend contract가 정해진 뒤 추가해야 한다. 이 prototype에서는 자동 rewrite를 하지 않는다.

## Follow-up polish

- P3: production editor가 responsive layout contract를 확정하면 720px 이하에서 drawer를 full-screen sheet animation으로 전환할 수 있다.

final result: passed
