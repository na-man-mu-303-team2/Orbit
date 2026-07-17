# PR #453 Progressive Preview 정체·Grounding 병목·생성 정책 UI 개선

## 브랜치 통합 절차

- `origin/develop -> feature/ai-ppt-async-cover-preview` 병합은 반드시 `$git-merge-branches` 스킬 규칙을 따른다.
- 병합 전 `AGENTS.md`, `docs/git-rules.md`, 현재 브랜치·upstream·worktree·진행 중인 Git 작업을 확인한다.
- 기존 untracked 파일은 삭제·정리·stash하지 않는다. tracked 변경이나 진행 중인 merge/rebase가 있으면 병합 전에 중단하고 보고한다.
- `origin/develop`을 fetch한 뒤 merge-base, ahead/behind, incoming commit과 변경 경로를 확인한다.
- 이미 병합된 상태면 빈 merge commit을 만들지 않는다. 아니라면 `git merge --no-edit origin/develop`을 실행한다.
- 충돌 시:
  - 서로 다른 기능이면 두 동작을 보존하는 최소 변경으로 자동 통합한다.
  - 같은 기능의 상충하는 구현이면 계약·테스트·commit history를 조사하고 파일별 차이와 권장안을 한국어로 정리한 뒤 사용자 결정을 한 번만 요청한다.
  - PR #454의 실제 slide order 기반 Vision QA 수정은 보존한다.
- 병합 후 conflict marker와 unmerged entry가 없는지 확인하고 `git diff --check`, 최소 build/type 검증, `git merge-base --is-ancestor origin/develop HEAD`를 실행한다.
- merge 자체에서는 push하지 않는다. 아래 기능 구현과 기본 빌드까지 완료한 뒤 기존 PR #453 브랜치에 일반 push한다. rebase와 force push는 하지 않는다.

## 구현 변경

### 1. 입력 화면 정책 UI 복원

첨부파일 영역 아래에 기존 2열 정책 grid, 선택 버튼, 정보 아이콘, hover/focus tooltip을 복원한다. 모바일에서는 기존처럼 1열로 표시한다.

참고자료 활용 기준:

| 값 | 라벨 | 기존 툴팁 |
|---|---|---|
| `user-input-only` | 사용자 입력만 | 발표 주제와 Brief 입력만 사용합니다. 첨부 파일 분석과 웹 검색은 실행하지 않습니다. |
| `references-first` | 참고자료 우선 | 첨부 자료를 중심으로 구성하고 웹 출처로 보완합니다. 분석 가능한 첨부가 1개 이상 필요하며, 웹 검색 실패 시 첨부 자료만으로 계속합니다. |
| `references-only` | 참고자료만 사용 | 첨부한 모든 자료에서 분석 가능한 텍스트를 확보해야 합니다. 웹 검색 없이 첨부 자료만 근거로 생성합니다. |
| `research-first` | 웹 리서치 우선 | 웹 리서치를 중심으로 구성하고 첨부 자료는 방향 보정에 사용합니다. 출처가 부족해도 검증 가능한 범위에서 초안을 생성합니다. |

이미지 구성:

| 값 | 라벨 | 기존 툴팁 |
|---|---|---|
| `minimal` | 이미지 최소화 | 이미지 슬롯을 만들지 않고 도형과 타이포 중심으로 구성합니다. |
| `provided-only` | 첨부 이미지만 | 첨부 이미지에 사용 가능한 source가 있을 때만 사용합니다. source가 없으면 이미지 슬롯을 만들지 않습니다. |
| `public-assets` | 공개 이미지 구조 | 공개 이미지 사용을 전제로 visual plan과 교체 가능한 placeholder만 만듭니다. 현재는 이미지 검색, 라이선스 확인, 다운로드를 하지 않습니다. |
| `ai-generated` | AI 이미지 구조 | AI 이미지 생성을 전제로 이미지 계획과 교체 가능한 placeholder만 만듭니다. 현재 실제 이미지 파일은 생성하지 않습니다. |
| `hybrid` | 공식 + AI 이미지 | 공식 이미지를 근거 자료로 우선 사용하고, 분위기 연출이 필요한 장면만 AI 이미지 구조로 보완합니다. |

- 기본값은 `user-input-only`, `minimal`로 둔다.
- `references-first`, `references-only`는 첨부파일이 없으면 다음 단계 진행을 차단한다.
- 참고자료 정책은 root·Brief·Design의 `referencePolicy`, 이미지 정책은 `design.mediaPolicy`, `visualPlanPolicy.mediaPolicy`, `designPrompt`에 반영한다.
- Style & Color 갱신 시 저장된 정책을 보존한다.
- 별도 Reference 단계, 공식 이미지 전용 업로드, Side AI는 복원하지 않는다.

### 2. Preview 계약과 진행 상태

- `AiDeckPreviewResponse`에 `expectedSlideCountRange: { min, max }`와 `grounding` status를 추가한다.
- checkpoint 상태를 기준으로 `planning → grounding → composing → rendering → quality-check → ready`를 판정한다.
- `cover-slide` 성공 또는 fallback은 부모 진행률을 42%/40%로 올리지 않는다. 부모 진행률은 본 생성 파이프라인 milestone만 따른다.
- raw prompt, OCR, provider 응답과 내부 artifact는 노출하지 않는다.

### 3. 목차 확정 전 Progressive Preview

- content plan이 없으면 왼쪽 패널에 `5~8장 예정`과 8개 슬롯을 즉시 표시한다.
- 표지가 준비되면 1번에 실제 thumbnail을 표시하고 나머지는 번호가 있는 blur skeleton으로 표시한다.
- 1~5번은 생성 예정, 6~8번은 선택적으로 추가될 수 있는 슬롯으로 구분하고 가짜 제목은 만들지 않는다.
- content-planning 완료 후 실제 장수와 `title/message` 목차로 교체한다.
- 실제 slide는 현재 서버 계약대로 1번부터 이어진 연속 prefix만 공개한다.
- 500ms stagger, reduced-motion, 이전 slide 선택 후 자동 선택 중단을 유지한다.
- `ready`이고 마지막 slide까지 공개됐을 때만 canonical Deck을 invalidate하고 editor로 이동한다.

### 4. 안내 문구

- 공통 안내:

  `현재 화면은 슬라이드 구성 미리보기이며 검증 중 변경될 수 있습니다. Vision QA가 끝나면 편집기로 이동합니다.`

- 단계별 문구:
  - `grounding`: `첨부한 참고자료를 분석하고 있습니다.`
  - `composing`: `발표 목차와 슬라이드 구성을 정리하고 있습니다.`
  - `rendering`: `총 N장 중 M장을 만들었습니다.`
  - `quality-check`: `모든 슬라이드를 만들었습니다. 최종 품질을 확인하고 있어 일부 표현이 달라질 수 있습니다.`
- “모든 슬라이드를 만들었습니다”는 모든 실제 image-slide shard가 완료된 뒤에만 표시한다.

### 5. `references-first` 웹 보강 제한

- usable 첨부자료가 있으면 alias 생성·웹 검색·출처 검증 전체를 합쳐 최대 20초만 실행한다.
- monotonic deadline과 남은 시간 기준 provider timeout을 사용하며 이 경로의 SDK 내부 retry는 비활성화한다.
- 제한 시간이 끝나면 추가 호출과 미검증 citation을 버리고 첨부자료만으로 content-planning을 계속한다.
- `references-only`는 웹 검색을 실행하지 않고 `research-first`의 기존 최대 3회 검색은 유지한다.
- timeout 여부·소요 시간·시도 횟수만 안전한 업무 이벤트에 기록한다.

## 검증 및 완료 조건

- 정책 옵션·기본값·툴팁·payload 연결에 최소 회귀 테스트를 추가한다.
- 첨부 검증, 20초 fallback, cover 진행률, provisional 목차, 연속 prefix, editor handoff를 검증한다.
- 구현 후 실행 검증은 `corepack pnpm build`와 Python worker 이미지/import build로 제한한다. 상세 UI와 실제 생성은 사용자가 수동 테스트한다.
- 입력 화면에서 선택한 정책으로 다음 단계 클릭 시 content-planning이 시작된다.
- Style & Color 확정 직후 표지와 `5~8장 예정` 패널이 보인다.
- 42% 고정과 잘못된 완료 문구가 사라지고 실제 slide가 1번부터 공개된다.
- Vision QA와 publication 완료 전에는 canonical Deck과 editor 사용자 데이터를 변경하지 않는다.
